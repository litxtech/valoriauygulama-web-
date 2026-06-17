-- Cari kişiyi personele bağla — borç/alacak bildirimleri için

BEGIN;

ALTER TABLE public.finance_counterparties
  ADD COLUMN IF NOT EXISTS linked_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_finance_counterparties_linked_staff
  ON public.finance_counterparties (linked_staff_id)
  WHERE linked_staff_id IS NOT NULL;

COMMENT ON COLUMN public.finance_counterparties.linked_staff_id IS
  'Bu cari bir personele bağlıysa borç/alacak bildirimleri bu personele gider.';

COMMIT;
