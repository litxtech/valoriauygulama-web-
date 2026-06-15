-- Cari: isteğe bağlı özel tür adı (Bu kim?)

BEGIN;

ALTER TABLE public.finance_counterparties
  ADD COLUMN IF NOT EXISTS party_type_label text;

COMMENT ON COLUMN public.finance_counterparties.party_type_label IS
  'Özel cari türü adı; doluysa liste ve raporda party_type yerine gösterilir';

COMMIT;
