-- Akıllı operasyon: çalışma zamanı (zamanlayıcı, eskalasyon, teyit RPC, varsayılan şablonlar)

BEGIN;

ALTER TABLE public.notification_templates
  DROP CONSTRAINT IF EXISTS notification_templates_code_key;

ALTER TABLE public.notification_templates
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS template_kind text DEFAULT 'bulk';

UPDATE public.notification_templates
SET template_kind = 'bulk'
WHERE organization_id IS NULL AND (template_kind IS NULL OR template_kind = 'bulk');

UPDATE public.notification_templates
SET template_kind = 'smart_ops'
WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notification_templates_org_code_uidx
  ON public.notification_templates (organization_id, code)
  WHERE organization_id IS NOT NULL AND code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS task_instances_daily_dedupe_uidx
  ON public.task_instances (
    notification_id,
    assigned_staff_id,
    (timezone('Europe/Istanbul', scheduled_for)::date)
  )
  WHERE assigned_staff_id IS NOT NULL AND status NOT IN ('cancelled');

-- Personel: atanmış görev veya role uyumu
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

REVOKE ALL ON FUNCTION public.staff_matches_smart_ops_role(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_matches_smart_ops_role(uuid, text) TO authenticated;

DROP POLICY IF EXISTS "task_instances_update_org_actor" ON public.task_instances;
CREATE POLICY "task_instances_update_org_actor"
  ON public.task_instances FOR UPDATE TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR (
      organization_id = public.current_staff_organization_id()
      AND (
        assigned_staff_id = public.current_staff_id()
        OR (
          assigned_staff_id IS NULL
          AND public.staff_matches_smart_ops_role(public.current_staff_id(), assigned_role)
        )
      )
    )
  )
  WITH CHECK (
    public.current_user_is_staff_admin()
    OR organization_id = public.current_staff_organization_id()
  );

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
          'data', v_payload
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

CREATE OR REPLACE FUNCTION public.smart_ops_process_escalations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task record;
  v_now timestamptz := now();
  v_count int := 0;
  v_admin_ids uuid[];
  v_title text;
  v_body text;
  v_payload jsonb;
  v_supabase_url text := 'https://sbydlcujsiqmifybqzsi.supabase.co';
