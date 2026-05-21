BEGIN;

ALTER TABLE public.staff_assignments
  ADD COLUMN IF NOT EXISTS completion_proof_urls TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS completion_note TEXT;

COMMENT ON COLUMN public.staff_assignments.completion_proof_urls IS 'Personelin görev bitirince yüklediği teyit fotoğrafları (public URL).';
COMMENT ON COLUMN public.staff_assignments.completion_note IS 'Personel görev tamamlama notu (isteğe bağlı).';

COMMIT;
