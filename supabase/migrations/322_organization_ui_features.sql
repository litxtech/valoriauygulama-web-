-- İşletme bazında uygulama özellikleri: aç/kapa ve yerleşim (sekme, profil, hamburger, header).

BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ui_features JSONB NOT NULL DEFAULT '{"v":1,"features":{}}'::jsonb;

COMMENT ON COLUMN public.organizations.ui_features IS
  'Personel ve misafir uygulamasında özellik görünürlüğü: { "v":1, "features": { "map": { "enabled": true, "placements": ["tab","hamburger"] } } }';

DROP POLICY IF EXISTS "organizations_update_admin" ON public.organizations;
CREATE POLICY "organizations_update_admin"
  ON public.organizations FOR UPDATE TO authenticated
  USING (public.current_user_is_staff_admin())
  WITH CHECK (public.current_user_is_staff_admin());

COMMIT;
