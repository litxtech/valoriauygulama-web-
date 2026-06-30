-- Partner cari: Stripe Checkout ödemesi → tahsilat hareketleri (alacak planlarına dağıtım)

BEGIN;

ALTER TABLE public.payment_requests DROP CONSTRAINT IF EXISTS payment_requests_service_kind_check;
ALTER TABLE public.payment_requests
  ADD CONSTRAINT payment_requests_service_kind_check
  CHECK (service_kind IN (
    'food', 'amenity', 'room_service', 'transfer', 'dining', 'generic', 'other', 'staff_tip', 'breakfast_partner'
  ));

CREATE OR REPLACE FUNCTION public.payment_service_kind_ledger_category(p_kind text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_kind
    WHEN 'staff_tip' THEN 'bahsis'
    WHEN 'food' THEN 'mutfak_yemek'
    WHEN 'dining' THEN 'mutfak_restoran'
    WHEN 'room_service' THEN 'oda_servisi'
    WHEN 'amenity' THEN 'otel_hizmet'
    WHEN 'transfer' THEN 'transfer_tur'
    WHEN 'breakfast_partner' THEN 'sales'
    WHEN 'generic' THEN 'otel_genel'
    WHEN 'other' THEN 'diger'
    ELSE 'stripe_odeme'
  END;
$$;

DROP INDEX IF EXISTS idx_finance_movements_source_payment_request;
CREATE INDEX IF NOT EXISTS idx_finance_movements_source_payment_request
  ON public.finance_movements (source_payment_request_id)
  WHERE source_payment_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_breakfast_partner_stripe_payment(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_row public.payment_requests%ROWTYPE;
  v_hotel_id uuid;
  v_counterparty_id uuid;
  v_hotel_name text;
  v_remaining numeric;
  v_agreement record;
  v_apply numeric;
  v_movement_id uuid;
  v_first_movement uuid;
  v_desc text;
BEGIN
  SELECT * INTO v_row FROM public.payment_requests WHERE id = p_request_id;
  IF NOT FOUND OR v_row.status IS DISTINCT FROM 'paid' THEN
    RETURN NULL;
  END IF;
  IF v_row.service_kind IS DISTINCT FROM 'breakfast_partner' THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_first_movement
  FROM public.finance_movements
  WHERE source_payment_request_id = p_request_id
  LIMIT 1;
  IF v_first_movement IS NOT NULL THEN
    RETURN v_first_movement;
  END IF;

  v_hotel_id := v_row.reference_id;
  IF v_hotel_id IS NULL THEN
    v_hotel_id := NULLIF(trim(v_row.metadata->>'partner_hotel_id'), '')::uuid;
  END IF;
  IF v_hotel_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT h.counterparty_id, h.name
  INTO v_counterparty_id, v_hotel_name
  FROM public.breakfast_partner_hotels h
  WHERE h.id = v_hotel_id;

  IF v_counterparty_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_remaining := v_row.amount;
  v_desc := trim(COALESCE(v_row.title, 'Kahvaltı cari ödemesi'));

  FOR v_agreement IN
    SELECT a.id, a.amount_remaining
    FROM public.finance_counterparty_agreements a
    WHERE a.counterparty_id = v_counterparty_id
      AND a.movement_kind = 'income'
      AND a.status IN ('open', 'partial')
      AND a.is_active = true
      AND a.amount_remaining > 0
    ORDER BY a.started_on ASC NULLS LAST, a.created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_apply := LEAST(v_remaining, v_agreement.amount_remaining);
    IF v_apply <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.finance_movements (
      organization_id,
      kind,
      amount,
      currency,
      movement_date,
      payment_method,
      category,
      counterparty_id,
      counterparty_name,
      description,
      agreement_id,
      source_payment_request_id,
      ledger_scope
    )
    VALUES (
      v_row.organization_id,
      'income',
      v_apply,
      upper(v_row.currency),
      COALESCE((v_row.paid_at AT TIME ZONE 'UTC')::date, CURRENT_DATE),
      'card',
      public.payment_service_kind_ledger_category(v_row.service_kind),
      v_counterparty_id,
      v_hotel_name,
      v_desc || ' · Stripe',
      v_agreement.id,
      p_request_id,
      'hotel'
    )
    RETURNING id INTO v_movement_id;

    IF v_first_movement IS NULL THEN
      v_first_movement := v_movement_id;
    END IF;

    v_remaining := v_remaining - v_apply;
  END LOOP;

  IF v_remaining > 0 THEN
    INSERT INTO public.finance_movements (
      organization_id,
      kind,
      amount,
      currency,
      movement_date,
      payment_method,
      category,
      counterparty_id,
      counterparty_name,
      description,
      source_payment_request_id,
      ledger_scope
    )
    VALUES (
      v_row.organization_id,
      'income',
      v_remaining,
      upper(v_row.currency),
      COALESCE((v_row.paid_at AT TIME ZONE 'UTC')::date, CURRENT_DATE),
      'card',
      public.payment_service_kind_ledger_category(v_row.service_kind),
      v_counterparty_id,
      v_hotel_name,
      v_desc || ' · Stripe (genel)',
      p_request_id,
      'hotel'
    )
    RETURNING id INTO v_movement_id;

    IF v_first_movement IS NULL THEN
      v_first_movement := v_movement_id;
    END IF;
  END IF;

  RETURN v_first_movement;
END;
$$;

REVOKE ALL ON FUNCTION public.record_breakfast_partner_stripe_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_breakfast_partner_stripe_payment(uuid) TO service_role;

COMMENT ON FUNCTION public.record_breakfast_partner_stripe_payment IS
  'Stripe partner cari ödemesi → tahsilat hareketleri; açık alacak planlarına FIFO dağıtım.';

COMMIT;
