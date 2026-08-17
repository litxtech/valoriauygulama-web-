-- Otel Sorun Arşivi — personel foto/video + not ile kayıt; ileride sorun çıkarabilecek veya
-- belgelenmesi gereken her türlü durum (depo düzenlendi, vana sızıntısı vb.).
-- Tüm aktif personel görüntüler/oluşturur; silme yalnızca yönetici.

BEGIN;

CREATE TABLE IF NOT EXISTS public.hotel_issue_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  record_no text,
  category text NOT NULL DEFAULT 'other' CHECK (
    category IN ('risk', 'maintenance', 'organization', 'inspection', 'other')
  ),
  note text NOT NULL,
  location_label text,
  room_number text,
  created_by_staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_issue_archive_note_not_blank CHECK (length(trim(note)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_hotel_issue_archive_org_created
  ON public.hotel_issue_archive (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hotel_issue_archive_org_category
  ON public.hotel_issue_archive (organization_id, category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hotel_issue_archive_org_room
  ON public.hotel_issue_archive (organization_id, room_number);
CREATE INDEX IF NOT EXISTS idx_hotel_issue_archive_created_by
  ON public.hotel_issue_archive (created_by_staff_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hotel_issue_archive_org_record_no
  ON public.hotel_issue_archive (organization_id, record_no)
  WHERE record_no IS NOT NULL;

CREATE OR REPLACE FUNCTION public.hotel_issue_archive_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hotel_issue_archive_updated_at ON public.hotel_issue_archive;
CREATE TRIGGER trg_hotel_issue_archive_updated_at
  BEFORE UPDATE ON public.hotel_issue_archive
  FOR EACH ROW EXECUTE FUNCTION public.hotel_issue_archive_set_updated_at();

CREATE OR REPLACE FUNCTION public.hotel_issue_archive_set_record_no()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_seq integer;
BEGIN
  IF NEW.record_no IS NULL OR length(trim(NEW.record_no)) = 0 THEN
    SELECT COUNT(*) + 1 INTO v_seq
    FROM public.hotel_issue_archive
    WHERE organization_id = NEW.organization_id;
    NEW.record_no := 'KAY-' || to_char(now(), 'YY') || '-' || lpad(v_seq::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hotel_issue_archive_record_no ON public.hotel_issue_archive;
CREATE TRIGGER trg_hotel_issue_archive_record_no
  BEFORE INSERT ON public.hotel_issue_archive
  FOR EACH ROW EXECUTE FUNCTION public.hotel_issue_archive_set_record_no();

CREATE TABLE IF NOT EXISTS public.hotel_issue_archive_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  record_id uuid NOT NULL REFERENCES public.hotel_issue_archive(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  storage_path text,
  public_url text NOT NULL,
  thumbnail_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by_staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hotel_issue_archive_media_record
  ON public.hotel_issue_archive_media (record_id, sort_order ASC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_hotel_issue_archive_media_org
  ON public.hotel_issue_archive_media (organization_id, record_id);

ALTER TABLE public.hotel_issue_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_issue_archive_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hotel_issue_archive_select_staff" ON public.hotel_issue_archive;
CREATE POLICY "hotel_issue_archive_select_staff"
  ON public.hotel_issue_archive FOR SELECT TO authenticated
  USING (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS "hotel_issue_archive_insert_staff" ON public.hotel_issue_archive;
CREATE POLICY "hotel_issue_archive_insert_staff"
  ON public.hotel_issue_archive FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND created_by_staff_id = public.current_staff_id()
  );

DROP POLICY IF EXISTS "hotel_issue_archive_update_staff" ON public.hotel_issue_archive;
CREATE POLICY "hotel_issue_archive_update_staff"
  ON public.hotel_issue_archive FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND (
      created_by_staff_id = public.current_staff_id()
      OR public.current_user_is_staff_admin()
    )
  )
  WITH CHECK (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS "hotel_issue_archive_delete_admin" ON public.hotel_issue_archive;
CREATE POLICY "hotel_issue_archive_delete_admin"
  ON public.hotel_issue_archive FOR DELETE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.current_user_is_staff_admin()
  );

DROP POLICY IF EXISTS "hotel_issue_archive_media_select_staff" ON public.hotel_issue_archive_media;
CREATE POLICY "hotel_issue_archive_media_select_staff"
  ON public.hotel_issue_archive_media FOR SELECT TO authenticated
  USING (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS "hotel_issue_archive_media_insert_staff" ON public.hotel_issue_archive_media;
CREATE POLICY "hotel_issue_archive_media_insert_staff"
  ON public.hotel_issue_archive_media FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND created_by_staff_id = public.current_staff_id()
    AND EXISTS (
      SELECT 1 FROM public.hotel_issue_archive r
      WHERE r.id = hotel_issue_archive_media.record_id
        AND r.organization_id = public.current_staff_organization_id()
    )
  );

DROP POLICY IF EXISTS "hotel_issue_archive_media_delete_admin" ON public.hotel_issue_archive_media;
CREATE POLICY "hotel_issue_archive_media_delete_admin"
  ON public.hotel_issue_archive_media FOR DELETE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.current_user_is_staff_admin()
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('hotel-issue-archive', 'hotel-issue-archive', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "hotel_issue_archive_storage_insert" ON storage.objects;
CREATE POLICY "hotel_issue_archive_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'hotel-issue-archive'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "hotel_issue_archive_storage_update" ON storage.objects;
CREATE POLICY "hotel_issue_archive_storage_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'hotel-issue-archive'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "hotel_issue_archive_storage_delete" ON storage.objects;
CREATE POLICY "hotel_issue_archive_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'hotel-issue-archive'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;
