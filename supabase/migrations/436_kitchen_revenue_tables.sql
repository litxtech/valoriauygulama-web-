-- Restoran masa hasılatı: masa no (1-14), opsiyonel açıklama/ödeme tipi

BEGIN;

ALTER TABLE public.kitchen_revenues
  ADD COLUMN IF NOT EXISTS table_number SMALLINT;

ALTER TABLE public.kitchen_revenues
  DROP CONSTRAINT IF EXISTS kitchen_revenues_table_number_check;

ALTER TABLE public.kitchen_revenues
  ADD CONSTRAINT kitchen_revenues_table_number_check
  CHECK (table_number IS NULL OR (table_number >= 1 AND table_number <= 14));

ALTER TABLE public.kitchen_revenues
  ALTER COLUMN description DROP NOT NULL;

ALTER TABLE public.kitchen_revenues
  ALTER COLUMN payment_type DROP NOT NULL;

ALTER TABLE public.kitchen_revenues
  ALTER COLUMN payment_type SET DEFAULT 'nakit';

UPDATE public.kitchen_revenues
SET payment_type = 'nakit'
WHERE payment_type IS NULL;

UPDATE public.kitchen_revenues
SET description = 'Hasılat'
WHERE description IS NULL OR btrim(description) = '';

CREATE INDEX IF NOT EXISTS idx_kitchen_revenues_org_date_created
  ON public.kitchen_revenues(organization_id, entry_date DESC, created_at DESC);

COMMENT ON COLUMN public.kitchen_revenues.table_number IS 'Restoran masa numarası (1-14).';

COMMIT;
