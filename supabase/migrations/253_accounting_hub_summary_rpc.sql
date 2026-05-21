-- Muhasebe özet ekranı: tek RPC ile toplamlar (ağır satır çekimi yok).

BEGIN;

CREATE OR REPLACE FUNCTION public.accounting_hub_summary(
  p_organization_id uuid,
  p_month_start date,
  p_month_end date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_income numeric := 0;
  v_expense numeric := 0;
  v_staff_exp numeric := 0;
  v_mov_count int := 0;
  v_rec numeric := 0;
  v_pay numeric := 0;
BEGIN
  IF NOT (
    public.staff_is_admin_active()
    OR p_organization_id = ANY (public.staff_org_ids_for_auth())
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF to_regclass('public.finance_movements') IS NOT NULL THEN
    SELECT
      COALESCE(SUM(CASE WHEN kind = 'income' THEN amount ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount ELSE 0 END), 0),
      COUNT(*)::int
    INTO v_income, v_expense, v_mov_count
    FROM public.finance_movements
    WHERE organization_id = p_organization_id
      AND movement_date >= p_month_start
      AND movement_date < p_month_end;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_staff_exp
  FROM public.staff_expenses
  WHERE organization_id = p_organization_id
    AND expense_date >= p_month_start
    AND expense_date < p_month_end
    AND status <> 'rejected';

  SELECT
    COALESCE(SUM(
      CASE WHEN lender_is_organization AND NOT borrower_is_organization THEN amount_remaining ELSE 0 END
    ), 0),
    COALESCE(SUM(
      CASE WHEN borrower_is_organization AND NOT lender_is_organization THEN amount_remaining ELSE 0 END
    ), 0)
  INTO v_rec, v_pay
  FROM public.staff_debt_entries
  WHERE organization_id = p_organization_id
    AND status IN ('open', 'partial');

  RETURN jsonb_build_object(
    'income', v_income,
    'expense', v_expense,
    'staff_expense', v_staff_exp,
    'movement_count', v_mov_count,
    'open_receivable', v_rec,
    'open_payable', v_pay
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accounting_counterparty_balances(p_organization_id uuid)
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
  GROUP BY m.counterparty_id;
$$;

GRANT EXECUTE ON FUNCTION public.accounting_hub_summary(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_counterparty_balances(uuid) TO authenticated;

COMMIT;
