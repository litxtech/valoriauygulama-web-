-- 484: entry_date yanlış sütun adı (record_date olmalı) — ay istatistikleri ve RPC hatası

BEGIN;

CREATE OR REPLACE FUNCTION public.breakfast_partner_portal_account_snapshot(p_payment_limit integer DEFAULT 40)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hotel_id uuid;
  v_counterparty_id uuid;
  v_open_balance numeric;
  v_month_start date;
  v_month_guests bigint;
  v_month_amount numeric;
  v_lifetime_total numeric;
  v_payments jsonb;
BEGIN
  v_hotel_id := public.breakfast_partner_user_hotel_id();
  IF v_hotel_id IS NULL THEN
    RETURN jsonb_build_object(
      'openBalance', 0,
      'monthGuestTotal', 0,
      'monthAmountTotal', 0,
      'lifetimeTotal', 0,
      'payments', '[]'::jsonb
    );
  END IF;

  SELECT h.counterparty_id INTO v_counterparty_id
  FROM public.breakfast_partner_hotels h
  WHERE h.id = v_hotel_id;

  IF v_counterparty_id IS NULL THEN
    v_open_balance := 0;
  ELSE
    SELECT coalesce(sum(a.amount_remaining), 0)
    INTO v_open_balance
    FROM public.finance_counterparty_agreements a
    WHERE a.counterparty_id = v_counterparty_id
      AND a.movement_kind = 'income'
      AND a.status IN ('open', 'partial')
      AND a.is_active = true;
  END IF;

  v_month_start := date_trunc('month', current_date)::date;

  SELECT
    coalesce(sum(e.guest_count), 0),
    coalesce(sum(e.line_total), 0)
  INTO v_month_guests, v_month_amount
  FROM public.breakfast_partner_daily_entries e
  WHERE e.partner_hotel_id = v_hotel_id
    AND e.record_date >= v_month_start;

  SELECT coalesce(sum(e.line_total), 0)
  INTO v_lifetime_total
  FROM public.breakfast_partner_daily_entries e
  WHERE e.partner_hotel_id = v_hotel_id;

  IF v_counterparty_id IS NULL THEN
    v_payments := '[]'::jsonb;
  ELSE
    SELECT coalesce(jsonb_agg(row_data ORDER BY movement_date DESC, created_at DESC), '[]'::jsonb)
    INTO v_payments
    FROM (
      SELECT jsonb_build_object(
        'id', m.id,
        'amount', m.amount,
        'movementDate', m.movement_date,
        'description', m.description,
        'paymentMethod', m.payment_method,
        'createdAt', m.created_at
      ) AS row_data,
      m.movement_date,
      m.created_at
      FROM public.finance_movements m
      WHERE m.counterparty_id = v_counterparty_id
        AND m.kind = 'income'
      ORDER BY m.movement_date DESC, m.created_at DESC
      LIMIT greatest(1, least(coalesce(p_payment_limit, 40), 100))
    ) sub;
  END IF;

  RETURN jsonb_build_object(
    'openBalance', coalesce(v_open_balance, 0),
    'monthGuestTotal', coalesce(v_month_guests, 0),
    'monthAmountTotal', coalesce(v_month_amount, 0),
    'lifetimeTotal', coalesce(v_lifetime_total, 0),
    'payments', coalesce(v_payments, '[]'::jsonb)
  );
END;
$$;

COMMIT;
