-- Ödeme planı: sözleşme / ek dosya URL'leri (PDF, görsel)

BEGIN;

ALTER TABLE public.finance_counterparty_agreements
  ADD COLUMN IF NOT EXISTS contract_urls text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.finance_counterparty_agreements.contract_urls IS
  'Sözleşme ve ek belgeler (PDF/görsel) public storage URL listesi';

COMMIT;
