-- Dijital menü: misafir sipariş geçmişi (web localStorage + uygulama misafir oturumu)

BEGIN;

CREATE OR REPLACE FUNCTION public.get_public_kitchen_menu_orders(
  p_org_slug text,
  p_order_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_slug text := lower(btrim(coalesce(p_org_slug, '')));
  v_result jsonb;
BEGIN
  IF v_slug = '' OR p_order_ids IS NULL OR cardinality(p_order_ids) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(
    jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC),
    '[]'::jsonb
  )
  INTO v_result
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
    WHERE lower(btrim(o.org_slug)) = v_slug
      AND o.id = ANY (p_order_ids)
      AND o.status IN ('paid', 'pending_payment')
    LIMIT 50
  ) t;

  RETURN coalesce(v_result, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_public_kitchen_menu_orders(text, uuid[]) IS
  'Web QR menü — tarayıcıda saklanan sipariş kimlikleriyle geçmiş (anon).';

CREATE OR REPLACE FUNCTION public.get_public_kitchen_menu_order_by_payment(
  p_org_slug text,
  p_payment_request_id uuid,
  p_public_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_slug text := lower(btrim(coalesce(p_org_slug, '')));
  v_token text := btrim(coalesce(p_public_token, ''));
  v_row jsonb;
BEGIN
  IF v_slug = '' OR p_payment_request_id IS NULL OR v_token = '' THEN
    RETURN NULL;
  END IF;

  SELECT row_to_json(t)::jsonb
  INTO v_row
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
    JOIN public.payment_requests pr ON pr.id = o.payment_request_id
    WHERE lower(btrim(o.org_slug)) = v_slug
      AND pr.id = p_payment_request_id
      AND pr.public_token = v_token
    LIMIT 1
  ) t;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.get_public_kitchen_menu_order_by_payment(text, uuid, text) IS
  'Ödeme dönüşünde tek sipariş — payment_requests public_token ile doğrulanır.';

CREATE OR REPLACE FUNCTION public.get_guest_kitchen_menu_orders(p_limit int DEFAULT 40)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_guest_id uuid;
  v_lim int := greatest(1, least(coalesce(p_limit, 40), 80));
  v_result jsonb;
BEGIN
  SELECT g.id INTO v_guest_id
  FROM public.guests g
  WHERE g.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_guest_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(
    jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC),
    '[]'::jsonb
  )
  INTO v_result
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
    WHERE o.guest_id = v_guest_id
      AND o.status IN ('paid', 'pending_payment')
    ORDER BY o.created_at DESC
    LIMIT v_lim
  ) t;

  RETURN coalesce(v_result, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_guest_kitchen_menu_orders(int) IS
  'Misafir uygulaması — oturumdaki misafirin dijital menü siparişleri.';

GRANT EXECUTE ON FUNCTION public.get_public_kitchen_menu_orders(text, uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_kitchen_menu_order_by_payment(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_guest_kitchen_menu_orders(int) TO authenticated;

COMMIT;