BEGIN
  FOR v_task IN
    SELECT ti.*, nt.title AS tpl_title, nt.escalation_enabled, nt.escalate_after_5m, nt.escalate_after_10m, nt.escalate_after_15m
    FROM public.task_instances ti
    JOIN public.notification_templates nt ON nt.id = ti.notification_id
    WHERE ti.status IN ('pending', 'acknowledged', 'overdue_l1', 'overdue_l2')
      AND ti.due_at IS NOT NULL
      AND ti.completed_at IS NULL
      AND coalesce(nt.escalation_enabled, true) = true
  LOOP
    IF v_task.escalate_after_5m
      AND v_task.due_at + interval '5 minutes' <= v_now
      AND v_task.escalated_l1_at IS NULL THEN
      UPDATE public.task_instances
      SET status = 'overdue_l1', escalated_l1_at = v_now, updated_at = v_now
      WHERE id = v_task.id;

      IF v_task.assigned_staff_id IS NOT NULL THEN
        v_title := 'Görev hatırlatma: ' || v_task.title;
        v_body := 'Göreviniz gecikiyor. Lütfen teyit edin.';
        v_payload := jsonb_build_object('url', '/staff/smart-ops/' || v_task.id, 'taskInstanceId', v_task.id);
        INSERT INTO public.notifications (staff_id, title, body, category, notification_type, data, sent_via, sent_at)
        VALUES (v_task.assigned_staff_id, v_title, v_body, 'staff', 'smart_ops_overdue_l1', v_payload, 'both', v_now);
        INSERT INTO public.task_logs (organization_id, task_instance_id, notification_id, action, payload)
        VALUES (v_task.organization_id, v_task.id, v_task.notification_id, 'task_overdue_l1', v_payload);
        PERFORM net.http_post(
          url := v_supabase_url || '/functions/v1/send-expo-push',
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body := jsonb_build_object('staffIds', jsonb_build_array(v_task.assigned_staff_id), 'title', v_title, 'body', v_body, 'data', v_payload),
          timeout_milliseconds := 15000
        );
      END IF;
      v_count := v_count + 1;
    END IF;

    IF v_task.escalate_after_10m
      AND v_task.due_at + interval '10 minutes' <= v_now
      AND v_task.escalated_l2_at IS NULL THEN
      UPDATE public.task_instances
      SET status = 'overdue_l2', escalated_l2_at = v_now, updated_at = v_now
      WHERE id = v_task.id;

      SELECT array_agg(s.id)
      INTO v_admin_ids
      FROM public.staff s
      WHERE s.organization_id = v_task.organization_id
        AND s.is_active = true
        AND s.deleted_at IS NULL
        AND (s.role = 'admin' OR s.role = 'reception_chief');

      IF v_admin_ids IS NOT NULL THEN
        v_title := 'Geciken operasyon görevi';
        v_body := v_task.title;
        v_payload := jsonb_build_object('url', '/admin/smart-ops/live', 'taskInstanceId', v_task.id);
        INSERT INTO public.notifications (staff_id, title, body, category, notification_type, data, sent_via, sent_at)
        SELECT sid, v_title, v_body, 'admin', 'smart_ops_overdue_l2', v_payload, 'both', v_now
        FROM unnest(v_admin_ids) AS sid;
        INSERT INTO public.operation_alerts (organization_id, type, level, message, related_task_instance_id, related_notification_id)
        VALUES (v_task.organization_id, 'task_overdue_l2', 'high', v_body, v_task.id, v_task.notification_id);
        INSERT INTO public.task_logs (organization_id, task_instance_id, notification_id, action, payload)
        VALUES (v_task.organization_id, v_task.id, v_task.notification_id, 'task_overdue_l2', v_payload);
        PERFORM net.http_post(
          url := v_supabase_url || '/functions/v1/send-expo-push',
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body := jsonb_build_object('staffIds', to_jsonb(v_admin_ids), 'title', v_title, 'body', v_body, 'data', v_payload),
          timeout_milliseconds := 15000
        );
      END IF;
      v_count := v_count + 1;
    END IF;

    IF v_task.escalate_after_15m
      AND v_task.due_at + interval '15 minutes' <= v_now
      AND v_task.escalated_l3_at IS NULL THEN
      UPDATE public.task_instances
      SET status = 'overdue_l3', escalated_l3_at = v_now, updated_at = v_now
      WHERE id = v_task.id;

      INSERT INTO public.operation_alerts (organization_id, type, level, message, related_task_instance_id, related_notification_id, metadata)
      VALUES (
        v_task.organization_id,
        'task_overdue_l3',
        'critical',
        'Kritik gecikme: ' || v_task.title,
        v_task.id,
        v_task.notification_id,
        jsonb_build_object('due_at', v_task.due_at)
      );
      INSERT INTO public.task_logs (organization_id, task_instance_id, notification_id, action)
      VALUES (v_task.organization_id, v_task.id, v_task.notification_id, 'task_overdue_l3');
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.smart_ops_run_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dispatched int;
  v_escalated int;
BEGIN
  v_dispatched := public.smart_ops_dispatch_scheduled();
  v_escalated := public.smart_ops_process_escalations();
  RETURN jsonb_build_object('dispatched', v_dispatched, 'escalated', v_escalated);
END;
$$;

