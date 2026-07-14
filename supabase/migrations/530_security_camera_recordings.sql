-- Önemli kamera kayıtları: personel kamera/telefonda çektiği veya Tapo vs. kaydettiği
-- videoları uygulamaya yükler; org personeli listeler, admin siler.

BEGIN;

CREATE TABLE IF NOT EXISTS public.security_camera_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  record_no text,
  title text NOT NULL,
  note text,
  camera_label text,
  location_label text,
  recorded_at timestamptz,
  created_by_staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_camera_recordings_title_not_blank CHECK (length(trim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_security_camera_recordings_org_created
  ON public.security_camera_recordings (organization_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_security_camera_recordings_org_record_no
  ON public.security_camera_recordings (organization_id, record_no)
  WHERE record_no IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.security_camera_recording_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  recording_id uuid NOT NULL REFERENCES public.security_camera_recordings(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  storage_path text,
  public_url text NOT NULL,
  thumbnail_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by_staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_camera_recording_media_rec
  ON public.security_camera_recording_media (recording_id, sort_order ASC, created_at ASC);

CREATE OR REPLACE FUNCTION public.security_camera_recordings_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_security_camera_recordings_updated_at ON public.security_camera_recordings;
CREATE TRIGGER trg_security_camera_recordings_updated_at
  BEFORE UPDATE ON public.security_camera_recordings
  FOR EACH ROW EXECUTE FUNCTION public.security_camera_recordings_set_updated_at();

CREATE OR REPLACE FUNCTION public.security_camera_recordings_set_record_no()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_seq integer;
BEGIN
  IF NEW.record_no IS NULL OR length(trim(NEW.record_no)) = 0 THEN
    SELECT COUNT(*) + 1 INTO v_seq
    FROM public.security_camera_recordings
    WHERE organization_id = NEW.organization_id;
    NEW.record_no := 'KAM-' || to_char(now(), 'YY') || '-' || lpad(v_seq::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_security_camera_recordings_record_no ON public.security_camera_recordings;
CREATE TRIGGER trg_security_camera_recordings_record_no
  BEFORE INSERT ON public.security_camera_recordings
  FOR EACH ROW EXECUTE FUNCTION public.security_camera_recordings_set_record_no();

ALTER TABLE public.security_camera_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_camera_recording_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS security_camera_recordings_select ON public.security_camera_recordings;
CREATE POLICY security_camera_recordings_select ON public.security_camera_recordings
  FOR SELECT TO authenticated
  USING (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS security_camera_recordings_insert ON public.security_camera_recordings;
CREATE POLICY security_camera_recordings_insert ON public.security_camera_recordings
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND created_by_staff_id = public.current_staff_id()
  );

DROP POLICY IF EXISTS security_camera_recordings_update ON public.security_camera_recordings;
CREATE POLICY security_camera_recordings_update ON public.security_camera_recordings
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND (
      created_by_staff_id = public.current_staff_id()
      OR public.current_user_is_staff_admin()
    )
  )
  WITH CHECK (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS security_camera_recordings_delete ON public.security_camera_recordings;
CREATE POLICY security_camera_recordings_delete ON public.security_camera_recordings
  FOR DELETE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND (
      created_by_staff_id = public.current_staff_id()
      OR public.current_user_is_staff_admin()
    )
  );

DROP POLICY IF EXISTS security_camera_recording_media_select ON public.security_camera_recording_media;
CREATE POLICY security_camera_recording_media_select ON public.security_camera_recording_media
  FOR SELECT TO authenticated
  USING (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS security_camera_recording_media_insert ON public.security_camera_recording_media;
CREATE POLICY security_camera_recording_media_insert ON public.security_camera_recording_media
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND created_by_staff_id = public.current_staff_id()
    AND EXISTS (
      SELECT 1 FROM public.security_camera_recordings r
      WHERE r.id = security_camera_recording_media.recording_id
        AND r.organization_id = public.current_staff_organization_id()
    )
  );

DROP POLICY IF EXISTS security_camera_recording_media_delete ON public.security_camera_recording_media;
CREATE POLICY security_camera_recording_media_delete ON public.security_camera_recording_media
  FOR DELETE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND (
      created_by_staff_id = public.current_staff_id()
      OR public.current_user_is_staff_admin()
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('security-camera-recordings', 'security-camera-recordings', true, 209715200)
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS security_camera_recordings_storage_insert ON storage.objects;
CREATE POLICY security_camera_recordings_storage_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'security-camera-recordings'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS security_camera_recordings_storage_update ON storage.objects;
CREATE POLICY security_camera_recordings_storage_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'security-camera-recordings'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS security_camera_recordings_storage_delete ON storage.objects;
CREATE POLICY security_camera_recordings_storage_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'security-camera-recordings'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;
