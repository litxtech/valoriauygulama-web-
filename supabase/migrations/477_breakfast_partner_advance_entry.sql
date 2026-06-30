-- Partner: yarınki kahvaltıyı bugün (23:59'a kadar) bildirebilsin; hatırlatıcı yarını kontrol etsin.

BEGIN;

CREATE OR REPLACE FUNCTION public.breakfast_partner_upsert_daily_entry(
  p_record_date date,
  p_guest_count integer,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_hotel_id uuid;
  v_hotel record;
  v_unit_price numeric;
  v_line_total numeric;
  v_entry_id uuid;
  v_agreement_id uuid;
  v_title text;
  v_today date;
  v_local_ts timestamp;
BEGIN
  v_hotel_id := public.breakfast_partner_current_hotel_id();
  IF v_hotel_id IS NULL THEN
    RAISE EXCEPTION 'Partner otel hesabı bulunamadı veya askıda.';
  END IF;

  SELECT * INTO v_hotel FROM public.breakfast_partner_hotels h WHERE h.id = v_hotel_id;
  IF NOT FOUND OR v_hotel.status <> 'active' THEN
    RAISE EXCEPTION 'Partner otel aktif değil.';
  END IF;

  v_local_ts := timezone('Europe/Istanbul', now());
  v_today := v_local_ts::date;

  IF p_record_date > v_today + 1 THEN
    RAISE EXCEPTION 'En fazla yarın için ön bildirim yapılabilir.';
  END IF;

  IF p_record_date > v_today THEN
    IF v_local_ts::time >= time '23:59:00' THEN
      RAISE EXCEPTION 'Yarın için kayıt süresi doldu (23:59). Kahvaltı gününde bugün sekmesinden girebilirsiniz.';
    END IF;
  END IF;

  IF p_record_date < v_today - 30 THEN
    RAISE EXCEPTION 'En fazla son 30 gün için kayıt girilebilir.';
  END IF;
  IF p_guest_count IS NULL OR p_guest_count < 0 THEN
    RAISE EXCEPTION 'Kişi sayısı geçersiz.';
  END IF;

  v_unit_price := public.breakfast_partner_resolve_unit_price(v_hotel_id);
  IF p_guest_count > 0 AND COALESCE(v_unit_price, 0) <= 0 THEN
    RAISE EXCEPTION 'Birim fiyat tanımlı değil. Yöneticinizle iletişime geçin.';
  END IF;

  v_line_total := round(p_guest_count * COALESCE(v_unit_price, 0), 2);
  v_title := 'Kahvaltı ' || to_char(p_record_date, 'DD.MM.YYYY') || ' — ' || p_guest_count::text || ' kişi';

  SELECT e.id, e.agreement_id
  INTO v_entry_id, v_agreement_id
  FROM public.breakfast_partner_daily_entries e
  WHERE e.partner_hotel_id = v_hotel_id AND e.record_date = p_record_date;

  IF v_entry_id IS NULL THEN
    INSERT INTO public.breakfast_partner_daily_entries (
      partner_hotel_id, organization_id, record_date, guest_count,
      unit_price_snapshot, line_total, note, created_by_auth_id, updated_by_auth_id
    )
    VALUES (
      v_hotel_id, v_hotel.organization_id, p_record_date, p_guest_count,
      COALESCE(v_unit_price, 0), v_line_total, NULLIF(trim(COALESCE(p_note, '')), ''),
      auth.uid(), auth.uid()
    )
    RETURNING id INTO v_entry_id;
  ELSE
    UPDATE public.breakfast_partner_daily_entries
    SET
      guest_count = p_guest_count,
      unit_price_snapshot = COALESCE(v_unit_price, 0),
      line_total = v_line_total,
      note = NULLIF(trim(COALESCE(p_note, '')), ''),
      updated_by_auth_id = auth.uid()
    WHERE id = v_entry_id;
  END IF;

  IF p_guest_count <= 0 OR v_line_total <= 0 THEN
    IF v_agreement_id IS NOT NULL THEN
      UPDATE public.finance_counterparty_agreements
      SET status = 'cancelled', is_active = false, updated_at = now()
      WHERE id = v_agreement_id;
      UPDATE public.breakfast_partner_daily_entries
      SET agreement_id = NULL WHERE id = v_entry_id;
    END IF;
    RETURN v_entry_id;
  END IF;

  IF v_agreement_id IS NULL THEN
    INSERT INTO public.finance_counterparty_agreements (
      organization_id, counterparty_id, title, target_amount,
      started_on, notes, movement_kind, is_active, status
    )
    VALUES (
      v_hotel.organization_id, v_hotel.counterparty_id, v_title, v_line_total,
      p_record_date, NULLIF(trim(COALESCE(p_note, '')), ''), 'income', true, 'open'
    )
    RETURNING id INTO v_agreement_id;

    UPDATE public.breakfast_partner_daily_entries
    SET agreement_id = v_agreement_id
    WHERE id = v_entry_id;
  ELSE
    UPDATE public.finance_counterparty_agreements
    SET
      title = v_title,
      target_amount = v_line_total,
      started_on = p_record_date,
      notes = NULLIF(trim(COALESCE(p_note, '')), ''),
      status = CASE WHEN status = 'cancelled' THEN 'open' ELSE status END,
      is_active = true,
      updated_at = now()
    WHERE id = v_agreement_id;

    PERFORM public.finance_agreement_recalc(v_agreement_id);
  END IF;

  RETURN v_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_breakfast_partner_missing_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg record;
  v_local timestamp;
  v_minutes_now int;
  v_minutes_target int;
  v_today date;
  v_target date;
  v_missing record;
  v_partner_ids uuid[];
  v_kitchen_ids uuid[];
  v_filtered_kitchen uuid[];
  v_missing_names text[];
  v_missing_count int;
  v_title text;
  v_body text;
  v_partner_title text;
  v_partner_body text;
  v_payload jsonb;
  v_sent int := 0;
  v_push_url text := 'https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/send-expo-push';
  v_admin_url text := 'https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/notify-admins';
BEGIN
  FOR v_cfg IN
    SELECT *
    FROM public.breakfast_partner_settings
    WHERE feature_enabled = true
      AND remind_enabled = true
  LOOP
    v_local := timezone(coalesce(v_cfg.remind_timezone, 'Europe/Istanbul'), now());
    v_today := v_local::date;
    v_target := v_today + 1;
    v_minutes_now := extract(hour FROM v_local)::int * 60 + extract(minute FROM v_local)::int;
    v_minutes_target := extract(hour FROM v_cfg.remind_time)::int * 60
      + extract(minute FROM v_cfg.remind_time)::int;

    IF abs(v_minutes_now - v_minutes_target) > 10 THEN
      CONTINUE;
    END IF;

    IF v_cfg.last_remind_date = v_today THEN
      CONTINUE;
    END IF;

    v_missing_names := ARRAY[]::text[];
    v_missing_count := 0;

    FOR v_missing IN
      SELECT h.id, h.name
      FROM public.breakfast_partner_hotels h
      WHERE h.organization_id = v_cfg.organization_id
        AND h.status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM public.breakfast_partner_daily_entries e
          WHERE e.partner_hotel_id = h.id
            AND e.record_date = v_target
        )
    LOOP
      v_missing_count := v_missing_count + 1;
      IF array_length(v_missing_names, 1) IS NULL OR array_length(v_missing_names, 1) < 5 THEN
        v_missing_names := array_append(v_missing_names, v_missing.name);
      END IF;

      v_partner_ids := public.breakfast_partner_user_ids_for_hotel(v_missing.id);
      IF v_partner_ids IS NOT NULL AND array_length(v_partner_ids, 1) > 0 THEN
        v_partner_title := 'Yarınki kahvaltı sayısı bekleniyor';
        v_partner_body := format(
          'Yarın (%s) için kişi sayısını bugün 23:59''a kadar girin.',
          to_char(v_target, 'DD.MM.YYYY')
        );
        v_payload := jsonb_build_object(
          'notificationType', 'breakfast_partner_remind',
          'screen', '/partner/(tabs)',
          'url', '/partner/(tabs)'
        );
        PERFORM net.http_post(
          url := v_push_url,
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body := jsonb_build_object(
            'partnerUserIds', to_jsonb(v_partner_ids),
            'title', v_partner_title,
            'body', v_partner_body,
            'data', v_payload
          ),
          timeout_milliseconds := 15000
        );
      END IF;
    END LOOP;

    IF v_missing_count > 0 THEN
      v_title := 'Partner kahvaltı — yarın eksik giriş';
      v_body := v_missing_count::text || ' otel yarın için henüz sayı girmedi';
      IF array_length(v_missing_names, 1) > 0 THEN
        v_body := v_body || ': ' || array_to_string(v_missing_names, ', ');
        IF v_missing_count > array_length(v_missing_names, 1) THEN
          v_body := v_body || '…';
        END IF;
      END IF;

      v_payload := jsonb_build_object(
        'notificationType', 'breakfast_partner_remind',
        'screen', '/staff/breakfast-partners',
        'url', '/staff/breakfast-partners',
        'recordDate', v_target::text
      );

      v_kitchen_ids := public.breakfast_partner_kitchen_staff_ids(v_cfg.organization_id);
      IF v_kitchen_ids IS NOT NULL AND array_length(v_kitchen_ids, 1) > 0 THEN
        SELECT coalesce(array_agg(f.staff_id), ARRAY[]::uuid[])
        INTO v_filtered_kitchen
        FROM public.filter_staff_notification_recipients(v_kitchen_ids, 'breakfast_partner_remind') f;

        IF v_filtered_kitchen IS NOT NULL AND array_length(v_filtered_kitchen, 1) > 0 THEN
          PERFORM net.http_post(
            url := v_push_url,
            headers := jsonb_build_object('Content-Type', 'application/json'),
            body := jsonb_build_object(
              'staffIds', to_jsonb(v_filtered_kitchen),
              'title', v_title,
              'body', left(v_body, 240),
              'data', v_payload
            ),
            timeout_milliseconds := 15000
          );
        END IF;
      END IF;

      PERFORM net.http_post(
        url := v_admin_url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'title', v_title,
          'body', left(v_body, 240),
          'data', v_payload
        ),
        timeout_milliseconds := 15000
      );
    END IF;

    UPDATE public.breakfast_partner_settings
    SET last_remind_date = v_today
    WHERE organization_id = v_cfg.organization_id;

    v_sent := v_sent + 1;
  END LOOP;

  RETURN v_sent;
END;
$$;

COMMENT ON FUNCTION public.send_breakfast_partner_missing_reminders() IS
  'Aktif partner otellerde yarın kayıt yoksa partner + mutfak + admin hatırlatması (günde bir, remind_time ±10 dk).';

COMMIT;
