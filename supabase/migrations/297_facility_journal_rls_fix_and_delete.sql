BEGIN;

-- Sonsuz RLS döngüsü: records_select ↔ access_select ↔ facility_journal_can_view_record
-- Çözüm: yardımcı fonksiyonlarda row_security = off; access/medya politikalarında döngüsüz ifadeler.

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

COMMENT ON FUNCTION public.facility_journal_user_owns_record(uuid) IS
  'Tesis günlüğü: kaydı oluşturan personel (RLS döngüsü olmadan).';

-- Medya: görüntüleme
DROP POLICY IF EXISTS facility_journal_media_select ON public.facility_journal_media;
CREATE POLICY facility_journal_media_select ON public.facility_journal_media
  FOR SELECT TO authenticated
  USING (public.facility_journal_can_view_record(record_id));

-- Medya: ekleme (yeni kayıt — henüz access satırı olmadan oluşturan yükleyebilir)
DROP POLICY IF EXISTS facility_journal_media_insert ON public.facility_journal_media;
CREATE POLICY facility_journal_media_insert ON public.facility_journal_media
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.facility_journal_records r
      WHERE r.id = record_id
        AND r.organization_id = public.current_staff_organization_id()
        AND (
          public.current_user_is_staff_admin()
          OR r.created_by_staff_id = public.current_staff_id()
        )
    )
    AND (
      public.current_user_is_staff_admin()
      OR public.staff_has_facility_journal_permission()
    )
  );

-- Medya: silme
DROP POLICY IF EXISTS facility_journal_media_delete ON public.facility_journal_media;
CREATE POLICY facility_journal_media_delete ON public.facility_journal_media
  FOR DELETE TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR public.facility_journal_user_owns_record(record_id)
  );

-- Erişim listesi: can_view_record kullanma (döngü kırılır)
DROP POLICY IF EXISTS facility_journal_access_select ON public.facility_journal_record_access;
CREATE POLICY facility_journal_access_select ON public.facility_journal_record_access
  FOR SELECT TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR staff_id = public.current_staff_id()
    OR public.facility_journal_user_owns_record(record_id)
    OR EXISTS (
      SELECT 1
      FROM public.facility_journal_records r
      WHERE r.id = record_id
        AND r.organization_id = public.current_staff_organization_id()
        AND (
          public.current_user_is_staff_admin()
          OR r.created_by_staff_id = public.current_staff_id()
        )
    )
  );

DROP POLICY IF EXISTS facility_journal_access_write ON public.facility_journal_record_access;
DROP POLICY IF EXISTS facility_journal_access_insert ON public.facility_journal_record_access;
DROP POLICY IF EXISTS facility_journal_access_update ON public.facility_journal_record_access;
DROP POLICY IF EXISTS facility_journal_access_delete ON public.facility_journal_record_access;

CREATE POLICY facility_journal_access_insert ON public.facility_journal_record_access
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_staff_admin()
    OR public.facility_journal_user_owns_record(record_id)
  );

CREATE POLICY facility_journal_access_update ON public.facility_journal_record_access
  FOR UPDATE TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR public.facility_journal_user_owns_record(record_id)
  )
  WITH CHECK (
    public.current_user_is_staff_admin()
    OR public.facility_journal_user_owns_record(record_id)
  );

CREATE POLICY facility_journal_access_delete ON public.facility_journal_record_access
  FOR DELETE TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR public.facility_journal_user_owns_record(record_id)
  );

-- Kayıt silme: admin veya kaydı oluşturan (tesis_gunlugu yetkisi ile)
DROP POLICY IF EXISTS facility_journal_records_delete_admin ON public.facility_journal_records;
DROP POLICY IF EXISTS facility_journal_records_delete ON public.facility_journal_records;
CREATE POLICY facility_journal_records_delete ON public.facility_journal_records
  FOR DELETE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND (
      public.current_user_is_staff_admin()
      OR (
        created_by_staff_id = public.current_staff_id()
        AND public.staff_has_facility_journal_permission()
      )
    )
  );

COMMIT;
