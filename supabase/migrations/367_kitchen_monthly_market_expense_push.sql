-- Aylık mutfak "Market" harcama özeti: personel push (ay başı 00:00 Europe/Istanbul)

BEGIN;

CREATE TABLE IF NOT EXISTS public.kitchen_monthly_market_notify_log (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  total_amount numeric(14, 2) NOT NULL DEFAULT 0,
  recipient_count int NOT NULL DEFAULT 0,
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  forced boolean NOT NULL DEFAULT false,
  PRIMARY KEY (organization_id, period_month)
);

COMMENT ON TABLE public.kitchen_monthly_market_notify_log IS
  'Aylık market harcama push gönderim kaydı (çift gönderimi önler).';

CREATE OR REPLACE FUNCTION public.turkish_month_year_label(p_month date)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    CASE extract(month FROM p_month)::int
      WHEN 1 THEN 'Ocak' WHEN 2 THEN 'Şubat' WHEN 3 THEN 'Mart' WHEN 4 THEN 'Nisan'
      WHEN 5 THEN 'Mayıs' WHEN 6 THEN 'Haziran' WHEN 7 THEN 'Temmuz' WHEN 8 THEN 'Ağustos'
      WHEN 9 THEN 'Eylül' WHEN 10 THEN 'Ekim' WHEN 11 THEN 'Kasım' WHEN 12 THEN 'Aralık'
    END
  ) || ' ' || extract(year FROM p_month)::text;
$$;

CREATE OR REPLACE FUNCTION public.staff_ids_org_all_active(p_org_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(s.id), ARRAY[]::uuid[])
  FROM public.staff s
  WHERE s.organization_id = p_org_id
    AND s.is_active = true
    AND s.deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.kitchen_market_expense_month_total(
  p_org_id uuid,
  p_period_month date
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(sum(e.amount), 0)::numeric
  FROM public.kitchen_expenses e
  WHERE e.organization_id = p_org_id
    AND e.entry_date >= p_period_month
    AND e.entry_date < (p_period_month + interval '1 month')::date
    AND lower(trim(coalesce(e.category, ''))) = 'market';
$$;

CREATE OR REPLACE FUNCTION public.send_kitchen_monthly_market_expense_summaries(
  p_period_month date DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_force boolean DEFAULT false,
  p_sent_by_staff_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period date;
  v_org record;
  v_total numeric;
  v_staff_ids uuid[];
  v_filtered uuid[];
  v_month_label text;
  v_amount_text text;
  v_title text;
  v_body text;
  v_payload jsonb;
  v_notification_type text := 'kitchen_monthly_market_expense';
  v_sent_orgs integer := 0;
BEGIN
  v_period := coalesce(
    date_trunc('month', p_period_month)::date,
    date_trunc('month', (timezone('Europe/Istanbul', now()) - interval '1 month'))::date
  );

  FOR v_org IN
    SELECT o.id
    FROM public.organizations o
    WHERE (p_organization_id IS NULL OR o.id = p_organization_id)
  LOOP
    IF NOT p_force AND EXISTS (
      SELECT 1 FROM public.kitchen_monthly_market_notify_log l
      WHERE l.organization_id = v_org.id AND l.period_month = v_period
    ) THEN
      CONTINUE;
    END IF;

    v_total := public.kitchen_market_expense_month_total(v_org.id, v_period);
    v_month_label := public.turkish_month_year_label(v_period);
    v_amount_text := trim(to_char(coalesce(v_total, 0), 'FM999G999G990D00')) || ' ₺';
    v_title := v_month_label || ' market harcaması';
    v_body := v_month_label || ' ayında market harcaması ' || v_amount_text || ' olarak gerçekleşti.';

    v_staff_ids := public.staff_ids_org_all_active(v_org.id);
    IF v_staff_ids IS NULL OR array_length(v_staff_ids, 1) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT array_agg(f.staff_id)
    INTO v_filtered
    FROM public.filter_staff_notification_recipients(v_staff_ids, v_notification_type) f;

    IF v_filtered IS NULL OR array_length(v_filtered, 1) IS NULL THEN
      INSERT INTO public.kitchen_monthly_market_notify_log (
        organization_id, period_month, total_amount, recipient_count, sent_by_staff_id, forced
      )
      VALUES (v_org.id, v_period, v_total, 0, p_sent_by_staff_id, p_force)
      ON CONFLICT (organization_id, period_month) DO UPDATE SET
        total_amount = EXCLUDED.total_amount,
        recipient_count = EXCLUDED.recipient_count,
        sent_at = now(),
        sent_by_staff_id = EXCLUDED.sent_by_staff_id,
        forced = EXCLUDED.forced;
      CONTINUE;
    END IF;

    v_payload := jsonb_build_object(
      'notificationType', v_notification_type,
      'notification_type', v_notification_type,
      'feature_key', 'kitchen_finance',
      'url', '/staff/kitchen-ops/expenses',
      'screen', '/staff/kitchen-ops/expenses',
      'periodMonth', v_period::text,
      'totalAmount', v_total
    );

    INSERT INTO public.notifications (
      staff_id, guest_id, title, body, category, notification_type, data, created_by, sent_via, sent_at
    )
    SELECT sid, NULL, v_title, v_body, 'staff', v_notification_type, v_payload, p_sent_by_staff_id, 'both', now()
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

    INSERT INTO public.kitchen_monthly_market_notify_log (
      organization_id, period_month, total_amount, recipient_count, sent_by_staff_id, forced
    )
    VALUES (v_org.id, v_period, v_total, array_length(v_filtered, 1), p_sent_by_staff_id, p_force)
    ON CONFLICT (organization_id, period_month) DO UPDATE SET
      total_amount = EXCLUDED.total_amount,
      recipient_count = EXCLUDED.recipient_count,
      sent_at = now(),
      sent_by_staff_id = EXCLUDED.sent_by_staff_id,
      forced = EXCLUDED.forced;

    v_sent_orgs := v_sent_orgs + 1;
  END LOOP;

  RETURN v_sent_orgs;
END;
$$;

REVOKE ALL ON FUNCTION public.send_kitchen_monthly_market_expense_summaries(date, uuid, boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_kitchen_monthly_market_expense_summaries(date, uuid, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_kitchen_monthly_market_expense_summaries(date, uuid, boolean, uuid) TO postgres;

COMMENT ON FUNCTION public.send_kitchen_monthly_market_expense_summaries(date, uuid, boolean, uuid) IS
  'İşletme bazında aylık Market kategorisi mutfak gider özeti push. p_period_month NULL ise bir önceki ay (İstanbul). Ay başı cron ile otomatik.';

DO $$
BEGIN
  PERFORM cron.unschedule('kitchen_monthly_market_tr')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kitchen_monthly_market_tr');
  PERFORM cron.schedule(
    'kitchen_monthly_market_tr',
    '0 21 1 * *',
    'SELECT public.send_kitchen_monthly_market_expense_summaries(NULL, NULL, false, NULL);'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron kitchen_monthly_market schedule skipped: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.send_kitchen_monthly_market_expense_summaries IS
  'Her ayın 1''i 00:00 (Europe/Istanbul, cron UTC 21:00) bir önceki ayın market harcama özeti.';

COMMIT;
