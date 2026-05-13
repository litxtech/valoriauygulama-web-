-- Aylık personel yemek listesi (gün bazlı kahvaltı/öğle/akşam), günlük bildirim (cron)

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.staff_meal_menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  title text,
  notify_daily boolean NOT NULL DEFAULT true,
  last_daily_notify_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_meal_menus_period_first_day CHECK (
    EXTRACT(DAY FROM period_month) = 1
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_meal_menus_org_month
  ON public.staff_meal_menus (organization_id, period_month);

CREATE TABLE IF NOT EXISTS public.staff_meal_menu_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id uuid NOT NULL REFERENCES public.staff_meal_menus(id) ON DELETE CASCADE,
  meal_date date NOT NULL,
  breakfast text,
  lunch text,
  dinner text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_meal_menu_days_unique_day UNIQUE (menu_id, meal_date)
);

CREATE INDEX IF NOT EXISTS idx_staff_meal_menu_days_menu_date
  ON public.staff_meal_menu_days (menu_id, meal_date);

CREATE OR REPLACE FUNCTION public.staff_meal_menus_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_meal_menus_updated ON public.staff_meal_menus;
CREATE TRIGGER trg_staff_meal_menus_updated
  BEFORE UPDATE ON public.staff_meal_menus
  FOR EACH ROW EXECUTE FUNCTION public.staff_meal_menus_set_updated_at();

DROP TRIGGER IF EXISTS trg_staff_meal_menu_days_updated ON public.staff_meal_menu_days;
CREATE TRIGGER trg_staff_meal_menu_days_updated
  BEFORE UPDATE ON public.staff_meal_menu_days
  FOR EACH ROW EXECUTE FUNCTION public.staff_meal_menus_set_updated_at();

ALTER TABLE public.staff_meal_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_meal_menu_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_meal_menus_select_org" ON public.staff_meal_menus;
CREATE POLICY "staff_meal_menus_select_org"
  ON public.staff_meal_menus FOR SELECT TO authenticated
  USING (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS "staff_meal_menus_admin_write" ON public.staff_meal_menus;
CREATE POLICY "staff_meal_menus_admin_write"
  ON public.staff_meal_menus FOR ALL TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.current_user_is_staff_admin()
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.current_user_is_staff_admin()
  );

DROP POLICY IF EXISTS "staff_meal_menu_days_select_org" ON public.staff_meal_menu_days;
CREATE POLICY "staff_meal_menu_days_select_org"
  ON public.staff_meal_menu_days FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_meal_menus m
      WHERE m.id = staff_meal_menu_days.menu_id
        AND m.organization_id = public.current_staff_organization_id()
    )
  );

DROP POLICY IF EXISTS "staff_meal_menu_days_admin_write" ON public.staff_meal_menu_days;
CREATE POLICY "staff_meal_menu_days_admin_write"
  ON public.staff_meal_menu_days FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_meal_menus m
      WHERE m.id = staff_meal_menu_days.menu_id
        AND m.organization_id = public.current_staff_organization_id()
        AND public.current_user_is_staff_admin()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_meal_menus m
      WHERE m.id = staff_meal_menu_days.menu_id
        AND m.organization_id = public.current_staff_organization_id()
        AND public.current_user_is_staff_admin()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_meal_menus TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_meal_menu_days TO authenticated;

COMMENT ON TABLE public.staff_meal_menus IS 'Aylık personel yemek menüsü (organizasyon + ay başı tarihi).';
COMMENT ON TABLE public.staff_meal_menu_days IS 'Günlük yemek satırları (kahvaltı/öğle/akşam metni).';

CREATE OR REPLACE FUNCTION public.send_staff_meal_menu_daily_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date;
  v_menu record;
  v_bf text;
  v_lu text;
  v_di text;
  v_staff_ids uuid[];
  v_filtered uuid[];
  v_title text := 'Bugünün yemekleri';
  v_body text;
  v_payload jsonb;
  v_sent integer := 0;
  v_parts text[];
