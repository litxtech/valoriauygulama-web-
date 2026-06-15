-- Misafir planlı bildirimler: hedef çözümleme, tercih filtresi, smart_ops_dispatch_scheduled misafir dalı.

BEGIN;

CREATE OR REPLACE FUNCTION public.resolve_guest_bulk_pref_key(p_category text, p_notification_type text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  t text := lower(coalesce(trim(p_notification_type), ''));
  c text := lower(coalesce(trim(p_category), 'info'));
BEGIN
  IF t LIKE 'bulk_campaign%' OR c = 'campaign' THEN
    RETURN 'campaigns';
  END IF;
  IF t LIKE 'bulk_%' OR c IN ('info', 'warning', 'reminder', 'event') THEN
    RETURN 'hotel_announcements';
  END IF;
  RETURN 'hotel_announcements';
END;
$$;

CREATE OR REPLACE FUNCTION public.filter_guest_notification_recipients(
  p_guest_ids uuid[],
  p_pref_key text
)
RETURNS TABLE(guest_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_guest_ids IS NULL OR array_length(p_guest_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT g.id
  FROM public.guests g
  LEFT JOIN public.notification_preferences np
    ON np.guest_id = g.id
   AND np.pref_key = p_pref_key
  WHERE g.id = ANY (p_guest_ids)
    AND g.status IN ('pending', 'checked_in')
    AND coalesce(np.enabled, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_scheduled_guest_ids(
  p_organization_id uuid,
  p_metadata jsonb
)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target text := lower(coalesce(p_metadata->>'guest_bulk_target', 'all_guests'));
  v_today date := (timezone('Europe/Istanbul', now()))::date;
  v_tomorrow date := v_today + 1;
  v_room_numbers text[];
  v_ids uuid[];
BEGIN
  IF p_organization_id IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  SELECT coalesce(array_agg(elem ORDER BY elem), ARRAY[]::text[])
  INTO v_room_numbers
  FROM jsonb_array_elements_text(coalesce(p_metadata->'room_numbers', '[]'::jsonb)) AS elem;

  IF v_target = 'checkin_today' THEN
    SELECT array_agg(g.id ORDER BY g.full_name)
    INTO v_ids
    FROM public.guests g
    WHERE g.organization_id = p_organization_id
      AND g.status IN ('pending', 'checked_in')
      AND g.check_in_at IS NOT NULL
      AND (timezone('Europe/Istanbul', g.check_in_at))::date = v_today;
  ELSIF v_target = 'checkout_tomorrow' THEN
    SELECT array_agg(g.id ORDER BY g.full_name)
    INTO v_ids
    FROM public.guests g
    WHERE g.organization_id = p_organization_id
      AND g.status IN ('pending', 'checked_in')
      AND g.check_out_at IS NOT NULL
      AND (timezone('Europe/Istanbul', g.check_out_at))::date = v_tomorrow;
  ELSIF v_target = 'specific_rooms' AND v_room_numbers IS NOT NULL AND array_length(v_room_numbers, 1) > 0 THEN
    SELECT array_agg(g.id ORDER BY g.full_name)
    INTO v_ids
    FROM public.guests g
    WHERE g.organization_id = p_organization_id
      AND g.status IN ('pending', 'checked_in')
      AND g.room_id IN (
        SELECT r.id
        FROM public.rooms r
        WHERE r.organization_id = p_organization_id
          AND r.room_number = ANY (v_room_numbers)
      );
  ELSIF v_target = 'long_stay' THEN
    SELECT array_agg(sub.id ORDER BY sub.full_name)
    INTO v_ids
    FROM (
      SELECT g.id, g.full_name
      FROM public.guests g
      WHERE g.organization_id = p_organization_id
        AND g.status IN ('pending', 'checked_in')
        AND g.check_in_at IS NOT NULL
        AND g.check_out_at IS NOT NULL
        AND (
          (timezone('Europe/Istanbul', g.check_out_at))::date
          - (timezone('Europe/Istanbul', g.check_in_at))::date
        ) >= 3
    ) sub;
  ELSE
    SELECT array_agg(g.id ORDER BY g.full_name)
    INTO v_ids
    FROM public.guests g
    WHERE g.organization_id = p_organization_id
      AND g.status IN ('pending', 'checked_in');
  END IF;

  RETURN coalesce(v_ids, ARRAY[]::uuid[]);
END;
$$;

CREATE OR REPLACE FUNCTION public.smart_ops_dispatch_scheduled()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tpl record;
  v_staff_id uuid;
  v_guest_id uuid;
  v_now timestamptz := now();
  v_local timestamp;
  v_dow int;
  v_title text;
  v_body text;
  v_checklist jsonb;
  v_scheduled timestamptz;
  v_due timestamptz;
  v_task_id uuid;
  v_payload jsonb;
  v_staff_ids uuid[];
  v_filtered uuid[];
  v_guest_ids uuid[];
  v_guest_filtered uuid[];
  v_count int := 0;
  v_supabase_url text := 'https://sbydlcujsiqmifybqzsi.supabase.co';
  v_notification_only boolean;
  v_excluded text[];
  v_audience text;
  v_notif_type text;
  v_pref_key text;
  v_bulk_category text;
BEGIN
  FOR v_tpl IN
    SELECT *
    FROM public.notification_templates t
    WHERE t.organization_id IS NOT NULL
      AND coalesce(t.template_kind, 'smart_ops') = 'smart_ops'
      AND t.active = true
      AND t.send_time IS NOT NULL
  LOOP
    v_local := timezone(coalesce(v_tpl.timezone, 'Europe/Istanbul'), v_now);
    v_dow := extract(dow FROM v_local)::int;

    IF v_tpl.repeat_type = 'weekdays' AND v_dow NOT IN (1, 2, 3, 4, 5) THEN
      CONTINUE;
    END IF;
    IF v_tpl.repeat_type = 'weekend' AND v_dow NOT IN (0, 6) THEN
      CONTINUE;
    END IF;
    IF v_tpl.repeat_type = 'custom_days' AND NOT (v_dow = ANY (coalesce(v_tpl.active_days, ARRAY[]::smallint[]))) THEN
      CONTINUE;
    END IF;

    IF to_char(v_local, 'HH24:MI') <> to_char(v_tpl.send_time, 'HH24:MI') THEN
      CONTINUE;
    END IF;

    IF v_tpl.last_sent_at IS NOT NULL
      AND timezone(coalesce(v_tpl.timezone, 'Europe/Istanbul'), v_tpl.last_sent_at)::date = v_local::date
      AND to_char(timezone(coalesce(v_tpl.timezone, 'Europe/Istanbul'), v_tpl.last_sent_at), 'HH24:MI')
        = to_char(v_tpl.send_time, 'HH24:MI') THEN
      CONTINUE;
    END IF;

    v_title := coalesce(nullif(trim(v_tpl.title), ''), nullif(trim(v_tpl.title_template), ''), 'Bildirim');
    v_body := coalesce(nullif(trim(v_tpl.body), ''), nullif(trim(v_tpl.body_template), ''), '');
    v_checklist := coalesce(v_tpl.checklist, '[]'::jsonb);
    v_scheduled := date_trunc('minute', v_local) AT TIME ZONE coalesce(v_tpl.timezone, 'Europe/Istanbul');
    v_due := v_scheduled + interval '30 minutes';
    v_notification_only := coalesce((v_tpl.metadata->>'notification_only')::boolean, false);
    v_audience := lower(coalesce(v_tpl.target_audience, 'staff'));

    -- Misafir planlı bildirim (yalnızca notification_only; görev oluşturulmaz)
    IF v_audience = 'guest' AND v_notification_only THEN
      v_bulk_category := lower(coalesce(v_tpl.category, 'info'));
      IF v_bulk_category NOT IN ('info', 'warning', 'campaign') THEN
        v_bulk_category := 'info';
      END IF;
      v_notif_type := 'bulk_' || v_bulk_category;
      v_pref_key := public.resolve_guest_bulk_pref_key(v_bulk_category, v_notif_type);

      v_guest_ids := public.resolve_scheduled_guest_ids(v_tpl.organization_id, coalesce(v_tpl.metadata, '{}'::jsonb));
      IF v_guest_ids IS NULL OR array_length(v_guest_ids, 1) IS NULL THEN
        CONTINUE;
      END IF;

      SELECT array_agg(f.guest_id)
      INTO v_guest_filtered
      FROM public.filter_guest_notification_recipients(v_guest_ids, v_pref_key) f;

      IF v_guest_filtered IS NULL OR array_length(v_guest_filtered, 1) IS NULL THEN
        CONTINUE;
      END IF;

      FOREACH v_guest_id IN ARRAY v_guest_filtered
      LOOP
        v_payload := jsonb_build_object(
          'url', '/customer/(tabs)/notifications',
          'screen', 'notifications',
          'notificationId', v_tpl.id,
          'notificationType', 'scheduled_guest_notification'
        );
        INSERT INTO public.notifications (
          guest_id, title, body, category, notification_type, data, sent_via, sent_at
        ) VALUES (
          v_guest_id,
          v_title,
          v_body,
          'bulk',
          v_notif_type,
          v_payload,
          'both',
          v_now
        );
        v_count := v_count + 1;
      END LOOP;

      UPDATE public.notification_templates
      SET last_sent_at = v_now, updated_at = v_now
      WHERE id = v_tpl.id;

      BEGIN
        PERFORM net.http_post(
          url := v_supabase_url || '/functions/v1/send-expo-push',
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body := jsonb_build_object(
            'guestIds', to_jsonb(v_guest_filtered),
            'title', v_title,
            'body', v_body,
            'data', jsonb_build_object(
              'url', '/customer/(tabs)/notifications',
              'screen', 'notifications',
              'notificationType', 'scheduled_guest_notification'
            )
          ),
          timeout_milliseconds := 15000
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'guest scheduled push skipped: %', SQLERRM;
      END;

      CONTINUE;
    END IF;

    -- Personel planlı bildirim (mevcut davranış)
    SELECT coalesce(array_agg(elem), ARRAY[]::text[])
    INTO v_excluded
    FROM jsonb_array_elements_text(coalesce(v_tpl.metadata->'excluded_staff_ids', '[]'::jsonb)) AS elem;

    SELECT array_agg(s.id ORDER BY s.full_name)
    INTO v_staff_ids
    FROM public.staff s
    WHERE s.organization_id = v_tpl.organization_id
      AND s.is_active = true
      AND s.deleted_at IS NULL
      AND public.staff_matches_smart_ops_role(s.id, v_tpl.target_role)
      AND NOT (s.id::text = ANY (v_excluded));

    IF v_staff_ids IS NULL OR array_length(v_staff_ids, 1) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT array_agg(f.staff_id)
    INTO v_filtered
    FROM public.filter_staff_notification_recipients(v_staff_ids, 'smart_ops_task') f;

    IF v_filtered IS NULL OR array_length(v_filtered, 1) IS NULL THEN
      CONTINUE;
    END IF;

    FOREACH v_staff_id IN ARRAY v_filtered
    LOOP
      IF v_notification_only THEN
        v_payload := jsonb_build_object(
          'url', '/staff/(tabs)/notifications',
          'notificationId', v_tpl.id,
          'notificationType', 'scheduled_template_notification'
        );
        INSERT INTO public.notifications (
          staff_id, title, body, category, notification_type, data, sent_via, sent_at
        ) VALUES (
          v_staff_id,
          v_title,
          v_body,
          'staff',
          'scheduled_template_notification',
          v_payload,
          'both',
          v_now
        );
        v_count := v_count + 1;
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.task_instances ti
        WHERE ti.notification_id = v_tpl.id
          AND ti.assigned_staff_id = v_staff_id
          AND timezone('Europe/Istanbul', ti.scheduled_for)::date = v_local::date
          AND ti.status NOT IN ('cancelled')
      ) THEN
        CONTINUE;
      END IF;

      INSERT INTO public.task_instances (
        organization_id,
        notification_id,
        assigned_staff_id,
        assigned_role,
        title,
        body,
        checklist,
        critical_level,
        require_photo,
        sound_type,
        status,
        scheduled_for,
        due_at,
        first_sent_at,
        last_sent_at
      ) VALUES (
        v_tpl.organization_id,
        v_tpl.id,
        v_staff_id,
        v_tpl.target_role,
        v_title,
        v_body,
        v_checklist,
        v_tpl.critical_level,
        v_tpl.require_photo,
        v_tpl.sound_type,
        'pending',
        v_scheduled,
        v_due,
        v_now,
        v_now
      )
      RETURNING id INTO v_task_id;

      INSERT INTO public.task_checklist_items (
        organization_id,
        task_instance_id,
        item_order,
        label,
        is_required
      )
      SELECT
        v_tpl.organization_id,
        v_task_id,
        (ord - 1)::int,
        coalesce(elem->>'label', 'Madde ' || ord::text),
        coalesce((elem->>'required')::boolean, true)
      FROM jsonb_array_elements(v_checklist) WITH ORDINALITY AS t(elem, ord)
      WHERE jsonb_typeof(v_checklist) = 'array' AND jsonb_array_length(v_checklist) > 0;

      v_payload := jsonb_build_object(
        'url', '/staff/smart-ops/' || v_task_id::text,
        'taskInstanceId', v_task_id,
        'notificationId', v_tpl.id,
        'criticalLevel', v_tpl.critical_level
      );

      INSERT INTO public.notifications (
        staff_id, title, body, category, notification_type, data, sent_via, sent_at
      ) VALUES (
        v_staff_id,
        v_title,
        v_body,
        'staff',
        'smart_ops_task',
        v_payload,
        'both',
        v_now
      );

      INSERT INTO public.task_logs (
        organization_id, task_instance_id, notification_id, actor_staff_id, action, payload
      ) VALUES (
        v_tpl.organization_id, v_task_id, v_tpl.id, NULL, 'notification_sent', v_payload
      );

      v_count := v_count + 1;
    END LOOP;

    UPDATE public.notification_templates
    SET last_sent_at = v_now, updated_at = v_now
    WHERE id = v_tpl.id;

    BEGIN
      PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/send-expo-push',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'staffIds', to_jsonb(v_filtered),
          'title', v_title,
          'body', v_body,
          'data',
            CASE
              WHEN v_notification_only THEN jsonb_build_object(
                'url', '/staff/(tabs)/notifications',
                'notificationType', 'scheduled_template_notification'
              )
              ELSE jsonb_build_object(
                'notificationId', v_tpl.id,
                'criticalLevel', v_tpl.critical_level
              )
            END
        ),
        timeout_milliseconds := 15000
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'smart_ops push skipped: %', SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.filter_guest_notification_recipients(uuid[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_scheduled_guest_ids(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.filter_guest_notification_recipients(uuid[], text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_scheduled_guest_ids(uuid, jsonb) TO authenticated, service_role;

COMMIT;
