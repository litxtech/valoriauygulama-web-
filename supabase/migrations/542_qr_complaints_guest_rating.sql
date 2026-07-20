-- QR şikayet: misafir hesabı bağlantısı + e-posta + yıldız puanı

BEGIN;

ALTER TABLE public.qr_complaints
  ADD COLUMN IF NOT EXISTS guest_id uuid REFERENCES public.guests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS rating integer,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'qr_complaints_rating_chk'
  ) THEN
    ALTER TABLE public.qr_complaints
      ADD CONSTRAINT qr_complaints_rating_chk
      CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS qr_complaints_guest_idx
  ON public.qr_complaints (guest_id, created_at DESC)
  WHERE guest_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS qr_complaints_email_idx
  ON public.qr_complaints (lower(email))
  WHERE email IS NOT NULL;

COMMENT ON COLUMN public.qr_complaints.guest_id IS
  'Web şikayet portalından otomatik oluşturulan / eşleşen misafir hesabı';
COMMENT ON COLUMN public.qr_complaints.rating IS
  '1–5 yıldız (paylaşım puanı)';

COMMIT;
