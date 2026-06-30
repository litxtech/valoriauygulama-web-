-- Partner portal: kahvaltı kayıtları + açık alacak tutarı; tek kayıt Stripe ödemesi

BEGIN;

CREATE OR REPLACE FUNCTION public.breakfast_partner_daily_entries_ledger(p_limit int DEFAULT 31)
RETURNS TABLE (
  id uuid,
  partner_hotel_id uuid,
  organization_id uuid,
  record_date date,
  guest_count int,
  unit_price_snapshot numeric,
  line_total numeric,
  note text,
  agreement_id uuid,
  amount_remaining numeric,
  agreement_status text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hotel_id uuid;
BEGIN
  v_hotel_id := public.breakfast_partner_current_hotel_id();
  IF v_hotel_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.partner_hotel_id,
    e.organization_id,
    e.record_date,
    e.guest_count,
    e.unit_price_snapshot,
    e.line_total,
    e.note,
    e.agreement_id,
    coalesce(a.amount_remaining, 0)::numeric AS amount_remaining,
    a.status AS agreement_status,
    e.created_at,
    e.updated_at
  FROM public.breakfast_partner_daily_entries e
  LEFT JOIN public.finance_counterparty_agreements a ON a.id = e.agreement_id AND a.is_active = true
  WHERE e.partner_hotel_id = v_hotel_id
  ORDER BY e.record_date DESC, e.updated_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 31), 120));
END;
$$;

REVOKE ALL ON FUNCTION public.breakfast_partner_daily_entries_ledger(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.breakfast_partner_daily_entries_ledger(int) TO authenticated;

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
  v_target_agreement uuid;
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
  v_target_agreement := NULLIF(trim(v_row.metadata->>'agreement_id'), '')::uuid;

  IF v_target_agreement IS NOT NULL THEN
    SELECT a.id, a.amount_remaining
    INTO v_agreement
    FROM public.finance_counterparty_agreements a
    WHERE a.id = v_target_agreement
      AND a.counterparty_id = v_counterparty_id
      AND a.movement_kind = 'income'
      AND a.status IN ('open', 'partial')
      AND a.is_active = true
      AND a.amount_remaining > 0;

    IF v_agreement.id IS NOT NULL THEN
      v_apply := LEAST(v_remaining, v_agreement.amount_remaining);
      IF v_apply > 0 THEN
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

        v_first_movement := v_movement_id;
        v_remaining := v_remaining - v_apply;
      END IF;
    END IF;
  END IF;

  FOR v_agreement IN
    SELECT a.id, a.amount_remaining
    FROM public.finance_counterparty_agreements a
    WHERE a.counterparty_id = v_counterparty_id
      AND a.movement_kind = 'income'
      AND a.status IN ('open', 'partial')
      AND a.is_active = true
      AND a.amount_remaining > 0
      AND (v_target_agreement IS NULL OR a.id IS DISTINCT FROM v_target_agreement)
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

COMMIT;
