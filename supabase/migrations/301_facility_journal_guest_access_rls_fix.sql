BEGIN;

-- Uzak DB'de sürüm 300 başka dosyayla dolu olabilir; tablo yoksa burada oluşturulur (idempotent).
CREATE OR REPLACE FUNCTION public.current_guest_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT g.id
  FROM public.guests g
  WHERE g.auth_user_id = auth.uid()
    AND g.deleted_at IS NULL
  LIMIT 1;
$$;

CREATE TABLE IF NOT EXISTS public.facility_journal_record_guest_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.facility_journal_records(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  can_view boolean NOT NULL DEFAULT true,
  granted_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facility_journal_record_guest_access_uniq UNIQUE (record_id, guest_id)
);

CREATE INDEX IF NOT EXISTS idx_facility_journal_record_guest_access_guest
  ON public.facility_journal_record_guest_access (guest_id, record_id);

CREATE OR REPLACE FUNCTION public.facility_journal_guest_can_view_record(p_record_id uuid)
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
      AND r.organization_id = public.current_guest_organization_id()
      AND r.status = 'published'
      AND EXISTS (
        SELECT 1
        FROM public.facility_journal_record_guest_access g
        WHERE g.record_id = r.id
          AND g.guest_id = public.current_guest_id()
          AND g.can_view = true
      )
  );
$$;

ALTER TABLE public.facility_journal_record_guest_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS facility_journal_guest_access_select ON public.facility_journal_record_guest_access;
CREATE POLICY facility_journal_guest_access_select ON public.facility_journal_record_guest_access
  FOR SELECT TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR guest_id = public.current_guest_id()
    OR public.facility_journal_user_owns_record(record_id)
  );

DROP POLICY IF EXISTS facility_journal_records_select_guest ON public.facility_journal_records;
CREATE POLICY facility_journal_records_select_guest ON public.facility_journal_records
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_guest_organization_id()
    AND status = 'published'
    AND public.facility_journal_guest_can_view_record(id)
  );

DROP POLICY IF EXISTS facility_journal_media_select_guest ON public.facility_journal_media;
CREATE POLICY facility_journal_media_select_guest ON public.facility_journal_media
  FOR SELECT TO authenticated
  USING (public.facility_journal_guest_can_view_record(record_id));

-- Misafir erişim INSERT RLS düzeltmesi
CREATE OR REPLACE FUNCTION public.facility_journal_can_grant_record_access(p_record_id uuid)
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
    INNER JOIN public.staff s ON s.auth_id = auth.uid()
      AND COALESCE(s.is_active, true) = true
      AND s.deleted_at IS NULL
    WHERE r.id = p_record_id
      AND r.organization_id = s.organization_id
      AND (
        EXISTS (SELECT 1 FROM public.admin_auth_ids a WHERE a.auth_id = auth.uid())
        OR (
          r.created_by_staff_id = s.id
          AND (
            s.role = 'admin'
            OR (s.app_permissions->>'tesis_gunlugu') IN ('true', 't', '1', 'True', 'TRUE')
          )
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
  SELECT public.facility_journal_can_grant_record_access(p_record_id);
$$;

DROP POLICY IF EXISTS facility_journal_guest_access_write ON public.facility_journal_record_guest_access;
DROP POLICY IF EXISTS facility_journal_guest_access_insert ON public.facility_journal_record_guest_access;
DROP POLICY IF EXISTS facility_journal_guest_access_update ON public.facility_journal_record_guest_access;
DROP POLICY IF EXISTS facility_journal_guest_access_delete ON public.facility_journal_record_guest_access;

CREATE POLICY facility_journal_guest_access_insert ON public.facility_journal_record_guest_access
  FOR INSERT TO authenticated
  WITH CHECK (public.facility_journal_can_grant_record_access(record_id));

CREATE POLICY facility_journal_guest_access_update ON public.facility_journal_record_guest_access
  FOR UPDATE TO authenticated
  USING (public.facility_journal_can_grant_record_access(record_id))
  WITH CHECK (public.facility_journal_can_grant_record_access(record_id));

CREATE POLICY facility_journal_guest_access_delete ON public.facility_journal_record_guest_access
  FOR DELETE TO authenticated
  USING (public.facility_journal_can_grant_record_access(record_id));

DROP POLICY IF EXISTS facility_journal_access_insert ON public.facility_journal_record_access;
DROP POLICY IF EXISTS facility_journal_access_update ON public.facility_journal_record_access;
DROP POLICY IF EXISTS facility_journal_access_delete ON public.facility_journal_record_access;

CREATE POLICY facility_journal_access_insert ON public.facility_journal_record_access
  FOR INSERT TO authenticated
  WITH CHECK (public.facility_journal_can_grant_record_access(record_id));

CREATE POLICY facility_journal_access_update ON public.facility_journal_record_access
  FOR UPDATE TO authenticated
  USING (public.facility_journal_can_grant_record_access(record_id))
  WITH CHECK (public.facility_journal_can_grant_record_access(record_id));

CREATE POLICY facility_journal_access_delete ON public.facility_journal_record_access
  FOR DELETE TO authenticated
  USING (public.facility_journal_can_grant_record_access(record_id));

DROP POLICY IF EXISTS facility_journal_media_insert ON public.facility_journal_media;
CREATE POLICY facility_journal_media_insert ON public.facility_journal_media
  FOR INSERT TO authenticated
  WITH CHECK (
    public.facility_journal_can_grant_record_access(record_id)
    AND (
      public.current_user_is_staff_admin()
      OR public.staff_has_facility_journal_permission()
    )
  );

COMMIT;
