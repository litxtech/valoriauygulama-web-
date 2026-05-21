BEGIN;

-- Tesis günlüğü: kiralama devri, zimmet, emanet, değişiklik kayıtları (foto + video).
-- Kayıt tipleri admin tarafından tanımlanır; personel yalnızca app_permissions.tesis_gunlugu ile kayıt açar.
-- Görüntüleme: admin, kaydı oluşturan veya facility_journal_record_access ile yetkilendirilen personel.

-- ---------- Yetki yardımcıları ----------
CREATE OR REPLACE FUNCTION public.staff_has_facility_journal_permission()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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

COMMENT ON FUNCTION public.staff_has_facility_journal_permission() IS
  'Tesis günlüğü: admin veya app_permissions.tesis_gunlugu';

CREATE OR REPLACE FUNCTION public.facility_journal_can_manage_types()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_is_staff_admin();
$$;

-- ---------- Kayıt tipleri (admin tanımlar) ----------
CREATE TABLE IF NOT EXISTS public.facility_journal_record_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  slug text NOT NULL,
  icon text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facility_journal_record_types_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT facility_journal_record_types_slug_not_blank CHECK (length(trim(slug)) > 0),
  CONSTRAINT facility_journal_record_types_org_slug_uniq UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_facility_journal_record_types_org
  ON public.facility_journal_record_types (organization_id, sort_order ASC, name ASC);

