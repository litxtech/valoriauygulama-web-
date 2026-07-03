-- Dijital menü sipariş RPC yetkisi = kitchen_menu_orders RLS ile aynı (aynı otel personeli)

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
        s.role = 'admin'
        OR s.organization_id = p_org_id
      )
  );
$$;

COMMENT ON FUNCTION public.staff_can_view_kitchen_menu_orders(uuid) IS
  'Dijital menü siparişleri — RLS ile uyumlu: admin veya aynı organizasyon personeli.';

COMMIT;
