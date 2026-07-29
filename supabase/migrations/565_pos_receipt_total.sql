-- Fiş tutarı (OCR/manuel) — fatura tutturma hesabı için kaynak tutar

BEGIN;

ALTER TABLE public.pos_receipt_invoices
  ADD COLUMN IF NOT EXISTS receipt_total numeric(14, 2);

COMMENT ON COLUMN public.pos_receipt_invoices.receipt_total IS
  'POS fişindeki gerçek ödenen tutar; fatura kesilecek tutarın bu değere tutturulması hedeflenir.';

COMMIT;
