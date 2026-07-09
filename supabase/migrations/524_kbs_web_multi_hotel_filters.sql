-- valoria.tr/kbs: süper yönetici / admin tüm ops otellerinin kimlik çekimlerini görebilir.

BEGIN;

CREATE OR REPLACE FUNCTION public.kbs_web_can_view_all_hotels()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, ops
AS $$
  SELECT
    public.staff_has_app_permission('super_admin')
    OR public.current_user_is_staff_admin()
    OR EXISTS (
      SELECT 1
      FROM public.admin_auth_ids a
      WHERE a.auth_id = auth.uid()
    )
    OR COALESCE(ops.is_admin(), false);
$$;

COMMENT ON FUNCTION public.kbs_web_can_view_all_hotels() IS
  'KBS web paneli: tüm ops otellerinin çekim listesini görebilir (super_admin / staff admin / ops admin).';

CREATE OR REPLACE FUNCTION public.kbs_web_list_hotels()
RETURNS TABLE(id uuid, code text, name text, short_label text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, ops
AS $$
  SELECT
    h.id,
    h.code,
    h.name,
    CASE
      WHEN h.code ILIKE 'valoria%' OR h.name ILIKE '%valoria%' THEN 'Valoria'
      WHEN h.code ILIKE 'bavul-suite%' OR h.name ILIKE '%bavul suite%' THEN 'Bavul Suite'
      WHEN h.code ILIKE 'bavultur%' OR h.name ILIKE '%bavultur%' THEN 'Bavultur'
      ELSE regexp_replace(h.name, '\s*\(OPS\)\s*$', '', 'i')
    END AS short_label
  FROM ops.hotels h
  WHERE public.kbs_web_can_view_all_hotels()
     OR h.id = ops.current_hotel_id()
  ORDER BY h.name;
$$;

REVOKE ALL ON FUNCTION public.kbs_web_list_hotels() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kbs_web_list_hotels() TO authenticated;

DROP POLICY IF EXISTS "ops_hotels_select_kbs_web_super" ON ops.hotels;
CREATE POLICY "ops_hotels_select_kbs_web_super"
  ON ops.hotels FOR SELECT TO authenticated
  USING (public.kbs_web_can_view_all_hotels());

DROP POLICY IF EXISTS "ops_guest_documents_select_kbs_web_super" ON ops.guest_documents;
CREATE POLICY "ops_guest_documents_select_kbs_web_super"
  ON ops.guest_documents FOR SELECT TO authenticated
  USING (public.kbs_web_can_view_all_hotels());

COMMIT;
