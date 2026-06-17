-- Kişi ödemeleri: alacak planları (tahsilat ile kapanır) ve borç planları (ödeme ile kapanır)

BEGIN;

ALTER TABLE public.finance_counterparty_agreements
  ADD COLUMN IF NOT EXISTS movement_kind text NOT NULL DEFAULT 'expense'
    CHECK (movement_kind IN ('expense', 'income'));

COMMENT ON COLUMN public.finance_counterparty_agreements.movement_kind IS
  'expense = biz borçluyuz (ödeme ile kapanır); income = bize borçlu (tahsilat ile kapanır).';

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
  mk text;
BEGIN
  SELECT target_amount, movement_kind INTO tgt, mk
  FROM public.finance_counterparty_agreements
  WHERE id = p_agreement_id;
  IF tgt IS NULL THEN RETURN; END IF;
  mk := COALESCE(mk, 'expense');

  SELECT COALESCE(SUM(m.amount), 0) INTO paid
  FROM public.finance_movements m
  WHERE m.agreement_id = p_agreement_id
    AND m.kind = mk;

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
  expected_kind text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    aid := OLD.agreement_id;
    IF aid IS NOT NULL THEN
      PERFORM public.finance_agreement_recalc(aid);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.agreement_id IS NOT NULL THEN
    SELECT a.counterparty_id, a.movement_kind INTO cp_agreement, expected_kind
    FROM public.finance_counterparty_agreements a
    WHERE a.id = NEW.agreement_id;
    IF cp_agreement IS NULL THEN
      RAISE EXCEPTION 'Geçersiz ödeme planı';
    END IF;
    expected_kind := COALESCE(expected_kind, 'expense');
    IF NEW.kind IS DISTINCT FROM expected_kind THEN
      RAISE EXCEPTION 'Bu kayıt plan türü ile uyuşmuyor (beklenen: %)', expected_kind;
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

COMMIT;
