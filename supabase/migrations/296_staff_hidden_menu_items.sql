-- Personel hamburger menüsünde admin tarafından gizlenen öğe kimlikleri (yetki sisteminden bağımsız UI kısıtı).

BEGIN;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS hidden_menu_item_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.staff.hidden_menu_item_ids IS
  'Gizlenen hamburger menü öğe id listesi (ör. tasks, stock). Yetki verilmiş olsa bile menüde görünmez; doğrudan URL erişimi ayrıca kısıtlanmaz.';

-- RETURNS TABLE kolonu değiştiği için CREATE OR REPLACE yeterli değil; önce DROP gerekir.
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
  hidden_menu_item_ids jsonb
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
    COALESCE(s.hidden_menu_item_ids, '[]'::jsonb)
  FROM public.staff s
  WHERE s.auth_id = auth.uid()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_my_staff_session() IS
  'Oturum kullanıcısının tek staff satırı; hidden_menu_item_ids dahil.';

REVOKE ALL ON FUNCTION public.get_my_staff_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_staff_session() TO authenticated;

COMMIT;
