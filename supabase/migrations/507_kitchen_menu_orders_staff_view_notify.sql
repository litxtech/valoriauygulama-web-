-- Bildirim alıcıları ve aynı otel personeli dijital menü siparişlerini görebilsin (RPC = RLS ile uyumlu)

BEGIN;

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
            OR EXISTS (
              SELECT 1
              FROM public.kitchen_ops_settings kos
              WHERE kos.organization_id = p_org_id
                AND s.id = ANY (kos.menu_order_notify_staff_ids)
            )
            OR s.role IN ('receptionist', 'reception_chief', 'manager')
          )
        )
      )
  );
$$;

COMMENT ON FUNCTION public.staff_can_view_kitchen_menu_orders(uuid) IS
  'Dijital menü siparişleri — mutfak, menü yöneticisi, bildirim alıcıları ve aynı otel personeli.';

COMMIT;
