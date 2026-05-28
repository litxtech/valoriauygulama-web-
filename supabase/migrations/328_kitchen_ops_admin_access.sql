-- Admin / yönetim paneli kullanıcıları mutfak operasyon modülüne erişebilsin (yalnızca mutfak departmanı değil).

BEGIN;

CREATE OR REPLACE FUNCTION public.staff_has_kitchen_ops_access()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.auth_id = auth.uid()
      AND s.is_active = true
      AND s.deleted_at IS NULL
      AND (
        public.current_user_is_staff_admin()
        OR s.role = 'admin'
        OR (s.app_permissions->>'gorev_ata')::boolean IS TRUE
        OR public.staff_has_app_permission('mutfak_operasyon')
        OR lower(coalesce(s.department, '')) IN ('kitchen', 'kitchen_staff', 'mutfak', 'chef', 'head_chef', 'pastry')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.staff_has_kitchen_reception_access()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.auth_id = auth.uid()
      AND s.is_active = true
      AND s.deleted_at IS NULL
      AND (
        public.current_user_is_staff_admin()
        OR s.role = 'admin'
        OR (s.app_permissions->>'gorev_ata')::boolean IS TRUE
        OR s.role = 'reception_chief'
        OR public.staff_has_app_permission('reception_mutfak_muhasebe')
      )
  );
$$;

COMMIT;
