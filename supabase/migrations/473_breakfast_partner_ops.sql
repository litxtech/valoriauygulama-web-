-- Partner kahvaltı: mutfak panosu RPC, hatırlatıcı cron, partner push token

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---------- Ayarlar: hatırlatıcı ----------
ALTER TABLE public.breakfast_partner_settings
  ADD COLUMN IF NOT EXISTS remind_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS remind_time time NOT NULL DEFAULT '09:30',
  ADD COLUMN IF NOT EXISTS remind_timezone text NOT NULL DEFAULT 'Europe/Istanbul',
  ADD COLUMN IF NOT EXISTS last_remind_date date;

COMMENT ON COLUMN public.breakfast_partner_settings.remind_enabled IS
  'Aktif partner otellere sabah kahvaltı sayısı girilmediyse hatırlatma push gönder.';

-- ---------- Mutfak / admin pano yetkisi ----------
CREATE OR REPLACE FUNCTION public.staff_can_view_breakfast_partner_board(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT
      s.role = 'admin'
      OR lower(coalesce(s.department, '')) IN (
        'kitchen', 'kitchen_staff', 'mutfak', 'chef', 'head_chef', 'pastry', 'restaurant'
      )
      OR coalesce((s.app_permissions->>'mutfak_operasyon')::boolean, false)
      OR coalesce((s.app_permissions->>'yemek_listesi_mutfak_onay')::boolean, false)
    FROM public.staff s
    WHERE s.auth_id = auth.uid()
      AND s.organization_id = p_org_id
      AND coalesce(s.is_active, true) = true
      AND s.deleted_at IS NULL
    LIMIT 1
  ), false);
$$;

GRANT EXECUTE ON FUNCTION public.staff_can_view_breakfast_partner_board(uuid) TO authenticated;

