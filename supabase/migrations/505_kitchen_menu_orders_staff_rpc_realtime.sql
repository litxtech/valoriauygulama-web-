-- Mutfak: dijital menü siparişleri — staff RPC + realtime

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'kitchen_menu_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.kitchen_menu_orders;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.staff_can_view_kitchen_menu_orders(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.auth_id = auth.uid()
      AND COALESCE(s.is_active, true) = true
      AND s.deleted_at IS NULL
      AND (
        (public.current_user_is_staff_admin() AND s.role = 'admin')
        OR (
          s.organization_id = p_org_id
          AND (
            s.role = 'admin'
            OR COALESCE(s.app_permissions @> '{"mutfak_operasyon": true}'::jsonb, false)
            OR public.staff_hotel_kitchen_menu_perm_ok(COALESCE(s.app_permissions, '{}'::jsonb), s.role)
            OR lower(trim(coalesce(s.department, ''))) = ANY (
              ARRAY['kitchen', 'kitchen_staff', 'mutfak', 'chef', 'head_chef', 'pastry']
            )
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_staff_kitchen_menu_orders(
  p_organization_id uuid,
  p_paid_limit int DEFAULT 40,
  p_pending_hours int DEFAULT 24
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_paid_lim int := greatest(1, least(coalesce(p_paid_limit, 40), 100));
  v_pending_since timestamptz := now() - make_interval(hours => greatest(1, least(coalesce(p_pending_hours, 24), 72)));
  v_pending jsonb;
  v_paid jsonb;
BEGIN
  IF p_organization_id IS NULL THEN
    RETURN jsonb_build_object('pending', '[]'::jsonb, 'paid', '[]'::jsonb);
  END IF;

  IF NOT public.staff_can_view_kitchen_menu_orders(p_organization_id) THEN
    RAISE EXCEPTION 'Dijital menü siparişleri için yetkiniz yok';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_pending
  FROM (
    SELECT
      o.id,
      o.org_slug,
      o.status,
      o.total_amount,
      o.currency,
      o.customer_name,
      o.customer_email,
      o.room_number,
      o.table_number,
      o.guest_hotel_name,
      o.delivery_address,
      o.paid_at,
      o.created_at,
      (
        SELECT coalesce(
          jsonb_agg(
            jsonb_build_object(
              'item_name', i.item_name,
              'quantity', i.quantity,
              'unit_price', i.unit_price,
              'line_total', i.line_total
            )
            ORDER BY i.created_at
          ),
          '[]'::jsonb
        )
        FROM public.kitchen_menu_order_items i
        WHERE i.order_id = o.id
      ) AS items
    FROM public.kitchen_menu_orders o
    WHERE o.organization_id = p_organization_id
      AND o.status = 'pending_payment'
      AND o.created_at >= v_pending_since
    ORDER BY o.created_at DESC
    LIMIT 30
  ) t;

  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.sort_at DESC), '[]'::jsonb)
  INTO v_paid
  FROM (
    SELECT
      o.id,
      o.org_slug,
      o.status,
      o.total_amount,
      o.currency,
      o.customer_name,
      o.customer_email,
      o.room_number,
      o.table_number,
      o.guest_hotel_name,
      o.delivery_address,
      o.paid_at,
      o.created_at,
      coalesce(o.paid_at, o.created_at) AS sort_at,
      (
        SELECT coalesce(
          jsonb_agg(
            jsonb_build_object(
              'item_name', i.item_name,
              'quantity', i.quantity,
              'unit_price', i.unit_price,
              'line_total', i.line_total
            )
            ORDER BY i.created_at
          ),
          '[]'::jsonb
        )
        FROM public.kitchen_menu_order_items i
        WHERE i.order_id = o.id
      ) AS items
    FROM public.kitchen_menu_orders o
    WHERE o.organization_id = p_organization_id
      AND o.status = 'paid'
    ORDER BY coalesce(o.paid_at, o.created_at) DESC
    LIMIT v_paid_lim
  ) t;

  RETURN jsonb_build_object('pending', coalesce(v_pending, '[]'::jsonb), 'paid', coalesce(v_paid, '[]'::jsonb));
END;
$$;

COMMENT ON FUNCTION public.get_staff_kitchen_menu_orders(uuid, int, int) IS
  'Mutfak paneli — ödeme bekleyen sepetler ve ödenen dijital menü siparişleri.';

GRANT EXECUTE ON FUNCTION public.staff_can_view_kitchen_menu_orders(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_kitchen_menu_orders(uuid, int, int) TO authenticated;

COMMIT;
