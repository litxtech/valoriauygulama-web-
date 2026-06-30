-- Kamera talepleri: admin org eşleşmesi olmadan yönetebilsin (video yükleme RLS/RPC).

BEGIN;

CREATE OR REPLACE FUNCTION public.staff_can_manage_breakfast_partners(p_org_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT
        s.role = 'admin'
        OR public.staff_has_app_permission('super_admin')
      FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND COALESCE(s.is_active, true) = true
        AND s.deleted_at IS NULL
        AND (
          p_org_id IS NULL
          OR s.organization_id = p_org_id
          OR s.role = 'admin'
          OR public.staff_has_app_permission('super_admin')
        )
      LIMIT 1
    ),
    false
  );
$$;

COMMIT;
