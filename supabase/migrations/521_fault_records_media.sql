-- Arıza Kayıt Sistemi — fotoğraf/video eki + arızayı gideren personel adı.

BEGIN;

-- Arızayı fiilen gideren personelin adı (kaydı giren kişiden farklı olabilir).
ALTER TABLE public.fault_records
  ADD COLUMN IF NOT EXISTS resolved_by_name text;

-- Medya (fotoğraf / video) tablosu
CREATE TABLE IF NOT EXISTS public.fault_record_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  record_id uuid NOT NULL REFERENCES public.fault_records(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  storage_path text,
  public_url text NOT NULL,
  thumbnail_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by_staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fault_record_media_record
  ON public.fault_record_media (record_id, sort_order ASC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_fault_record_media_org
  ON public.fault_record_media (organization_id, record_id);

ALTER TABLE public.fault_record_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fault_record_media_select_staff" ON public.fault_record_media;
CREATE POLICY "fault_record_media_select_staff"
  ON public.fault_record_media FOR SELECT TO authenticated
  USING (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS "fault_record_media_insert_staff" ON public.fault_record_media;
CREATE POLICY "fault_record_media_insert_staff"
  ON public.fault_record_media FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND created_by_staff_id = public.current_staff_id()
    AND EXISTS (
      SELECT 1 FROM public.fault_records r
      WHERE r.id = fault_record_media.record_id
        AND r.organization_id = public.current_staff_organization_id()
    )
  );

DROP POLICY IF EXISTS "fault_record_media_delete_staff" ON public.fault_record_media;
CREATE POLICY "fault_record_media_delete_staff"
  ON public.fault_record_media FOR DELETE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND (
      created_by_staff_id = public.current_staff_id()
      OR public.current_user_is_staff_admin()
    )
  );

-- Storage kovası (public okuma; yalnız kendi auth klasörüne yazma)
INSERT INTO storage.buckets (id, name, public)
VALUES ('fault-records', 'fault-records', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "fault_records_storage_insert" ON storage.objects;
CREATE POLICY "fault_records_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'fault-records'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "fault_records_storage_update" ON storage.objects;
CREATE POLICY "fault_records_storage_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'fault-records'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "fault_records_storage_delete" ON storage.objects;
CREATE POLICY "fault_records_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'fault-records'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;
