-- POS fişi → fatura taslağı: OCR ile okunan fişler, fatura kesim tarihine göre sıraya girer

BEGIN;

CREATE TABLE IF NOT EXISTS public.pos_receipt_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  counterparty_id uuid REFERENCES public.finance_counterparties(id) ON DELETE SET NULL,
  agreement_id uuid REFERENCES public.finance_counterparty_agreements(id) ON DELETE SET NULL,

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'invoiced', 'cancelled')),

  -- Fiş / belge
  receipt_urls text[] NOT NULL DEFAULT '{}',
  receipt_no text,
  merchant_name text,
  merchant_tax_id text,
  buyer_name text,

  -- Tarih / saat (fişten) + fatura kesilmesi gereken tarih
  receipt_at timestamptz,
  receipt_date date,
  receipt_time text,
  invoice_due_on date,

  -- Ödeme
  paid_by text,
  payment_bank text,
  payment_method text,
  payment_received_on date,
  card_last4 text,

  -- Kalemler + özet (jsonb)
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  related_order_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  related_waybill_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  extra_fields jsonb NOT NULL DEFAULT '[]'::jsonb,

  vat_rate numeric(5, 2) NOT NULL DEFAULT 10,
  subtotal numeric(14, 2) NOT NULL DEFAULT 0,
  discount_total numeric(14, 2) NOT NULL DEFAULT 0,
  discounted_subtotal numeric(14, 2) NOT NULL DEFAULT 0,
  tax_total numeric(14, 2) NOT NULL DEFAULT 0,
  grand_total numeric(14, 2) NOT NULL DEFAULT 0,
  payable_amount numeric(14, 2) NOT NULL DEFAULT 0,
  -- %10 kesinti sonrası (veya KDV matrahı sonrası) fatura kesilecek tutar
  invoice_cut_amount numeric(14, 2) NOT NULL DEFAULT 0,

  kdv_exemption_reason text,
  description_note text,
  ocr_raw_text text,
  ocr_confidence text,
  ocr_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_receipt_invoices_org_due
  ON public.pos_receipt_invoices (organization_id, invoice_due_on ASC NULLS LAST, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pos_receipt_invoices_org_status
  ON public.pos_receipt_invoices (organization_id, status, invoice_due_on ASC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_pos_receipt_invoices_receipt_date
  ON public.pos_receipt_invoices (organization_id, receipt_date DESC NULLS LAST);

COMMENT ON TABLE public.pos_receipt_invoices IS
  'POS fişi OCR → fatura taslağı; fatura kesim tarihine (invoice_due_on) göre sıralanır.';
COMMENT ON COLUMN public.pos_receipt_invoices.invoice_due_on IS
  'Faturanın kesilmesi gereken tarih — liste bu alana göre sıralanır.';
COMMENT ON COLUMN public.pos_receipt_invoices.invoice_cut_amount IS
  'Fatura kesilecek tutar (varsayılan: ödenecek − %10 veya KDV dahil toplam).';
COMMENT ON COLUMN public.pos_receipt_invoices.line_items IS
  '[{code,name,quantity,unit,unitPrice,amount,discountRate,discountAmount,vatRate,vatAmount,total}]';

ALTER TABLE public.pos_receipt_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_receipt_invoices_select ON public.pos_receipt_invoices;
CREATE POLICY pos_receipt_invoices_select ON public.pos_receipt_invoices
  FOR SELECT TO authenticated
  USING (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS pos_receipt_invoices_insert ON public.pos_receipt_invoices;
CREATE POLICY pos_receipt_invoices_insert ON public.pos_receipt_invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS pos_receipt_invoices_update ON public.pos_receipt_invoices;
CREATE POLICY pos_receipt_invoices_update ON public.pos_receipt_invoices
  FOR UPDATE TO authenticated
  USING (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  )
  WITH CHECK (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS pos_receipt_invoices_delete ON public.pos_receipt_invoices;
CREATE POLICY pos_receipt_invoices_delete ON public.pos_receipt_invoices
  FOR DELETE TO authenticated
  USING (public.staff_is_admin_active());

COMMIT;
