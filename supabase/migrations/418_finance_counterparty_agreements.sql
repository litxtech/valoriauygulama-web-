-- Kişi ödemeleri: iş/taahhüt planı (hedef tutar, ödedikçe kalan düşer)

BEGIN;

CREATE TABLE IF NOT EXISTS public.finance_counterparty_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  counterparty_id uuid NOT NULL REFERENCES public.finance_counterparties(id) ON DELETE CASCADE,
  title text NOT NULL,
  target_amount numeric(14, 2) NOT NULL CHECK (target_amount > 0),
  amount_paid numeric(14, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  amount_remaining numeric(14, 2) NOT NULL CHECK (amount_remaining >= 0),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'partial', 'paid', 'cancelled')),
  started_on date NOT NULL DEFAULT (CURRENT_DATE),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_counterparty_agreements_title_not_blank CHECK (length(trim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_finance_cp_agreements_counterparty
  ON public.finance_counterparty_agreements (counterparty_id, is_active, started_on DESC);

CREATE INDEX IF NOT EXISTS idx_finance_cp_agreements_org
  ON public.finance_counterparty_agreements (organization_id, created_at DESC);

ALTER TABLE public.finance_movements
  ADD COLUMN IF NOT EXISTS agreement_id uuid
    REFERENCES public.finance_counterparty_agreements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_finance_movements_agreement
  ON public.finance_movements (agreement_id)
  WHERE agreement_id IS NOT NULL;

COMMENT ON TABLE public.finance_counterparty_agreements IS
  'Kişi ödemeleri ödeme planı: hedef tutar; expense hareketleri agreement_id ile bağlanır.';
COMMENT ON COLUMN public.finance_movements.agreement_id IS
  'Ödeme planına bağlı gider; yalnızca kind=expense ve aynı cari.';

-- ---------- recalc ----------
CREATE OR REPLACE FUNCTION public.finance_agreement_recalc(p_agreement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  tgt numeric;
  paid numeric;
  rem numeric;
  st text;
BEGIN
  SELECT target_amount INTO tgt
  FROM public.finance_counterparty_agreements
  WHERE id = p_agreement_id;
  IF tgt IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(m.amount), 0) INTO paid
  FROM public.finance_movements m
  WHERE m.agreement_id = p_agreement_id
    AND m.kind = 'expense';

  rem := GREATEST(0, tgt - paid);
  st := CASE
    WHEN EXISTS (
      SELECT 1 FROM public.finance_counterparty_agreements a
      WHERE a.id = p_agreement_id AND a.status = 'cancelled'
    ) THEN 'cancelled'
    WHEN paid <= 0 THEN 'open'
    WHEN paid >= tgt THEN 'paid'
    ELSE 'partial'
  END;

  UPDATE public.finance_counterparty_agreements
  SET
    amount_paid = paid,
    amount_remaining = rem,
    status = st,
    updated_at = now()
  WHERE id = p_agreement_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_finance_movements_agreement_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  aid uuid;
  cp_agreement uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    aid := OLD.agreement_id;
    IF aid IS NOT NULL THEN
      PERFORM public.finance_agreement_recalc(aid);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.agreement_id IS NOT NULL THEN
    IF NEW.kind IS DISTINCT FROM 'expense' THEN
      RAISE EXCEPTION 'agreement_id yalnızca ödeme (expense) kayıtlarında kullanılabilir';
    END IF;
    SELECT a.counterparty_id INTO cp_agreement
    FROM public.finance_counterparty_agreements a
    WHERE a.id = NEW.agreement_id;
    IF cp_agreement IS NULL THEN
      RAISE EXCEPTION 'Geçersiz ödeme planı';
    END IF;
    IF NEW.counterparty_id IS DISTINCT FROM cp_agreement THEN
      RAISE EXCEPTION 'Ödeme planı bu cari ile eşleşmiyor';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.agreement_id IS DISTINCT FROM NEW.agreement_id THEN
    IF OLD.agreement_id IS NOT NULL THEN
      PERFORM public.finance_agreement_recalc(OLD.agreement_id);
    END IF;
  END IF;

  IF NEW.agreement_id IS NOT NULL THEN
    PERFORM public.finance_agreement_recalc(NEW.agreement_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_movements_agreement_sync ON public.finance_movements;
CREATE TRIGGER trg_finance_movements_agreement_sync
  AFTER INSERT OR UPDATE OF agreement_id, kind, amount, counterparty_id OR DELETE
  ON public.finance_movements
  FOR EACH ROW EXECUTE FUNCTION public.trg_finance_movements_agreement_sync();

-- Yeni plan: kalan = hedef
CREATE OR REPLACE FUNCTION public.finance_agreement_init_remaining()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.amount_paid := 0;
  NEW.amount_remaining := NEW.target_amount;
  NEW.status := COALESCE(NULLIF(NEW.status, ''), 'open');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_agreement_init ON public.finance_counterparty_agreements;
CREATE TRIGGER trg_finance_agreement_init
  BEFORE INSERT ON public.finance_counterparty_agreements
  FOR EACH ROW EXECUTE FUNCTION public.finance_agreement_init_remaining();

DROP TRIGGER IF EXISTS trg_finance_counterparty_agreements_updated ON public.finance_counterparty_agreements;
CREATE TRIGGER trg_finance_counterparty_agreements_updated
  BEFORE UPDATE ON public.finance_counterparty_agreements
  FOR EACH ROW EXECUTE FUNCTION public.finance_ledger_touch_updated_at();

-- ---------- RLS ----------
ALTER TABLE public.finance_counterparty_agreements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_cp_agreements_select" ON public.finance_counterparty_agreements;
CREATE POLICY "finance_cp_agreements_select" ON public.finance_counterparty_agreements
  FOR SELECT TO authenticated USING (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_cp_agreements_insert" ON public.finance_counterparty_agreements;
CREATE POLICY "finance_cp_agreements_insert" ON public.finance_counterparty_agreements
  FOR INSERT TO authenticated WITH CHECK (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_cp_agreements_update" ON public.finance_counterparty_agreements;
CREATE POLICY "finance_cp_agreements_update" ON public.finance_counterparty_agreements
  FOR UPDATE TO authenticated USING (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  )
  WITH CHECK (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_cp_agreements_delete" ON public.finance_counterparty_agreements;
CREATE POLICY "finance_cp_agreements_delete" ON public.finance_counterparty_agreements
  FOR DELETE TO authenticated USING (public.staff_is_admin_active());

GRANT EXECUTE ON FUNCTION public.finance_agreement_recalc(uuid) TO authenticated;

COMMIT;