REVOKE ALL ON FUNCTION public.smart_ops_dispatch_scheduled() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.smart_ops_process_escalations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.smart_ops_run_tick() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.smart_ops_run_tick() TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_smart_ops_task(
  p_task_id uuid,
  p_completion_type text,
  p_note text DEFAULT NULL,
  p_photo_url text DEFAULT NULL,
  p_checklist_updates jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task public.task_instances%ROWTYPE;
  v_staff_id uuid := public.current_staff_id();
  v_status text;
  v_action text;
  v_points int := 0;
BEGIN
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Personel oturumu gerekli';
  END IF;

  SELECT * INTO v_task FROM public.task_instances WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Görev bulunamadı';
  END IF;

  IF NOT (
    public.current_user_is_staff_admin()
    OR v_task.assigned_staff_id = v_staff_id
    OR (
      v_task.assigned_staff_id IS NULL
      AND public.staff_matches_smart_ops_role(v_staff_id, v_task.assigned_role)
    )
  ) THEN
    RAISE EXCEPTION 'Bu görevi tamamlama yetkiniz yok';
  END IF;

  IF p_completion_type NOT IN ('completed', 'partial', 'issue_reported') THEN
    RAISE EXCEPTION 'Geçersiz tamamlama tipi';
  END IF;

  IF v_task.require_photo = 'required' AND p_completion_type = 'completed' AND coalesce(trim(p_photo_url), '') = '' THEN
    RAISE EXCEPTION 'Fotoğraf zorunlu';
  END IF;

  v_status := CASE p_completion_type
    WHEN 'completed' THEN 'completed'
    WHEN 'partial' THEN 'partial'
    ELSE 'issue_reported'
  END;

  v_action := CASE p_completion_type
    WHEN 'completed' THEN 'task_completed'
    WHEN 'partial' THEN 'task_partial'
    ELSE 'task_issue_reported'
  END;

  UPDATE public.task_instances
  SET
    status = v_status,
    completion_type = p_completion_type,
    completed_at = now(),
    note = nullif(trim(p_note), ''),
    photo_url = nullif(trim(p_photo_url), ''),
    issue_text = CASE WHEN p_completion_type = 'issue_reported' THEN nullif(trim(p_note), '') ELSE issue_text END,
    closed_by_staff_id = v_staff_id,
    assigned_staff_id = coalesce(assigned_staff_id, v_staff_id),
    updated_at = now()
  WHERE id = p_task_id;

  IF jsonb_typeof(p_checklist_updates) = 'array' THEN
    UPDATE public.task_checklist_items ci
    SET
      checked = coalesce((u.elem->>'checked')::boolean, ci.checked),
      checked_at = CASE WHEN coalesce((u.elem->>'checked')::boolean, false) THEN now() ELSE NULL END,
      checked_by_staff_id = CASE WHEN coalesce((u.elem->>'checked')::boolean, false) THEN v_staff_id ELSE NULL END,
      note = coalesce(u.elem->>'note', ci.note),
      updated_at = now()
    FROM jsonb_array_elements(p_checklist_updates) AS u(elem)
    WHERE ci.id = (u.elem->>'id')::uuid
      AND ci.task_instance_id = p_task_id;
  END IF;

  INSERT INTO public.task_logs (
    organization_id, task_instance_id, notification_id, actor_staff_id, action, note, photo_url
  ) VALUES (
    v_task.organization_id, p_task_id, v_task.notification_id, v_staff_id, v_action, p_note, p_photo_url
  );

  v_points := CASE p_completion_type
    WHEN 'completed' THEN 10
    WHEN 'partial' THEN -6
    ELSE -4
  END;

  IF v_task.require_photo = 'required' AND p_completion_type = 'completed' AND coalesce(trim(p_photo_url), '') = '' THEN
    v_points := v_points - 8;
  END IF;

  INSERT INTO public.staff_points (
    organization_id, staff_id, points, category, reason, reference_type, reference_id, created_by_staff_id
  ) VALUES (
    v_task.organization_id,
    v_staff_id,
    v_points,
    'task',
    'Operasyon görevi: ' || v_task.title,
    'smart_ops_task',
    p_task_id,
    v_staff_id
  );

  RETURN jsonb_build_object('ok', true, 'status', v_status, 'points', v_points);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_smart_ops_task(uuid, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_smart_ops_task(uuid, text, text, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.seed_smart_ops_templates(p_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
BEGIN
  IF p_org_id IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.notification_templates (
    organization_id, code, template_kind, title, body, target_role, active, send_time,
    repeat_type, critical_level, require_photo, sound_type, checklist, metadata
  ) VALUES
  (
    p_org_id, 'ops_kitchen_close_2300', 'smart_ops',
    'Mutfak Gece Kontrolü',
    'Gece kapanış kontrol listesini tamamlayın.',
    'kitchen', true, '23:00'::time, 'daily', 'high', 'required', 'critical',
    '[
      {"label":"Mutfak temizlendi mi?","required":true},
      {"label":"Ocak kapatıldı mı?","required":true},
      {"label":"Gaz kontrol edildi mi?","required":true},
      {"label":"Kahvaltı hazırlığı yapıldı mı?","required":true},
      {"label":"Çöpler atıldı mı?","required":true},
      {"label":"Elektrikli cihazlar kapatıldı mı?","required":true},
      {"label":"Dolap kontrolü yapıldı mı?","required":true},
      {"label":"Çay kazanı kapatıldı mı?","required":true}
    ]'::jsonb,
    '{"module":"smart_ops"}'::jsonb
  ),
  (
    p_org_id, 'ops_breakfast_0630', 'smart_ops',
    'Sabah Kahvaltı Hazırlığı',
    'Kahvaltı hazırlık kontrolü.',
    'kitchen', true, '06:30'::time, 'daily', 'normal', 'optional', 'normal',
    '[
      {"label":"Çay demlendi mi?","required":true},
      {"label":"Kahvaltı hazır mı?","required":true},
      {"label":"Açık büfe hazırlandı mı?","required":true},
      {"label":"Eksik ürün var mı?","required":true},
      {"label":"Masa düzeni tamamlandı mı?","required":true}
    ]'::jsonb,
    '{"module":"smart_ops"}'::jsonb
  ),
  (
    p_org_id, 'ops_tea_1200', 'smart_ops',
    'Öğle Çayı',
    'Yeni çay demlendi mi?',
    'kitchen', true, '12:00'::time, 'daily', 'normal', 'off', 'normal',
    '[{"label":"Yeni çay demlendi mi?","required":true}]'::jsonb,
    '{"module":"smart_ops"}'::jsonb
  ),
  (
    p_org_id, 'ops_tea_1800', 'smart_ops',
    'Akşam Çayı',
    'Akşam çayı hazırlandı mı?',
    'kitchen', true, '18:00'::time, 'daily', 'normal', 'off', 'normal',
    '[{"label":"Akşam çayı hazırlandı mı?","required":true}]'::jsonb,
    '{"module":"smart_ops"}'::jsonb
  ),
  (
    p_org_id, 'ops_hk_start_0700', 'smart_ops',
    'Temizlik Başlangıcı',
    'Günlük temizlik başlangıç kontrolü.',
    'housekeeping', true, '07:00'::time, 'daily', 'normal', 'optional', 'normal',
    '[
      {"label":"Temizlik başladı mı?","required":true},
      {"label":"Kat arabaları hazır mı?","required":true},
      {"label":"Koridor kontrol edildi mi?","required":true}
    ]'::jsonb,
    '{"module":"smart_ops"}'::jsonb
  ),
  (
    p_org_id, 'ops_reception_close', 'smart_ops',
    'Gece Resepsiyon Kapanışı',
    'Resepsiyon gece kapanış kontrolü.',
    'reception', true, '23:30'::time, 'daily', 'high', 'required', 'manager',
    '[
      {"label":"Resepsiyon masası temizlendi mi?","required":true},
      {"label":"Gün sonu kasa kontrolü yapıldı mı?","required":true},
      {"label":"Kimliği bildirilmeyen misafir kaldı mı?","required":true},
      {"label":"Ücreti alınmayan misafir var mı?","required":true},
      {"label":"Açık lamba kaldı mı?","required":true},
      {"label":"Gereksiz prizler kapatıldı mı?","required":true},
      {"label":"Günlük giriş çıkış teyidi yapıldı mı?","required":true}
    ]'::jsonb,
    '{"module":"smart_ops"}'::jsonb
  )
  ON CONFLICT (organization_id, code)
  DO UPDATE SET
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    target_role = EXCLUDED.target_role,
    send_time = EXCLUDED.send_time,
    checklist = EXCLUDED.checklist,
    template_kind = 'smart_ops',
    updated_at = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_smart_ops_templates(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_smart_ops_templates(uuid) TO authenticated;

-- Depolama: görev fotoğrafları
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'smart-ops-tasks',
  'smart-ops-tasks',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "smart_ops_tasks_storage_select" ON storage.objects;
CREATE POLICY "smart_ops_tasks_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'smart-ops-tasks');

DROP POLICY IF EXISTS "smart_ops_tasks_storage_insert" ON storage.objects;
CREATE POLICY "smart_ops_tasks_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'smart-ops-tasks'
    AND (storage.foldername(name))[1] = public.current_staff_organization_id()::text
  );

DO $$
BEGIN
  PERFORM cron.unschedule('smart_ops_tick_tr')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'smart_ops_tick_tr');
  PERFORM cron.schedule(
    'smart_ops_tick_tr',
    '* * * * *',
    'SELECT public.smart_ops_run_tick();'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron smart_ops schedule skipped: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.smart_ops_run_tick() IS 'Dakikalık operasyon bildirimi + gecikme eskalasyonu (Europe/Istanbul şablon saatleri).';

COMMIT;
