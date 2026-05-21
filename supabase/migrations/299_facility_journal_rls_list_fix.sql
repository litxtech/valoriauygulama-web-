BEGIN;

-- GET facility_journal_records + embed media → 42P17
-- Döngü: records_select → access tablosu → access_select → records SELECT → …
-- Çözüm: görünürlük tek SECURITY DEFINER fonksiyonda (row_security off); access_select records’a bakmaz.

CREATE OR REPLACE FUNCTION public.staff_has_facility_journal_permission()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT COALESCE(
    (
      SELECT
        s.role = 'admin'
        OR (s.app_permissions->>'tesis_gunlugu') IN ('true', 't', '1', 'True', 'TRUE')
      FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND COALESCE(s.is_active, true) = true
        AND s.deleted_at IS NULL
      LIMIT 1
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.facility_journal_can_view_record(p_record_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.facility_journal_records r
    WHERE r.id = p_record_id
      AND r.organization_id = public.current_staff_organization_id()
      AND (
        public.current_user_is_staff_admin()
        OR r.created_by_staff_id = public.current_staff_id()
        OR EXISTS (
          SELECT 1
          FROM public.facility_journal_record_access a
          WHERE a.record_id = r.id
            AND a.staff_id = public.current_staff_id()
            AND a.can_view = true
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.facility_journal_user_owns_record(p_record_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.facility_journal_records r
    WHERE r.id = p_record_id
      AND r.organization_id = public.current_staff_organization_id()
      AND r.created_by_staff_id = public.current_staff_id()
  );
$$;

-- Kayıt listesi / detay
DROP POLICY IF EXISTS facility_journal_records_select ON public.facility_journal_records;
CREATE POLICY facility_journal_records_select ON public.facility_journal_records
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.facility_journal_can_view_record(id)
  );

-- Medya (embed select) — fonksiyon; records/access politikalarına doğrudan EXISTS yok
DROP POLICY IF EXISTS facility_journal_media_select ON public.facility_journal_media;
CREATE POLICY facility_journal_media_select ON public.facility_journal_media
  FOR SELECT TO authenticated
  USING (public.facility_journal_can_view_record(record_id));

DROP POLICY IF EXISTS facility_journal_media_insert ON public.facility_journal_media;
CREATE POLICY facility_journal_media_insert ON public.facility_journal_media
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      public.current_user_is_staff_admin()
      OR public.facility_journal_user_owns_record(record_id)
    )
    AND (
      public.current_user_is_staff_admin()
      OR public.staff_has_facility_journal_permission()
    )
  );

-- Erişim listesi: records tablosuna SELECT yok (döngü kırılır)
DROP POLICY IF EXISTS facility_journal_access_select ON public.facility_journal_record_access;
CREATE POLICY facility_journal_access_select ON public.facility_journal_record_access
  FOR SELECT TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR staff_id = public.current_staff_id()
    OR public.facility_journal_user_owns_record(record_id)
  );

-- Storage: dosya boyutu sınırı kaldır (süre/MB uygulama tarafında sınırlanmaz)
UPDATE storage.buckets
SET file_size_limit = NULL
WHERE id = 'facility-journal';

COMMIT;
