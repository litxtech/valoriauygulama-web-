-- Admin: personel hesabını anında kilitle / kilidi aç (mobilde realtime ile ekranda gösterilir).

BEGIN;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS account_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS account_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_locked_by uuid REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS account_lock_reason text;

COMMENT ON COLUMN public.staff.account_locked IS 'Admin kilidi; true ise personel uygulamada kilit ekranı görür';
COMMENT ON COLUMN public.staff.account_locked_at IS 'Son kilitleme zamanı';
COMMENT ON COLUMN public.staff.account_locked_by IS 'Kilitleyen admin personel id';
COMMENT ON COLUMN public.staff.account_lock_reason IS 'Opsiyonel kilitleme gerekçesi';

DROP FUNCTION IF EXISTS public.get_my_staff_session();

CREATE FUNCTION public.get_my_staff_session()
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
  organization_id uuid,
  hidden_menu_item_ids jsonb,
  account_locked boolean
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
    s.organization_id,
    COALESCE(s.hidden_menu_item_ids, '[]'::jsonb),
    s.account_locked
  FROM public.staff s
  WHERE s.auth_id = auth.uid()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_my_staff_session() IS
  'Oturum kullanıcısının tek staff satırı; account_locked dahil.';

REVOKE ALL ON FUNCTION public.get_my_staff_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_staff_session() TO authenticated;

COMMIT;
