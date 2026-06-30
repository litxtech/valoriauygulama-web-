-- Çek bildirimi: tarih + vade günü seçimi; içerikte çek detayları

BEGIN;

ALTER TABLE public.finance_check_notify_settings
  ADD COLUMN IF NOT EXISTS notify_first_date date,
  ADD COLUMN IF NOT EXISTS notify_lead_days integer[] NOT NULL DEFAULT '{0,7}';

COMMENT ON COLUMN public.finance_check_notify_settings.notify_first_date IS
  'Bildirimlerin başlayacağı ilk tarih (boş = hemen).';
COMMENT ON COLUMN public.finance_check_notify_settings.notify_lead_days IS
  'Vadeden kaç gün önce / vade gününde (0) hatırlatma gönderilir.';

CREATE OR REPLACE FUNCTION public.finance_check_status_label_tr(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_status
    WHEN 'draft' THEN 'Taslak'
    WHEN 'registered' THEN 'Çek girildi'
    WHEN 'presented' THEN 'İbraz'
    WHEN 'partial' THEN 'Kısmi tahsil'
    WHEN 'paid' THEN 'Ödendi'
    WHEN 'bounced' THEN 'Ödenmedi'
    WHEN 'cancelled' THEN 'İptal'
    ELSE coalesce(p_status, '—')
  END;
$$;

CREATE OR REPLACE FUNCTION public.finance_check_direction_label_tr(p_direction text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_direction
    WHEN 'given' THEN 'Verilen çek'
    WHEN 'received' THEN 'Alınan çek'
    ELSE coalesce(p_direction, 'Çek')
  END;
$$;

CREATE OR REPLACE FUNCTION public.finance_check_notify_body(p_check public.finance_checks)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT trim(both FROM concat_ws(' · ',
    public.finance_check_direction_label_tr(p_check.direction),
    p_check.counterparty_name,
    to_char(p_check.amount, 'FM999G999G999D00') || ' TL',
    CASE WHEN p_check.due_date IS NOT NULL THEN 'Vade ' || to_char(p_check.due_date, 'DD.MM.YYYY') ELSE NULL END,
    NULLIF(trim(coalesce(p_check.bank_name, '') ||
      CASE WHEN coalesce(p_check.branch_name, '') <> '' THEN ' / ' || p_check.branch_name ELSE '' END), ''),
    CASE WHEN coalesce(p_check.check_number, '') <> '' THEN 'Çek no ' || p_check.check_number ELSE NULL END,
    public.finance_check_status_label_tr(p_check.status)
  ));
$$;

CREATE OR REPLACE FUNCTION public.send_finance_check_due_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg record;
  v_local timestamp;
  v_today date;
  v_minutes_now int;
  v_minutes_start int;
  v_staff_ids uuid[];
  v_filtered uuid[];
  v_check record;
  v_title text;
  v_body text;
  v_payload jsonb;
  v_sent int := 0;
BEGIN
  FOR v_cfg IN
    SELECT *
    FROM public.finance_check_notify_settings
    WHERE enabled = true
      AND notify_staff_ids IS NOT NULL
      AND array_length(notify_staff_ids, 1) > 0
  LOOP
    v_local := timezone(coalesce(v_cfg.timezone, 'Europe/Istanbul'), now());
    v_today := v_local::date;
    v_minutes_now := extract(hour FROM v_local)::int * 60 + extract(minute FROM v_local)::int;
    v_minutes_start := extract(hour FROM v_cfg.notify_start_time)::int * 60
      + extract(minute FROM v_cfg.notify_start_time)::int;

    IF v_cfg.notify_first_date IS NOT NULL AND v_today < v_cfg.notify_first_date THEN
      CONTINUE;
    END IF;

    -- Günde bir kez, ayarlanan saatte (±14 dk)
    IF abs(v_minutes_now - v_minutes_start) > 14 THEN
      CONTINUE;
    END IF;

    IF v_cfg.last_sent_at IS NOT NULL
      AND (timezone(coalesce(v_cfg.timezone, 'Europe/Istanbul'), v_cfg.last_sent_at))::date = v_today THEN
      CONTINUE;
    END IF;

    v_staff_ids := public.finance_check_notify_staff_ids(v_cfg.organization_id);
    IF v_staff_ids IS NULL OR array_length(v_staff_ids, 1) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT array_agg(f.staff_id)
    INTO v_filtered
    FROM public.filter_staff_notification_recipients(v_staff_ids, 'finance_check_due') f;

    IF v_filtered IS NULL OR array_length(v_filtered, 1) IS NULL THEN
      UPDATE public.finance_check_notify_settings
      SET last_sent_at = now(), updated_at = now()
      WHERE organization_id = v_cfg.organization_id;
      CONTINUE;
    END IF;

    FOR v_check IN
      SELECT c.*
      FROM public.finance_checks c
      WHERE c.organization_id = v_cfg.organization_id
        AND c.due_date IS NOT NULL
        AND c.status NOT IN ('paid', 'cancelled')
        AND EXISTS (
          SELECT 1
          FROM unnest(coalesce(v_cfg.notify_lead_days, ARRAY[0])) AS ld(lead_day)
          WHERE c.due_date - ld.lead_day = v_today
        )
      ORDER BY c.due_date, c.counterparty_name
      LIMIT 40
    LOOP
      v_body := public.finance_check_notify_body(v_check);
      v_title := 'Çek: ' || left(v_check.counterparty_name, 48);

      IF coalesce(v_check.due_date, v_today) = v_today THEN
        v_title := 'Bugün vade · ' || v_title;
      END IF;

      v_payload := jsonb_build_object(
        'kind', 'finance_check_due',
        'notificationType', 'finance_check_due',
        'notification_type', 'finance_check_due',
        'feature_key', 'finance_checks',
        'url', '/admin/finance-checks/' || v_check.id::text,
        'screen', '/admin/finance-checks/' || v_check.id::text,
        'organizationId', v_cfg.organization_id::text,
        'financeCheckId', v_check.id::text,
        'dueDate', v_check.due_date::text,
        'amount', v_check.amount::text,
        'counterpartyName', v_check.counterparty_name
      );

      INSERT INTO public.notifications (
        staff_id, guest_id, title, body, category, notification_type, data, created_by, sent_via, sent_at
      )
      SELECT sid, NULL, v_title, v_body, 'staff', 'finance_check_due', v_payload, NULL, 'both', now()
      FROM unnest(v_filtered) AS sid;

      PERFORM net.http_post(
        url := 'https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/send-expo-push',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'staffIds', to_jsonb(v_filtered),
          'title', v_title,
          'body', left(v_body, 240),
          'data', v_payload
        ),
        timeout_milliseconds := 15000
      );

      v_sent := v_sent + 1;
    END LOOP;

    UPDATE public.finance_check_notify_settings
    SET last_sent_at = now(), updated_at = now()
    WHERE organization_id = v_cfg.organization_id;
  END LOOP;

  RETURN v_sent;
END;
$$;

COMMENT ON FUNCTION public.send_finance_check_due_reminders() IS
  'Seçilen vade günlerinde (lead days) eşleşen her çek için detaylı push gönderir; günde bir kez ayarlı saatte.';

COMMIT;
