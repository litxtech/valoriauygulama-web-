-- Çek vadesi hatırlatma: işletme bazlı ayar + 2 saatte bir push (seçili personele)

BEGIN;

CREATE TABLE IF NOT EXISTS public.finance_check_notify_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  notify_staff_ids uuid[] NOT NULL DEFAULT '{}',
  notify_start_time time NOT NULL DEFAULT '08:00',
  timezone text NOT NULL DEFAULT 'Europe/Istanbul',
  last_sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.finance_check_notify_settings IS
  'Çek vadesi push hatırlatması: başlangıç saatinden itibaren 2 saatte bir seçili personele.';

ALTER TABLE public.finance_check_notify_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_check_notify_settings_select ON public.finance_check_notify_settings;
CREATE POLICY finance_check_notify_settings_select ON public.finance_check_notify_settings
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    OR public.current_user_is_staff_admin()
  );

DROP POLICY IF EXISTS finance_check_notify_settings_write ON public.finance_check_notify_settings;
CREATE POLICY finance_check_notify_settings_write ON public.finance_check_notify_settings
  FOR ALL TO authenticated
  USING (public.current_user_is_staff_admin())
  WITH CHECK (public.current_user_is_staff_admin());

CREATE OR REPLACE FUNCTION public.finance_check_notify_staff_ids(p_org_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT s.id), ARRAY[]::uuid[])
  FROM public.finance_check_notify_settings cfg
  JOIN public.staff s ON s.id = ANY (cfg.notify_staff_ids)
  WHERE cfg.organization_id = p_org_id
    AND cfg.enabled = true
    AND s.organization_id = p_org_id
    AND s.is_active = true
    AND s.deleted_at IS NULL;
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
  v_minutes_now int;
  v_minutes_start int;
  v_elapsed int;
  v_slot int;
  v_staff_ids uuid[];
  v_filtered uuid[];
  v_overdue int;
  v_upcoming int;
  v_given_up int;
  v_recv_up int;
  v_title text;
  v_body text;
  v_payload jsonb;
  v_sent int := 0;
  v_today date;
  v_in7 date;
BEGIN
  FOR v_cfg IN
    SELECT *
    FROM public.finance_check_notify_settings
    WHERE enabled = true
      AND notify_staff_ids IS NOT NULL
      AND array_length(notify_staff_ids, 1) > 0
  LOOP
    v_local := timezone(coalesce(v_cfg.timezone, 'Europe/Istanbul'), now());
    v_minutes_now := extract(hour FROM v_local)::int * 60 + extract(minute FROM v_local)::int;
    v_minutes_start := extract(hour FROM v_cfg.notify_start_time)::int * 60
      + extract(minute FROM v_cfg.notify_start_time)::int;

    IF v_minutes_now < v_minutes_start THEN
      CONTINUE;
    END IF;

    v_elapsed := v_minutes_now - v_minutes_start;
    v_slot := v_elapsed / 120;
    IF v_slot < 0 THEN
      CONTINUE;
    END IF;

  -- Cron her 15 dk; 2 saatlik pencerede bir kez (±14 dk tolerans)
    IF (v_elapsed % 120) > 14 THEN
      CONTINUE;
    END IF;

    IF v_cfg.last_sent_at IS NOT NULL
      AND now() - v_cfg.last_sent_at < interval '100 minutes' THEN
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

    v_today := v_local::date;
    v_in7 := v_today + 7;

    SELECT count(*)::int
    INTO v_overdue
    FROM public.finance_checks c
    WHERE c.organization_id = v_cfg.organization_id
      AND c.due_date IS NOT NULL
      AND c.due_date < v_today
      AND c.status NOT IN ('paid', 'cancelled');

    SELECT count(*)::int
    INTO v_upcoming
    FROM public.finance_checks c
    WHERE c.organization_id = v_cfg.organization_id
      AND c.due_date IS NOT NULL
      AND c.due_date >= v_today
      AND c.due_date <= v_in7
      AND c.status NOT IN ('paid', 'cancelled');

    IF coalesce(v_overdue, 0) = 0 AND coalesce(v_upcoming, 0) = 0 THEN
      UPDATE public.finance_check_notify_settings
      SET last_sent_at = now(), updated_at = now()
      WHERE organization_id = v_cfg.organization_id;
      CONTINUE;
    END IF;

    SELECT count(*)::int
    INTO v_given_up
    FROM public.finance_checks c
    WHERE c.organization_id = v_cfg.organization_id
      AND c.direction = 'given'
      AND c.due_date IS NOT NULL
      AND c.due_date >= v_today
      AND c.due_date <= v_in7
      AND c.status NOT IN ('paid', 'cancelled');

    SELECT count(*)::int
    INTO v_recv_up
    FROM public.finance_checks c
    WHERE c.organization_id = v_cfg.organization_id
      AND c.direction = 'received'
      AND c.due_date IS NOT NULL
      AND c.due_date >= v_today
      AND c.due_date <= v_in7
      AND c.status NOT IN ('paid', 'cancelled');

    v_title := 'Çek vadesi hatırlatması';
    v_body := '';
    IF coalesce(v_overdue, 0) > 0 THEN
      v_body := v_overdue::text || ' gecikmiş çek';
    END IF;
    IF coalesce(v_upcoming, 0) > 0 THEN
      IF length(v_body) > 0 THEN
        v_body := v_body || ' · ';
      END IF;
      v_body := v_body || v_upcoming::text || ' yaklaşan vade (7 gün)';
    END IF;
    IF coalesce(v_given_up, 0) > 0 OR coalesce(v_recv_up, 0) > 0 THEN
      v_body := v_body || E'\n' || 'Verilen: ' || coalesce(v_given_up, 0)::text
        || ' · Alınan: ' || coalesce(v_recv_up, 0)::text;
    END IF;

    v_payload := jsonb_build_object(
      'kind', 'finance_check_due',
      'notificationType', 'finance_check_due',
      'notification_type', 'finance_check_due',
      'feature_key', 'finance_checks',
      'url', '/admin/finance-checks',
      'screen', '/admin/finance-checks',
      'organizationId', v_cfg.organization_id::text
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

    UPDATE public.finance_check_notify_settings
    SET last_sent_at = now(), updated_at = now()
    WHERE organization_id = v_cfg.organization_id;

    v_sent := v_sent + 1;
  END LOOP;

  RETURN v_sent;
END;
$$;

COMMENT ON FUNCTION public.send_finance_check_due_reminders() IS
  'Aktif çek bildirim ayarları için 2 saatte bir vadesi yaklaşan/gecikmiş çek özeti push gönderir.';

REVOKE ALL ON FUNCTION public.send_finance_check_due_reminders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_finance_check_due_reminders() TO postgres;

DO $$
BEGIN
  PERFORM cron.unschedule('finance_check_due_remind_tr')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'finance_check_due_remind_tr');
  PERFORM cron.schedule(
    'finance_check_due_remind_tr',
    '*/15 * * * *',
    'SELECT public.send_finance_check_due_reminders();'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron finance_check_due schedule skipped: %', SQLERRM;
END;
$$;

COMMIT;
