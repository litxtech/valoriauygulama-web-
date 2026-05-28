BEGIN;

CREATE OR REPLACE FUNCTION public.staff_matches_smart_ops_role(p_staff_id uuid, p_role text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v record;
  r text;
BEGIN
  SELECT s.role, lower(trim(coalesce(s.department, ''))) AS dept
  INTO v
  FROM public.staff s
  WHERE s.id = p_staff_id
    AND s.is_active = true
    AND s.deleted_at IS NULL
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  r := lower(trim(coalesce(p_role, '')));
  IF r IN ('all_staff', 'all', 'tum_personel') THEN
    RETURN true;
  END IF;
  IF r IN ('manager', 'yonetici') THEN
    RETURN v.role = 'admin' OR v.role = 'reception_chief';
  END IF;
  IF r IN ('reception', 'resepsiyon') THEN
    RETURN v.role IN ('receptionist', 'reception_chief') OR v.dept IN ('reception', 'resepsiyon');
  END IF;
  IF r IN ('housekeeping', 'temizlik') THEN
    RETURN v.role = 'housekeeping' OR v.dept IN ('housekeeping', 'temizlik');
  END IF;
  IF r IN ('kitchen', 'mutfak') THEN
    RETURN v.dept IN ('kitchen', 'restaurant', 'mutfak');
  END IF;
  IF r IN ('technical', 'teknik') THEN
    RETURN v.role = 'technical' OR v.dept IN ('technical', 'teknik');
  END IF;
  IF r IN ('night_supervisor', 'gece', 'night') THEN
    RETURN v.role = 'security' OR v.dept IN ('night', 'gece', 'security');
  END IF;
  IF r IN ('operations', 'operasyon') THEN
    RETURN v.role IN ('admin', 'reception_chief', 'receptionist');
  END IF;
  RETURN v.dept = r OR v.role = r;
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
  v_count int := 0;
  v_supabase_url text := 'https://sbydlcujsiqmifybqzsi.supabase.co';
  v_notification_only boolean;
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

    v_title := coalesce(nullif(trim(v_tpl.title), ''), nullif(trim(v_tpl.title_template), ''), 'Operasyon görevi');
    v_body := coalesce(nullif(trim(v_tpl.body), ''), nullif(trim(v_tpl.body_template), ''), '');
    v_checklist := coalesce(v_tpl.checklist, '[]'::jsonb);
    v_scheduled := date_trunc('minute', v_local) AT TIME ZONE coalesce(v_tpl.timezone, 'Europe/Istanbul');
    v_due := v_scheduled + interval '30 minutes';
    v_notification_only := coalesce((v_tpl.metadata->>'notification_only')::boolean, false);

    SELECT array_agg(s.id ORDER BY s.full_name)
    INTO v_staff_ids
    FROM public.staff s
    WHERE s.organization_id = v_tpl.organization_id
      AND s.is_active = true
      AND s.deleted_at IS NULL
      AND public.staff_matches_smart_ops_role(s.id, v_tpl.target_role);

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

COMMIT;
