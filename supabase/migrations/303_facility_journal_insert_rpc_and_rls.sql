BEGIN;

-- POST facility_journal_records + select=id,reference_code → 403 (42501)
-- INSERT WITH CHECK veya RETURNING sonrası SELECT RLS (current_staff_id/org NULL veya uyumsuz).
-- Çözüm: oturum staff satırı tek fonksiyonda (row_security off) + SECURITY DEFINER RPC insert.

CREATE OR REPLACE FUNCTION public.facility_journal_current_staff()
RETURNS TABLE (staff_id uuid, organization_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT s.id, s.organization_id
  FROM public.staff s
  WHERE s.auth_id = auth.uid()
    AND COALESCE(s.is_active, true) = true
    AND s.deleted_at IS NULL
  LIMIT 1;
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
    INNER JOIN public.facility_journal_current_staff() cs ON cs.organization_id = r.organization_id
    WHERE r.id = p_record_id
      AND (
        EXISTS (SELECT 1 FROM public.admin_auth_ids a WHERE a.auth_id = auth.uid())
        OR r.created_by_staff_id = cs.staff_id
        OR EXISTS (
          SELECT 1
          FROM public.facility_journal_record_access a
          WHERE a.record_id = r.id
            AND a.staff_id = cs.staff_id
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
    INNER JOIN public.facility_journal_current_staff() cs ON cs.organization_id = r.organization_id
    WHERE r.id = p_record_id
      AND r.created_by_staff_id = cs.staff_id
  );
$$;

CREATE OR REPLACE FUNCTION public.facility_journal_can_insert_row(
  p_organization_id uuid,
  p_created_by_staff_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.facility_journal_current_staff() cs
    WHERE cs.staff_id = p_created_by_staff_id
      AND cs.organization_id = p_organization_id
      AND (
        EXISTS (SELECT 1 FROM public.admin_auth_ids a WHERE a.auth_id = auth.uid())
        OR public.staff_has_facility_journal_permission()
      )
  );
$$;

DROP POLICY IF EXISTS facility_journal_records_insert ON public.facility_journal_records;
CREATE POLICY facility_journal_records_insert ON public.facility_journal_records
  FOR INSERT TO authenticated
  WITH CHECK (
    public.facility_journal_can_insert_row(organization_id, created_by_staff_id)
  );

DROP POLICY IF EXISTS facility_journal_records_select ON public.facility_journal_records;
CREATE POLICY facility_journal_records_select ON public.facility_journal_records
  FOR SELECT TO authenticated
  USING (
    public.facility_journal_can_view_record(id)
    OR (
      EXISTS (
        SELECT 1
        FROM public.facility_journal_current_staff() cs
        WHERE cs.organization_id = facility_journal_records.organization_id
          AND facility_journal_records.created_by_staff_id = cs.staff_id
      )
      AND public.staff_has_facility_journal_permission()
    )
  );

-- Kayıt oluşturma: RLS + RETURNING bypass (mobil .select() yerine RPC)
CREATE OR REPLACE FUNCTION public.facility_journal_create_record(
  p_type_id uuid,
  p_title text,
  p_description text DEFAULT NULL,
  p_location_detail text DEFAULT NULL,
  p_counterparty_name text DEFAULT NULL,
  p_record_date date DEFAULT NULL,
  p_status text DEFAULT 'published'
)
RETURNS TABLE (id uuid, reference_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_staff_id uuid;
  v_org_id uuid;
  v_row public.facility_journal_records%ROWTYPE;
BEGIN
  SELECT cs.staff_id, cs.organization_id
  INTO v_staff_id, v_org_id
  FROM public.facility_journal_current_staff() cs;

  IF v_staff_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Personel oturumu bulunamadı';
  END IF;

  IF NOT public.facility_journal_can_insert_row(v_org_id, v_staff_id) THEN
    RAISE EXCEPTION 'Tesis günlüğü kaydı oluşturma yetkisi yok';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('draft', 'published', 'archived') THEN
    RAISE EXCEPTION 'Geçersiz durum: %', p_status;
  END IF;

  INSERT INTO public.facility_journal_records (
    organization_id,
    type_id,
    title,
    description,
    location_detail,
    counterparty_name,
    record_date,
    status,
    created_by_staff_id
  )
  VALUES (
    v_org_id,
    p_type_id,
    trim(p_title),
    NULLIF(trim(COALESCE(p_description, '')), ''),
    NULLIF(trim(COALESCE(p_location_detail, '')), ''),
    NULLIF(trim(COALESCE(p_counterparty_name, '')), ''),
    COALESCE(p_record_date, (CURRENT_DATE)),
    COALESCE(NULLIF(trim(p_status), ''), 'published'),
    v_staff_id
  )
  RETURNING * INTO v_row;

  id := v_row.id;
  reference_code := v_row.reference_code;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.facility_journal_create_record(uuid, text, text, text, text, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.facility_journal_create_record(uuid, text, text, text, text, date, text) TO authenticated;

COMMENT ON FUNCTION public.facility_journal_create_record IS
  'Tesis günlüğü kaydı — auth.uid() personel satırı; mobil INSERT+RETURNING RLS 403 önleme';

COMMIT;
