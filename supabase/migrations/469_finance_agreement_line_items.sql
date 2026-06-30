-- Fatura OCR: borç kaydına kalem kalem malzeme satırları

BEGIN;

ALTER TABLE public.finance_counterparty_agreements
  ADD COLUMN IF NOT EXISTS line_items jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.finance_counterparty_agreements.line_items IS
  'Fatura/irsaliye OCR satırları: [{name, quantity?, unit?, unitPrice?, total}]';

COMMIT;
