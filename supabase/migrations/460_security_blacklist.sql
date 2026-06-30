BEGIN;

-- Güvenlik kara listesi: yalnızca role=admin personel ekleyebilir ve görüntüleyebilir.

CREATE OR REPLACE FUNCTION public.staff_can_access_security_blacklist()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT s.role = 'admin'
      FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND COALESCE(s.is_active, true) = true
        AND s.deleted_at IS NULL
      LIMIT 1
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.staff_can_access_security_blacklist() IS
  'Kara liste: yalnızca role=admin personel';

CREATE TABLE IF NOT EXISTS public.security_blacklist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  reference_code text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  photo_url text,
  photo_storage_path text,
  incident_description text NOT NULL,
  additional_notes text,
  nationality text,
  id_document_ref text,
  incident_date date,
  is_removed boolean NOT NULL DEFAULT false,
  removed_at timestamptz,
  removed_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  removal_note text,
  added_by_staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_blacklist_first_name_not_blank CHECK (length(trim(first_name)) > 0),
  CONSTRAINT security_blacklist_last_name_not_blank CHECK (length(trim(last_name)) > 0),
  CONSTRAINT security_blacklist_incident_not_blank CHECK (length(trim(incident_description)) > 0),
  CONSTRAINT security_blacklist_reference_not_blank CHECK (length(trim(reference_code)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_security_blacklist_org_reference
  ON public.security_blacklist_entries (organization_id, reference_code);
CREATE INDEX IF NOT EXISTS idx_security_blacklist_org_active_created
  ON public.security_blacklist_entries (organization_id, is_removed, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_blacklist_name_search
  ON public.security_blacklist_entries (organization_id, lower(last_name), lower(first_name));

CREATE OR REPLACE FUNCTION public.security_blacklist_next_reference(p_org_id uuid)
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
  FROM public.security_blacklist_entries e
  WHERE e.organization_id = p_org_id
    AND e.created_at >= make_timestamptz(v_year::integer, 1, 1, 0, 0, 0, 'UTC');
  RETURN 'KL-' || v_year || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.security_blacklist_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.security_blacklist_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.reference_code IS NULL OR trim(NEW.reference_code) = '' THEN
    NEW.reference_code := public.security_blacklist_next_reference(NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_security_blacklist_updated ON public.security_blacklist_entries;
CREATE TRIGGER trg_security_blacklist_updated
  BEFORE UPDATE ON public.security_blacklist_entries
  FOR EACH ROW EXECUTE FUNCTION public.security_blacklist_touch_updated_at();

DROP TRIGGER IF EXISTS trg_security_blacklist_before_insert ON public.security_blacklist_entries;
CREATE TRIGGER trg_security_blacklist_before_insert
  BEFORE INSERT ON public.security_blacklist_entries
  FOR EACH ROW EXECUTE FUNCTION public.security_blacklist_before_insert();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'security-blacklist',
  'security-blacklist',
  true,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.security_blacklist_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS security_blacklist_select ON public.security_blacklist_entries;
CREATE POLICY security_blacklist_select ON public.security_blacklist_entries
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_can_access_security_blacklist()
  );

DROP POLICY IF EXISTS security_blacklist_insert ON public.security_blacklist_entries;
CREATE POLICY security_blacklist_insert ON public.security_blacklist_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.staff_can_access_security_blacklist()
    AND added_by_staff_id = public.current_staff_id()
  );

DROP POLICY IF EXISTS security_blacklist_update ON public.security_blacklist_entries;
CREATE POLICY security_blacklist_update ON public.security_blacklist_entries
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_can_access_security_blacklist()
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.staff_can_access_security_blacklist()
  );

DROP POLICY IF EXISTS security_blacklist_delete ON public.security_blacklist_entries;
CREATE POLICY security_blacklist_delete ON public.security_blacklist_entries
  FOR DELETE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_can_access_security_blacklist()
  );

DROP POLICY IF EXISTS security_blacklist_storage_read ON storage.objects;
CREATE POLICY security_blacklist_storage_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'security-blacklist');

DROP POLICY IF EXISTS security_blacklist_storage_insert ON storage.objects;
CREATE POLICY security_blacklist_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'security-blacklist'
    AND public.staff_can_access_security_blacklist()
  );

DROP POLICY IF EXISTS security_blacklist_storage_delete ON storage.objects;
CREATE POLICY security_blacklist_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'security-blacklist'
    AND public.staff_can_access_security_blacklist()
  );

COMMIT;
