-- Otel vs şahsi ödeme ayrımı; şahsi kişi cari tipi

BEGIN;

ALTER TABLE public.finance_movements
  ADD COLUMN IF NOT EXISTS ledger_scope text NOT NULL DEFAULT 'hotel';

ALTER TABLE public.finance_movements DROP CONSTRAINT IF EXISTS finance_movements_ledger_scope_check;
ALTER TABLE public.finance_movements
  ADD CONSTRAINT finance_movements_ledger_scope_check
  CHECK (ledger_scope IN ('hotel', 'personal'));

CREATE INDEX IF NOT EXISTS idx_finance_movements_org_scope
  ON public.finance_movements (organization_id, ledger_scope, movement_date DESC);

ALTER TABLE public.finance_counterparties DROP CONSTRAINT IF EXISTS finance_counterparties_party_type_check;
ALTER TABLE public.finance_counterparties
  ADD CONSTRAINT finance_counterparties_party_type_check
  CHECK (party_type IN ('customer', 'supplier', 'subcontractor', 'staff', 'private_person', 'other'));

COMMENT ON COLUMN public.finance_movements.ledger_scope IS 'hotel: işletme ödemesi; personal: şahsi harcama/ödeme';

DROP FUNCTION IF EXISTS public.accounting_counterparty_balances(uuid);

CREATE OR REPLACE FUNCTION public.accounting_counterparty_balances(
  p_organization_id uuid,
  p_ledger_scope text DEFAULT NULL
)
RETURNS TABLE(counterparty_id uuid, income numeric, expense numeric, net numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    m.counterparty_id,
    COALESCE(SUM(CASE WHEN m.kind = 'income' THEN m.amount ELSE 0 END), 0) AS income,
    COALESCE(SUM(CASE WHEN m.kind = 'expense' THEN m.amount ELSE 0 END), 0) AS expense,
    COALESCE(SUM(CASE WHEN m.kind = 'income' THEN m.amount ELSE -m.amount END), 0) AS net
  FROM public.finance_movements m
  WHERE m.organization_id = p_organization_id
    AND m.counterparty_id IS NOT NULL
    AND (p_ledger_scope IS NULL OR m.ledger_scope = p_ledger_scope)
  GROUP BY m.counterparty_id;
$$;

GRANT EXECUTE ON FUNCTION public.accounting_counterparty_balances(uuid, text) TO authenticated;

COMMIT;
