-- Günlük yemek listesi push: yalnızca mutfak yetkili personel; deep link /staff/meal-menu

BEGIN;

CREATE OR REPLACE FUNCTION public.staff_eligible_for_meal_menu_daily_push(p_staff_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.id = p_staff_id
      AND s.is_active = true
      AND s.deleted_at IS NULL
      AND (
        coalesce((s.app_permissions->>'yemek_listesi_mutfak_onay')::boolean, false)
        OR lower(trim(coalesce(s.department, ''))) IN ('kitchen_staff', 'mutfak', 'kitchen')
      )
  );
$$;

COMMENT ON FUNCTION public.staff_eligible_for_meal_menu_daily_push(uuid) IS
  'Günlük yemek listesi push alıcısı: mutfak onay yetkisi veya mutfak departmanı.';

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
  v_title text := 'Bugün yapılacak yemekler';
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
      AND public.staff_eligible_for_meal_menu_daily_push(s.id);

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

COMMENT ON FUNCTION public.send_staff_meal_menu_daily_reminders() IS
  'Mutfak yetkili personele günlük yemek listesi push (Europe/Istanbul); tıklanınca /staff/meal-menu.';

COMMIT;
