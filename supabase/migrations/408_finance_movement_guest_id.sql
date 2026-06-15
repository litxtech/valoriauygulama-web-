-- Gelir kaydı: misafir bağlantısı + Stripe otomatik kayıtta guest_id

BEGIN;

ALTER TABLE public.finance_movements
  ADD COLUMN IF NOT EXISTS guest_id uuid REFERENCES public.guests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_finance_movements_guest
  ON public.finance_movements (guest_id)
  WHERE guest_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_stripe_payment_income(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.payment_requests%ROWTYPE;
  v_guest_name text;
  v_staff_name text;
  v_lane text;
  v_desc text;
  v_movement_id uuid;
BEGIN
  SELECT * INTO v_row FROM public.payment_requests WHERE id = p_request_id;
  IF NOT FOUND OR v_row.status IS DISTINCT FROM 'paid' THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_movement_id
  FROM public.finance_movements
  WHERE source_payment_request_id = p_request_id
  LIMIT 1;
  IF v_movement_id IS NOT NULL THEN
    RETURN v_movement_id;
  END IF;

  IF v_row.guest_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(trim(full_name), ''), 'Misafir') INTO v_guest_name
    FROM public.guests WHERE id = v_row.guest_id;
  END IF;

  IF v_row.created_by_staff_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(trim(full_name), ''), 'Personel') INTO v_staff_name
    FROM public.staff WHERE id = v_row.created_by_staff_id;
  END IF;

  v_lane := CASE
    WHEN v_row.service_kind = 'staff_tip' THEN 'tips'
    WHEN v_row.service_kind IN ('food', 'dining') THEN 'kitchen'
    ELSE 'hotel'
  END;

  v_desc := trim(COALESCE(v_row.title, 'Stripe ödeme'));
  IF v_guest_name IS NOT NULL THEN
    v_desc := v_desc || ' · Misafir: ' || v_guest_name;
  END IF;
  IF v_staff_name IS NOT NULL THEN
    v_desc := v_desc || ' · Kayıt: ' || v_staff_name;
  END IF;

  INSERT INTO public.finance_movements (
    organization_id,
    kind,
    amount,
    currency,
    movement_date,
    payment_method,
    category,
    counterparty_name,
    guest_id,
    description,
    source_payment_request_id,
    created_by_staff_id
  ) VALUES (
    v_row.organization_id,
    'income',
    v_row.amount,
    upper(v_row.currency),
    COALESCE((v_row.paid_at AT TIME ZONE 'UTC')::date, CURRENT_DATE),
    'card',
    public.payment_service_kind_ledger_category(v_row.service_kind),
    COALESCE(v_guest_name, v_staff_name),
    v_row.guest_id,
    v_desc,
    p_request_id,
    v_row.created_by_staff_id
  )
  RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$;

COMMIT;
