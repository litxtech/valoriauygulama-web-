-- Oda ödeme panosu: sesli durum notu
BEGIN;

ALTER TABLE public.room_payment_jobs
  ADD COLUMN IF NOT EXISTS voice_note_url text,
  ADD COLUMN IF NOT EXISTS voice_note_duration_sec integer
    CHECK (voice_note_duration_sec IS NULL OR voice_note_duration_sec >= 0);

COMMENT ON COLUMN public.room_payment_jobs.voice_note_url IS
  'Personelin durum açıklaması için ses kaydı (public URL).';
COMMENT ON COLUMN public.room_payment_jobs.voice_note_duration_sec IS
  'Ses kaydı süresi (saniye).';

COMMIT;
