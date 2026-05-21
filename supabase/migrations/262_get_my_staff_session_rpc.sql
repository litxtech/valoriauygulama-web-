-- Mobil açılış: staff tablosu RLS + yük altında 504. Tek satır, auth.uid() ile SECURITY DEFINER.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_staff_session()
RETURNS TABLE (
  id uuid,
  auth_id uuid,
  email text,
  full_name text,
  role text,
  department text,
  profile_image text,
  work_status text,
  is_active boolean,
  banned_until timestamptz,
  deleted_at timestamptz,
  app_permissions jsonb,
  organization_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.auth_id,
    s.email,
    s.full_name,
    s.role,
    s.department,
    s.profile_image,
    s.work_status,
    s.is_active,
    s.banned_until,
    s.deleted_at,
    s.app_permissions,
    s.organization_id
  FROM public.staff s
  WHERE s.auth_id = auth.uid()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_my_staff_session() IS
  'Oturum kullanıcısının tek staff satırı; mobil auth bootstrap için RLS bypass.';

REVOKE ALL ON FUNCTION public.get_my_staff_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_staff_session() TO authenticated;

COMMIT;