-- ---------- Kayıtlar ----------
CREATE TABLE IF NOT EXISTS public.facility_journal_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  type_id uuid NOT NULL REFERENCES public.facility_journal_record_types(id) ON DELETE RESTRICT,
  reference_code text NOT NULL,
  title text NOT NULL,
  description text,
  location_detail text,
  counterparty_name text,
  record_date date NOT NULL DEFAULT (CURRENT_DATE),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_by_staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facility_journal_records_title_not_blank CHECK (length(trim(title)) > 0),
  CONSTRAINT facility_journal_records_reference_not_blank CHECK (length(trim(reference_code)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_facility_journal_records_org_reference
  ON public.facility_journal_records (organization_id, reference_code);
CREATE INDEX IF NOT EXISTS idx_facility_journal_records_org_created
  ON public.facility_journal_records (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_facility_journal_records_type
  ON public.facility_journal_records (type_id);

-- ---------- Medya (foto + video) ----------
CREATE TABLE IF NOT EXISTS public.facility_journal_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.facility_journal_records(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  storage_path text NOT NULL,
  public_url text NOT NULL,
  thumbnail_url text,
  label text NOT NULL DEFAULT 'general' CHECK (label IN ('general', 'before', 'after')),
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facility_journal_media_record
  ON public.facility_journal_media (record_id, sort_order, created_at);

-- ---------- Kayıt bazında görüntüleme yetkisi ----------
CREATE TABLE IF NOT EXISTS public.facility_journal_record_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.facility_journal_records(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  can_view boolean NOT NULL DEFAULT true,
  granted_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facility_journal_record_access_uniq UNIQUE (record_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_facility_journal_record_access_staff
  ON public.facility_journal_record_access (staff_id, record_id);

-- Tablolar oluşturulduktan sonra (CREATE FUNCTION içinde tablo referansı gerekir)
CREATE OR REPLACE FUNCTION public.facility_journal_can_view_record(p_record_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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

COMMENT ON FUNCTION public.facility_journal_can_view_record(uuid) IS
  'Tesis günlüğü kaydı: admin, oluşturan veya erişim listesindeki personel';

-- ---------- Referans kodu ----------
CREATE OR REPLACE FUNCTION public.facility_journal_next_reference(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_seq integer;
  v_year text;
BEGIN
  v_year := to_char(now() AT TIME ZONE 'UTC', 'YYYY');
  SELECT count(*)::integer + 1
  INTO v_seq
  FROM public.facility_journal_records fj
  WHERE fj.organization_id = p_org_id
    AND fj.created_at >= make_timestamptz(v_year::integer, 1, 1, 0, 0, 0, 'UTC');
  RETURN 'TG-' || v_year || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

-- ---------- Triggers ----------
CREATE OR REPLACE FUNCTION public.facility_journal_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_facility_journal_record_types_updated ON public.facility_journal_record_types;
CREATE TRIGGER trg_facility_journal_record_types_updated
  BEFORE UPDATE ON public.facility_journal_record_types
  FOR EACH ROW EXECUTE FUNCTION public.facility_journal_touch_updated_at();

DROP TRIGGER IF EXISTS trg_facility_journal_records_updated ON public.facility_journal_records;
CREATE TRIGGER trg_facility_journal_records_updated
  BEFORE UPDATE ON public.facility_journal_records
  FOR EACH ROW EXECUTE FUNCTION public.facility_journal_touch_updated_at();

CREATE OR REPLACE FUNCTION public.facility_journal_records_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.reference_code IS NULL OR trim(NEW.reference_code) = '' THEN
    NEW.reference_code := public.facility_journal_next_reference(NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_facility_journal_records_before_insert ON public.facility_journal_records;
CREATE TRIGGER trg_facility_journal_records_before_insert
  BEFORE INSERT ON public.facility_journal_records
  FOR EACH ROW EXECUTE FUNCTION public.facility_journal_records_before_insert();

-- ---------- Storage ----------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'facility-journal',
  'facility-journal',
  true,
  157286400,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/mpeg',
    'video/x-matroska', 'application/mp4'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------- RLS ----------
ALTER TABLE public.facility_journal_record_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_journal_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_journal_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_journal_record_access ENABLE ROW LEVEL SECURITY;

-- Tipler: org içi okuma (modül yetkisi veya admin); yazma yalnızca admin
DROP POLICY IF EXISTS facility_journal_types_select ON public.facility_journal_record_types;
CREATE POLICY facility_journal_types_select ON public.facility_journal_record_types
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND (
      public.current_user_is_staff_admin()
      OR public.staff_has_facility_journal_permission()
    )
  );

DROP POLICY IF EXISTS facility_journal_types_write_admin ON public.facility_journal_record_types;
CREATE POLICY facility_journal_types_write_admin ON public.facility_journal_record_types
  FOR ALL TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.facility_journal_can_manage_types()
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.facility_journal_can_manage_types()
  );

-- Kayıtlar
DROP POLICY IF EXISTS facility_journal_records_select ON public.facility_journal_records;
CREATE POLICY facility_journal_records_select ON public.facility_journal_records
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND (
      public.current_user_is_staff_admin()
      OR created_by_staff_id = public.current_staff_id()
      OR EXISTS (
        SELECT 1 FROM public.facility_journal_record_access a
        WHERE a.record_id = id
          AND a.staff_id = public.current_staff_id()
          AND a.can_view = true
      )
    )
  );

DROP POLICY IF EXISTS facility_journal_records_insert ON public.facility_journal_records;
CREATE POLICY facility_journal_records_insert ON public.facility_journal_records
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND created_by_staff_id = public.current_staff_id()
    AND (
      public.current_user_is_staff_admin()
      OR public.staff_has_facility_journal_permission()
    )
  );

DROP POLICY IF EXISTS facility_journal_records_update ON public.facility_journal_records;
CREATE POLICY facility_journal_records_update ON public.facility_journal_records
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND (
      public.current_user_is_staff_admin()
      OR (
        created_by_staff_id = public.current_staff_id()
        AND public.staff_has_facility_journal_permission()
      )
    )
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND (
      public.current_user_is_staff_admin()
      OR (
        created_by_staff_id = public.current_staff_id()
        AND public.staff_has_facility_journal_permission()
      )
    )
  );

DROP POLICY IF EXISTS facility_journal_records_delete_admin ON public.facility_journal_records;
CREATE POLICY facility_journal_records_delete_admin ON public.facility_journal_records
  FOR DELETE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.current_user_is_staff_admin()
  );

-- Medya
DROP POLICY IF EXISTS facility_journal_media_select ON public.facility_journal_media;
CREATE POLICY facility_journal_media_select ON public.facility_journal_media
  FOR SELECT TO authenticated
  USING (public.facility_journal_can_view_record(record_id));

DROP POLICY IF EXISTS facility_journal_media_insert ON public.facility_journal_media;
CREATE POLICY facility_journal_media_insert ON public.facility_journal_media
  FOR INSERT TO authenticated
  WITH CHECK (
    public.facility_journal_can_view_record(record_id)
    AND (
      public.current_user_is_staff_admin()
      OR public.staff_has_facility_journal_permission()
    )
  );

DROP POLICY IF EXISTS facility_journal_media_delete ON public.facility_journal_media;
CREATE POLICY facility_journal_media_delete ON public.facility_journal_media
  FOR DELETE TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR EXISTS (
      SELECT 1 FROM public.facility_journal_records r
      WHERE r.id = record_id
        AND r.created_by_staff_id = public.current_staff_id()
        AND public.staff_has_facility_journal_permission()
    )
  );

-- Erişim listesi: admin tam; oluşturan kendi kaydına yetki ekleyebilir
DROP POLICY IF EXISTS facility_journal_access_select ON public.facility_journal_record_access;
CREATE POLICY facility_journal_access_select ON public.facility_journal_record_access
  FOR SELECT TO authenticated
  USING (public.facility_journal_can_view_record(record_id));

DROP POLICY IF EXISTS facility_journal_access_write ON public.facility_journal_record_access;
CREATE POLICY facility_journal_access_write ON public.facility_journal_record_access
  FOR ALL TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR EXISTS (
      SELECT 1 FROM public.facility_journal_records r
      WHERE r.id = record_id
        AND r.created_by_staff_id = public.current_staff_id()
        AND public.staff_has_facility_journal_permission()
    )
  )
  WITH CHECK (
    public.current_user_is_staff_admin()
    OR EXISTS (
      SELECT 1 FROM public.facility_journal_records r
      WHERE r.id = record_id
        AND r.created_by_staff_id = public.current_staff_id()
        AND public.staff_has_facility_journal_permission()
    )
  );

-- Storage policies
DROP POLICY IF EXISTS facility_journal_storage_read ON storage.objects;
CREATE POLICY facility_journal_storage_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'facility-journal');

DROP POLICY IF EXISTS facility_journal_storage_insert ON storage.objects;
CREATE POLICY facility_journal_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'facility-journal'
    AND public.staff_has_facility_journal_permission()
  );

DROP POLICY IF EXISTS facility_journal_storage_delete ON storage.objects;
CREATE POLICY facility_journal_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'facility-journal'
    AND (
      public.current_user_is_staff_admin()
      OR public.staff_has_facility_journal_permission()
    )
  );

COMMIT;