-- ---------- Günlük pano (mutfak + admin) ----------
CREATE OR REPLACE FUNCTION public.breakfast_partner_today_board(p_record_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_date date;
  v_hotels jsonb;
  v_summary jsonb;
BEGIN
  v_org_id := public.breakfast_partner_provider_org_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('recordDate', NULL, 'hotels', '[]'::jsonb, 'summary', '{}'::jsonb);
  END IF;

  IF NOT public.staff_can_view_breakfast_partner_board(v_org_id)
     AND NOT public.staff_can_manage_breakfast_partners(v_org_id) THEN
    RAISE EXCEPTION 'Partner kahvaltı panosunu görüntüleme yetkiniz yok.';
  END IF;

  v_date := coalesce(
    p_record_date,
    (timezone('Europe/Istanbul', now()))::date
  );

  SELECT coalesce(jsonb_agg(row_data ORDER BY hotel_name), '[]'::jsonb)
  INTO v_hotels
  FROM (
    SELECT
      h.name AS hotel_name,
      jsonb_build_object(
        'hotelId', h.id,
        'hotelName', h.name,
        'city', h.city,
        'guestCount', coalesce(e.guest_count, 0),
        'lineTotal', coalesce(e.line_total, 0),
        'note', e.note,
        'enteredAt', e.updated_at,
        'hasEntry', (e.id IS NOT NULL),
        'entryStatus', CASE
          WHEN e.id IS NULL THEN 'missing'
          WHEN coalesce(e.guest_count, 0) = 0 THEN 'zero'
          ELSE 'entered'
        END
      ) AS row_data
    FROM public.breakfast_partner_hotels h
    LEFT JOIN public.breakfast_partner_daily_entries e
      ON e.partner_hotel_id = h.id AND e.record_date = v_date
    WHERE h.organization_id = v_org_id
      AND h.status = 'active'
  ) sub;

  SELECT jsonb_build_object(
    'totalHotels', count(*)::int,
    'enteredCount', count(*) FILTER (WHERE coalesce(e.guest_count, 0) > 0)::int,
    'missingCount', count(*) FILTER (WHERE e.id IS NULL)::int,
    'zeroCount', count(*) FILTER (WHERE e.id IS NOT NULL AND coalesce(e.guest_count, 0) = 0)::int,
    'totalGuests', coalesce(sum(coalesce(e.guest_count, 0)), 0)::int,
    'totalAmount', coalesce(sum(CASE WHEN coalesce(e.guest_count, 0) > 0 THEN coalesce(e.line_total, 0) ELSE 0 END), 0)
  )
  INTO v_summary
  FROM public.breakfast_partner_hotels h
  LEFT JOIN public.breakfast_partner_daily_entries e
    ON e.partner_hotel_id = h.id AND e.record_date = v_date
  WHERE h.organization_id = v_org_id
    AND h.status = 'active';

  RETURN jsonb_build_object(
    'recordDate', v_date,
    'organizationId', v_org_id,
    'hotels', coalesce(v_hotels, '[]'::jsonb),
    'summary', coalesce(v_summary, '{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.breakfast_partner_today_board(date) TO authenticated;

-- ---------- Partner push token ----------
ALTER TABLE public.push_tokens
  ADD COLUMN IF NOT EXISTS breakfast_partner_user_id uuid REFERENCES public.breakfast_partner_users(id) ON DELETE CASCADE;

ALTER TABLE public.push_tokens DROP CONSTRAINT IF EXISTS push_recipient_check;
ALTER TABLE public.push_tokens ADD CONSTRAINT push_recipient_check CHECK (
  (
    guest_id IS NOT NULL
    AND staff_id IS NULL
    AND breakfast_partner_user_id IS NULL
  )
  OR (
    staff_id IS NOT NULL
    AND guest_id IS NULL
    AND breakfast_partner_user_id IS NULL
  )
  OR (
    breakfast_partner_user_id IS NOT NULL
    AND guest_id IS NULL
    AND staff_id IS NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_partner_user
  ON public.push_tokens (breakfast_partner_user_id)
  WHERE breakfast_partner_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.upsert_partner_push_token(p_token text, p_device_info jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_user_id uuid;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN;
  END IF;

  SELECT u.id
  INTO v_partner_user_id
  FROM public.breakfast_partner_users u
  WHERE u.auth_id = auth.uid()
    AND u.is_active = true
  LIMIT 1;

  IF v_partner_user_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.push_tokens (guest_id, staff_id, breakfast_partner_user_id, token, device_info)
  VALUES (NULL, NULL, v_partner_user_id, btrim(p_token), coalesce(p_device_info, '{}'::jsonb))
  ON CONFLICT (token) DO UPDATE SET
    breakfast_partner_user_id = EXCLUDED.breakfast_partner_user_id,
    guest_id = NULL,
    staff_id = NULL,
    device_info = EXCLUDED.device_info;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_partner_push_token(text, jsonb) TO authenticated;

-- ---------- Mutfak personel id listesi (cron) ----------
CREATE OR REPLACE FUNCTION public.breakfast_partner_kitchen_staff_ids(p_org_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT s.id), ARRAY[]::uuid[])
  FROM public.staff s
  WHERE s.organization_id = p_org_id
    AND coalesce(s.is_active, true) = true
    AND s.deleted_at IS NULL
    AND (
      lower(coalesce(s.department, '')) IN (
        'kitchen', 'kitchen_staff', 'mutfak', 'chef', 'head_chef', 'pastry', 'restaurant'
      )
      OR coalesce((s.app_permissions->>'mutfak_operasyon')::boolean, false)
      OR coalesce((s.app_permissions->>'yemek_listesi_mutfak_onay')::boolean, false)
    );
$$;

-- ---------- Partner kullanıcı id listesi (otel bazlı) ----------
CREATE OR REPLACE FUNCTION public.breakfast_partner_user_ids_for_hotel(p_hotel_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(u.id), ARRAY[]::uuid[])
  FROM public.breakfast_partner_users u
  WHERE u.partner_hotel_id = p_hotel_id
    AND u.is_active = true;
$$;

-- ---------- Eksik giriş hatırlatıcısı ----------
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
            AND e.record_date = v_today
        )
    LOOP
      v_missing_count := v_missing_count + 1;
      IF array_length(v_missing_names, 1) IS NULL OR array_length(v_missing_names, 1) < 5 THEN
        v_missing_names := array_append(v_missing_names, v_missing.name);
      END IF;

      v_partner_ids := public.breakfast_partner_user_ids_for_hotel(v_missing.id);
      IF v_partner_ids IS NOT NULL AND array_length(v_partner_ids, 1) > 0 THEN
        v_partner_title := 'Kahvaltı sayısı bekleniyor';
        v_partner_body := format('Bugün (%s) kişi sayısını girmeyi unutmayın.', to_char(v_today, 'DD.MM.YYYY'));
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
      v_title := 'Partner kahvaltı — eksik giriş';
      v_body := v_missing_count::text || ' otel henüz sayı girmedi';
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
        'adminUrl', '/admin/breakfast-partners',
        'organizationId', v_cfg.organization_id::text,
        'missingCount', v_missing_count
      );

      v_kitchen_ids := public.breakfast_partner_kitchen_staff_ids(v_cfg.organization_id);
      IF v_kitchen_ids IS NOT NULL AND array_length(v_kitchen_ids, 1) > 0 THEN
        SELECT array_agg(f.staff_id)
        INTO v_filtered_kitchen
        FROM public.filter_staff_notification_recipients(v_kitchen_ids, 'breakfast_partner_remind') f;

        IF v_filtered_kitchen IS NOT NULL AND array_length(v_filtered_kitchen, 1) > 0 THEN
          INSERT INTO public.notifications (
            staff_id, guest_id, title, body, category, notification_type, data, created_by, sent_via, sent_at
          )
          SELECT sid, NULL, v_title, v_body, 'staff', 'breakfast_partner_remind', v_payload, NULL, 'both', now()
          FROM unnest(v_filtered_kitchen) AS sid;

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
    SET last_remind_date = v_today, updated_at = now()
    WHERE organization_id = v_cfg.organization_id;

    v_sent := v_sent + 1;
  END LOOP;

  RETURN v_sent;
END;
$$;

COMMENT ON FUNCTION public.send_breakfast_partner_missing_reminders() IS
  'Aktif partner otellerde bugün kayıt yoksa partner + mutfak + admin hatırlatması (günde bir, remind_time ±10 dk).';

REVOKE ALL ON FUNCTION public.send_breakfast_partner_missing_reminders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_breakfast_partner_missing_reminders() TO postgres;

-- ---------- Partner tahsilat bildirimi (cari tahsilat) ----------
CREATE OR REPLACE FUNCTION public.breakfast_partner_notify_payment_on_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hotel record;
  v_partner_ids uuid[];
  v_title text;
  v_body text;
  v_payload jsonb;
  v_push_url text := 'https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/send-expo-push';
BEGIN
  IF NEW.counterparty_id IS NULL OR NEW.kind <> 'income' THEN
    RETURN NEW;
  END IF;

  SELECT h.id, h.name
  INTO v_hotel
  FROM public.breakfast_partner_hotels h
  WHERE h.counterparty_id = NEW.counterparty_id
    AND h.status = 'active'
  LIMIT 1;

  IF v_hotel.id IS NULL THEN
    RETURN NEW;
  END IF;

  v_partner_ids := public.breakfast_partner_user_ids_for_hotel(v_hotel.id);
  IF v_partner_ids IS NULL OR array_length(v_partner_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  v_title := 'Tahsilat alındı';
  v_body := format(
    '%s tutarında tahsilat kaydedildi.',
    to_char(NEW.amount, 'FM999G999G990D00') || ' ₺'
  );
  v_payload := jsonb_build_object(
    'notificationType', 'breakfast_partner_payment',
    'screen', '/partner/(tabs)/account',
    'url', '/partner/(tabs)/account',
    'amount', NEW.amount,
    'hotelName', v_hotel.name
  );

  PERFORM net.http_post(
    url := v_push_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'partnerUserIds', to_jsonb(v_partner_ids),
      'title', v_title,
      'body', v_body,
      'data', v_payload
    ),
    timeout_milliseconds := 15000
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_breakfast_partner_payment_notify ON public.finance_movements;
CREATE TRIGGER trg_breakfast_partner_payment_notify
  AFTER INSERT ON public.finance_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.breakfast_partner_notify_payment_on_movement();

DO $$
BEGIN
  PERFORM cron.unschedule('breakfast_partner_remind_tr')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'breakfast_partner_remind_tr');
  PERFORM cron.schedule(
    'breakfast_partner_remind_tr',
    '*/15 * * * *',
    'SELECT public.send_breakfast_partner_missing_reminders();'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron breakfast_partner_remind schedule skipped: %', SQLERRM;
END;
$$;

COMMIT;
