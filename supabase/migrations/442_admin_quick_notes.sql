BEGIN;

-- Yönetici anlık not defteri: sınırsız metin + medya, otomatik not numarası (NOT-YYYY-NNNN).

CREATE OR REPLACE FUNCTION public.staff_can_access_admin_quick_notes()
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

COMMENT ON FUNCTION public.staff_can_access_admin_quick_notes() IS
  'Yönetici not defteri: yalnızca role=admin personel';

CREATE TABLE IF NOT EXISTS public.admin_quick_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  note_number text NOT NULL,
  title text,
  body_text text NOT NULL DEFAULT '',
  tag text NOT NULL DEFAULT 'general' CHECK (tag IN ('general', 'room', 'staff', 'guest', 'urgent')),
  room_label text,
  is_pinned boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_by_staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_quick_notes_number_not_blank CHECK (length(trim(note_number)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_quick_notes_org_number
  ON public.admin_quick_notes (organization_id, note_number);
CREATE INDEX IF NOT EXISTS idx_admin_quick_notes_org_created
  ON public.admin_quick_notes (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_quick_notes_creator
  ON public.admin_quick_notes (created_by_staff_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_quick_notes_active
  ON public.admin_quick_notes (organization_id, is_archived, is_pinned DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_quick_note_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES public.admin_quick_notes(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  storage_path text NOT NULL,
  public_url text NOT NULL,
  thumbnail_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_quick_note_media_note
  ON public.admin_quick_note_media (note_id, sort_order, created_at);

CREATE OR REPLACE FUNCTION public.admin_quick_note_next_number(p_org_id uuid)
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
  FROM public.admin_quick_notes n
  WHERE n.organization_id = p_org_id
    AND n.created_at >= make_timestamptz(v_year::integer, 1, 1, 0, 0, 0, 'UTC');
  RETURN 'NOT-' || v_year || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_quick_notes_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_quick_notes_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.note_number IS NULL OR trim(NEW.note_number) = '' THEN
    NEW.note_number := public.admin_quick_note_next_number(NEW.organization_id);
  END IF;
  IF NEW.title IS NULL OR trim(NEW.title) = '' THEN
    NEW.title := NULLIF(left(trim(NEW.body_text), 80), '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_quick_notes_updated ON public.admin_quick_notes;
CREATE TRIGGER trg_admin_quick_notes_updated
  BEFORE UPDATE ON public.admin_quick_notes
  FOR EACH ROW EXECUTE FUNCTION public.admin_quick_notes_touch_updated_at();

DROP TRIGGER IF EXISTS trg_admin_quick_notes_before_insert ON public.admin_quick_notes;
CREATE TRIGGER trg_admin_quick_notes_before_insert
  BEFORE INSERT ON public.admin_quick_notes
  FOR EACH ROW EXECUTE FUNCTION public.admin_quick_notes_before_insert();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'admin-notes',
  'admin-notes',
  true,
  524288000,
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

ALTER TABLE public.admin_quick_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_quick_note_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_quick_notes_select ON public.admin_quick_notes;
CREATE POLICY admin_quick_notes_select ON public.admin_quick_notes
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_can_access_admin_quick_notes()
    AND created_by_staff_id = public.current_staff_id()
  );

DROP POLICY IF EXISTS admin_quick_notes_insert ON public.admin_quick_notes;
CREATE POLICY admin_quick_notes_insert ON public.admin_quick_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.staff_can_access_admin_quick_notes()
    AND created_by_staff_id = public.current_staff_id()
  );

DROP POLICY IF EXISTS admin_quick_notes_update ON public.admin_quick_notes;
CREATE POLICY admin_quick_notes_update ON public.admin_quick_notes
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_can_access_admin_quick_notes()
    AND created_by_staff_id = public.current_staff_id()
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.staff_can_access_admin_quick_notes()
    AND created_by_staff_id = public.current_staff_id()
  );

DROP POLICY IF EXISTS admin_quick_notes_delete ON public.admin_quick_notes;
CREATE POLICY admin_quick_notes_delete ON public.admin_quick_notes
  FOR DELETE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_can_access_admin_quick_notes()
    AND created_by_staff_id = public.current_staff_id()
  );

DROP POLICY IF EXISTS admin_quick_note_media_select ON public.admin_quick_note_media;
CREATE POLICY admin_quick_note_media_select ON public.admin_quick_note_media
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_quick_notes n
      WHERE n.id = note_id
        AND n.organization_id = public.current_staff_organization_id()
        AND n.created_by_staff_id = public.current_staff_id()
        AND public.staff_can_access_admin_quick_notes()
    )
  );

DROP POLICY IF EXISTS admin_quick_note_media_insert ON public.admin_quick_note_media;
CREATE POLICY admin_quick_note_media_insert ON public.admin_quick_note_media
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_quick_notes n
      WHERE n.id = note_id
        AND n.organization_id = public.current_staff_organization_id()
        AND n.created_by_staff_id = public.current_staff_id()
        AND public.staff_can_access_admin_quick_notes()
    )
  );

DROP POLICY IF EXISTS admin_quick_note_media_delete ON public.admin_quick_note_media;
CREATE POLICY admin_quick_note_media_delete ON public.admin_quick_note_media
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_quick_notes n
      WHERE n.id = note_id
        AND n.created_by_staff_id = public.current_staff_id()
        AND public.staff_can_access_admin_quick_notes()
    )
  );

DROP POLICY IF EXISTS admin_notes_storage_read ON storage.objects;
CREATE POLICY admin_notes_storage_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'admin-notes');

DROP POLICY IF EXISTS admin_notes_storage_insert ON storage.objects;
CREATE POLICY admin_notes_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'admin-notes'
    AND public.staff_can_access_admin_quick_notes()
  );

DROP POLICY IF EXISTS admin_notes_storage_delete ON storage.objects;
CREATE POLICY admin_notes_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'admin-notes'
    AND public.staff_can_access_admin_quick_notes()
  );

COMMIT;
