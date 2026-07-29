-- POS fişleri: otel / restoran (mutfak) ayrımı — fişler karışmaz

BEGIN;

ALTER TABLE public.pos_receipt_invoices
  ADD COLUMN IF NOT EXISTS venue_scope text NOT NULL DEFAULT 'hotel'
    CHECK (venue_scope IN ('hotel', 'restaurant'));

CREATE INDEX IF NOT EXISTS idx_pos_receipt_invoices_org_venue_due
  ON public.pos_receipt_invoices (organization_id, venue_scope, invoice_due_on ASC NULLS LAST);

COMMENT ON COLUMN public.pos_receipt_invoices.venue_scope IS
  'hotel = otel fişleri; restaurant = restoran/mutfak fişleri — ayrı listelenir ve toplanır.';

COMMIT;
