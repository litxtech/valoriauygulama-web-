-- Kişi / cari profil fotoğrafı (admin hızlı ödeme & detay, PDF raporları)

BEGIN;

ALTER TABLE public.finance_counterparties
  ADD COLUMN IF NOT EXISTS profile_image text;

COMMENT ON COLUMN public.finance_counterparties.profile_image IS
  'Public URL (profiles bucket); kişi detay ve ödeme raporlarında gösterilir.';

COMMIT;
