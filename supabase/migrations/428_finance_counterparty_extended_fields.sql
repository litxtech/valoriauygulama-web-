-- Cari: ek alanlar ve genişletilmiş tür listesi

BEGIN;

ALTER TABLE public.finance_counterparties
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS tax_office text,
  ADD COLUMN IF NOT EXISTS extra_info text;

COMMENT ON COLUMN public.finance_counterparties.address IS 'Açık adres (isteğe bağlı)';
COMMENT ON COLUMN public.finance_counterparties.tax_id IS 'Vergi / T.C. kimlik no (isteğe bağlı)';
COMMENT ON COLUMN public.finance_counterparties.tax_office IS 'Vergi dairesi (isteğe bağlı)';
COMMENT ON COLUMN public.finance_counterparties.extra_info IS 'IBAN, yetkili kişi vb. ek bilgiler';

ALTER TABLE public.finance_counterparties DROP CONSTRAINT IF EXISTS finance_counterparties_party_type_check;
ALTER TABLE public.finance_counterparties
  ADD CONSTRAINT finance_counterparties_party_type_check
  CHECK (party_type IN (
    'customer', 'supplier', 'subcontractor', 'staff', 'private_person', 'other',
    'landlord', 'utility', 'agency', 'consultant', 'government', 'bank',
    'insurance', 'lawyer', 'accountant', 'freelancer'
  ));

COMMIT;
