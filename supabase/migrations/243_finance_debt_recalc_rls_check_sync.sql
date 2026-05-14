-- Borç ödemesi sonrası kalan tutar / durum güncellemesi: RLS yüzünden trigger içindeki UPDATE etkisiz kalabiliyordu.
-- Çek kaydı: borç ödemesinde finance_check_id ile bağlanan tutarlar toplanıp durum (paid / partial) senkronlanır.

BEGIN;

-- ---------- staff_debt: kalan + status (RLS kapalı) ----------
CREATE OR REPLACE FUNCTION public.staff_debt_recalc_remaining(p_debt_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  prin numeric;
  paid numeric;
BEGIN
  SELECT amount_principal INTO prin FROM public.staff_debt_entries WHERE id = p_debt_id;
  IF prin IS NULL THEN RETURN; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO paid FROM public.staff_debt_payments WHERE debt_entry_id = p_debt_id;
  UPDATE public.staff_debt_entries
  SET
    amount_remaining = GREATEST(0, prin - paid),
    status = CASE
      WHEN paid <= 0 THEN 'open'
      WHEN paid >= prin THEN 'closed'
      ELSE 'partial'
    END,
    updated_at = now()
  WHERE id = p_debt_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_staff_debt_payments_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.staff_debt_recalc_remaining(OLD.debt_entry_id);
    RETURN OLD;
  END IF;
  PERFORM public.staff_debt_recalc_remaining(NEW.debt_entry_id);
  RETURN NEW;
END;
$$;

-- ---------- finance_checks: "partial" durumu + borç ödemesi toplamına göre senkron ----------
ALTER TABLE public.finance_checks DROP CONSTRAINT IF EXISTS finance_checks_status_check;
ALTER TABLE public.finance_checks
  ADD CONSTRAINT finance_checks_status_check
  CHECK (status IN ('draft', 'registered', 'presented', 'partial', 'paid', 'bounced', 'cancelled'));

CREATE OR REPLACE FUNCTION public.finance_check_recalc_linked_payments(p_check_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  chk RECORD;
  paid_total numeric;
  new_status text;
BEGIN
  IF p_check_id IS NULL THEN RETURN; END IF;

  SELECT id, amount, status INTO chk FROM public.finance_checks WHERE id = p_check_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF chk.status IN ('bounced', 'cancelled') THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO paid_total
  FROM public.staff_debt_payments
  WHERE finance_check_id = p_check_id;

  IF paid_total <= 0 THEN
    IF chk.status IN ('paid', 'partial') THEN
      UPDATE public.finance_checks
      SET status = 'registered', updated_at = now()
      WHERE id = p_check_id AND status IN ('paid', 'partial');
    END IF;
    RETURN;
  END IF;

  UPDATE public.finance_checks
  SET status = new_status, updated_at = now()
  WHERE id = p_check_id
    AND status NOT IN ('bounced', 'cancelled')
    AND (status IS DISTINCT FROM new_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_staff_debt_payments_finance_check_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.finance_check_recalc_linked_payments(OLD.finance_check_id);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.finance_check_id IS DISTINCT FROM NEW.finance_check_id THEN
      PERFORM public.finance_check_recalc_linked_payments(OLD.finance_check_id);
    END IF;
    PERFORM public.finance_check_recalc_linked_payments(NEW.finance_check_id);
    RETURN NEW;
  END IF;
  PERFORM public.finance_check_recalc_linked_payments(NEW.finance_check_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_debt_payments_finance_check ON public.staff_debt_payments;
CREATE TRIGGER trg_staff_debt_payments_finance_check
  AFTER INSERT OR DELETE OR UPDATE OF amount, finance_check_id, debt_entry_id ON public.staff_debt_payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_staff_debt_payments_finance_check_sync();

COMMENT ON FUNCTION public.finance_check_recalc_linked_payments(uuid) IS
  'staff_debt_payments.finance_check_id üzerinden toplam tahsilat; çek tutarına göre paid veya partial.';

-- Mevcut verileri düzelt (trigger öncesi kapanmamış kayıtlar)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.staff_debt_entries LOOP
    PERFORM public.staff_debt_recalc_remaining(r.id);
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT finance_check_id AS cid FROM public.staff_debt_payments WHERE finance_check_id IS NOT NULL LOOP
    PERFORM public.finance_check_recalc_linked_payments(r.cid);
  END LOOP;
END $$;

COMMIT;
