BEGIN;

-- QR kod ile açılan anonim şikayet / öneri / teşekkür hattı
CREATE TABLE IF NOT EXISTS public.qr_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  topic_type text NOT NULL DEFAULT 'complaint'
    CHECK (topic_type IN ('complaint', 'suggestion', 'thanks')),
  category text NOT NULL
    CHECK (
      category IN (
        'personnel',
        'room_issue',
        'payment',
        'reception_checkin_checkout',
        'passport',
        'noise',
        'breakfast',
        'food',
        'other'
      )
    ),
  description text NOT NULL CHECK (char_length(btrim(description)) >= 1),
  contact_name text,
  phone text,
  room_number text,
  media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'taken_for_review',
        'solution_in_progress',
        'resolved',
        'unresolved',
        'rejected'
      )
    ),
  admin_note text,
  reviewed_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  source text NOT NULL DEFAULT 'qr_web',
  client_ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qr_complaints_status_idx
  ON public.qr_complaints (status, created_at DESC);

CREATE INDEX IF NOT EXISTS qr_complaints_org_idx
  ON public.qr_complaints (organization_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.qr_complaints_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qr_complaints_updated_at ON public.qr_complaints;
CREATE TRIGGER trg_qr_complaints_updated_at
  BEFORE UPDATE ON public.qr_complaints
  FOR EACH ROW EXECUTE FUNCTION public.qr_complaints_set_updated_at();

ALTER TABLE public.qr_complaints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qr_complaints_staff_read" ON public.qr_complaints;
CREATE POLICY "qr_complaints_staff_read"
  ON public.qr_complaints
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND COALESCE(s.is_active, true) = true
        AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "qr_complaints_staff_update" ON public.qr_complaints;
CREATE POLICY "qr_complaints_staff_update"
  ON public.qr_complaints
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND COALESCE(s.is_active, true) = true
        AND s.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND COALESCE(s.is_active, true) = true
        AND s.deleted_at IS NULL
    )
  );

-- Insert yalnızca Edge (service role); anon/authenticated insert yok
GRANT SELECT, UPDATE ON public.qr_complaints TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'qr-complaints',
  'qr-complaints',
  true,
  52428800,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/3gpp'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "qr_complaints_bucket_read" ON storage.objects;
CREATE POLICY "qr_complaints_bucket_read"
  ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'qr-complaints');

DROP POLICY IF EXISTS "qr_complaints_bucket_admin_write" ON storage.objects;
CREATE POLICY "qr_complaints_bucket_admin_write"
  ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'qr-complaints'
    AND public.current_user_is_staff_admin()
  )
  WITH CHECK (
    bucket_id = 'qr-complaints'
    AND public.current_user_is_staff_admin()
  );

COMMIT;