BEGIN
  v_today := (timezone('Europe/Istanbul', now()))::date;

  FOR v_menu IN
    SELECT m.id, m.organization_id
    FROM public.staff_meal_menus m
    WHERE m.notify_daily = true
      AND m.period_month = date_trunc('month', v_today)::date
      AND (m.last_daily_notify_date IS DISTINCT FROM v_today)
  LOOP
    SELECT d.breakfast, d.lunch, d.dinner
    INTO v_bf, v_lu, v_di
    FROM public.staff_meal_menu_days d
    WHERE d.menu_id = v_menu.id
      AND d.meal_date = v_today;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_parts := ARRAY[]::text[];
    IF trim(coalesce(v_bf, '')) <> '' THEN
      v_parts := array_append(v_parts, 'Kahvaltı: ' || trim(v_bf));
    END IF;
    IF trim(coalesce(v_lu, '')) <> '' THEN
      v_parts := array_append(v_parts, 'Öğle: ' || trim(v_lu));
    END IF;
    IF trim(coalesce(v_di, '')) <> '' THEN
      v_parts := array_append(v_parts, 'Akşam: ' || trim(v_di));
    END IF;

    IF coalesce(array_length(v_parts, 1), 0) = 0 THEN
      CONTINUE;
    END IF;

    v_body := array_to_string(v_parts, E'\n');
    v_payload := jsonb_build_object(
      'notificationType', 'staff_meal_menu_daily',
      'screen', '/staff/meal-menu',
      'url', '/staff/meal-menu',
      'mealDate', v_today::text
    );

    SELECT array_agg(s.id)
    INTO v_staff_ids
    FROM public.staff s
    WHERE s.organization_id = v_menu.organization_id
      AND s.is_active = true
      AND s.deleted_at IS NULL;

    IF v_staff_ids IS NULL OR array_length(v_staff_ids, 1) IS NULL THEN
      UPDATE public.staff_meal_menus SET last_daily_notify_date = v_today, updated_at = now() WHERE id = v_menu.id;
      CONTINUE;
    END IF;

    SELECT array_agg(f.staff_id)
    INTO v_filtered
    FROM public.filter_staff_notification_recipients(v_staff_ids, 'staff_meal_menu_daily') f;

    IF v_filtered IS NULL OR array_length(v_filtered, 1) IS NULL THEN
      UPDATE public.staff_meal_menus SET last_daily_notify_date = v_today, updated_at = now() WHERE id = v_menu.id;
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (
      staff_id, guest_id, title, body, category, notification_type, data, created_by, sent_via, sent_at
    )
    SELECT sid, NULL, v_title, v_body, 'staff', 'staff_meal_menu_daily', v_payload, NULL, 'both', now()
    FROM unnest(v_filtered) AS sid;

    PERFORM net.http_post(
      url := 'https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/send-expo-push',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'staffIds', to_jsonb(v_filtered),
        'title', v_title,
        'body', v_body,
        'data', v_payload
      ),
      timeout_milliseconds := 15000
    );

    UPDATE public.staff_meal_menus
    SET last_daily_notify_date = v_today, updated_at = now()
    WHERE id = v_menu.id;

    v_sent := v_sent + 1;
  END LOOP;

  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.send_staff_meal_menu_daily_reminders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_staff_meal_menu_daily_reminders() TO postgres;

DO $$
BEGIN
  PERFORM cron.unschedule('staff_meal_menu_daily_tr')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'staff_meal_menu_daily_tr'
  );
  PERFORM cron.schedule(
    'staff_meal_menu_daily_tr',
    '0 5 * * *',
    'SELECT public.send_staff_meal_menu_daily_reminders();'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron staff meal menu schedule skipped: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.send_staff_meal_menu_daily_reminders() IS
  'Her gün 08:00 civarı (Europe/Istanbul) için günlük yemek bildirimi; pg_cron UTC 05:00.';

COMMIT;
