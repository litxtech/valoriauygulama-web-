-- Sabah 08:00 (Europe/Istanbul): bugün çıkış + temizlik oda sayısı push
BEGIN;

CREATE TABLE IF NOT EXISTS public.ops_morning_digest_log (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  digest_date date NOT NULL,
  checkout_pending integer NOT NULL DEFAULT 0,
  cleaning_pending integer NOT NULL DEFAULT 0,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, digest_date)
);

COMMENT ON TABLE public.ops_morning_digest_log IS
  'Sabah çıkış/temizlik özeti push idempotency (org + İstanbul günü).';

CREATE OR REPLACE FUNCTION public.staff_ids_ops_morning_digest(p_org_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT s.id), ARRAY[]::uuid[])
  FROM public.staff s
  WHERE s.organization_id = p_org_id
    AND s.is_active = true
    AND s.deleted_at IS NULL
    AND (
      s.role IN (
        'admin',
        'reception_chief',
        'receptionist',
        'housekeeping',
        'manager'
      )
      OR coalesce((s.app_permissions->>'doluluk_operasyon')::boolean, false)
      OR coalesce((s.app_permissions->>'housekeeping_yonetim')::boolean, false)
      OR coalesce((s.app_permissions->>'yarin_oda_temizlik_listesi')::boolean, false)
    );
$$;

COMMENT ON FUNCTION public.staff_ids_ops_morning_digest(uuid) IS
  'Sabah çıkış/temizlik özeti alıcıları: resepsiyon, temizlik, doluluk yetkilileri.';

CREATE OR REPLACE FUNCTION public.send_ops_morning_digest()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date;
  v_org record;
  v_checkout integer;
  v_cleaning integer;
  v_staff_ids uuid[];
  v_filtered uuid[];
  v_title text;
  v_body text;
  v_payload jsonb;
  v_parts text[];
  v_checkout_rooms text;
  v_cleaning_rooms text;
  v_sent integer := 0;
  v_screen text;
BEGIN
  v_today := (timezone('Europe/Istanbul', now()))::date;
  v_title := 'Sabah özet';

  FOR v_org IN
    SELECT DISTINCT x.organization_id
    FROM (
      SELECT j.organization_id
      FROM public.room_checkout_jobs j
      WHERE j.target_date = v_today
        AND j.status = 'pending'
      UNION
      SELECT j.organization_id
      FROM public.room_housekeeping_jobs j
      WHERE j.target_date = v_today
        AND j.status IN ('dirty', 'cleaning')
    ) x
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.ops_morning_digest_log l
      WHERE l.organization_id = x.organization_id
        AND l.digest_date = v_today
    )
  LOOP
    SELECT count(*)::integer
    INTO v_checkout
    FROM public.room_checkout_jobs j
    WHERE j.organization_id = v_org.organization_id
      AND j.target_date = v_today
      AND j.status = 'pending';

    SELECT count(*)::integer
    INTO v_cleaning
    FROM public.room_housekeeping_jobs j
    WHERE j.organization_id = v_org.organization_id
      AND j.target_date = v_today
      AND j.status IN ('dirty', 'cleaning');

    IF coalesce(v_checkout, 0) = 0 AND coalesce(v_cleaning, 0) = 0 THEN
      CONTINUE;
    END IF;

    SELECT string_agg(x.lbl, ', ' ORDER BY x.lbl)
    INTO v_checkout_rooms
    FROM (
      SELECT coalesce(
        nullif(trim(r.room_number), ''),
        nullif(trim(j.location_label), ''),
        '—'
      ) AS lbl
      FROM public.room_checkout_jobs j
      LEFT JOIN public.rooms r ON r.id = j.room_id
      WHERE j.organization_id = v_org.organization_id
        AND j.target_date = v_today
        AND j.status = 'pending'
      ORDER BY 1
      LIMIT 8
    ) x;

    SELECT string_agg(x.lbl, ', ' ORDER BY x.lbl)
    INTO v_cleaning_rooms
    FROM (
      SELECT coalesce(
        nullif(trim(r.room_number), ''),
        nullif(trim(j.location_label), ''),
        '—'
      ) AS lbl
      FROM public.room_housekeeping_jobs j
      LEFT JOIN public.rooms r ON r.id = j.room_id
      WHERE j.organization_id = v_org.organization_id
        AND j.target_date = v_today
        AND j.status IN ('dirty', 'cleaning')
      ORDER BY 1
      LIMIT 8
    ) x;

    v_parts := ARRAY[]::text[];
    IF v_checkout > 0 THEN
      v_parts := array_append(
        v_parts,
        'Çıkış: ' || v_checkout::text || ' oda'
        || CASE
          WHEN coalesce(v_checkout_rooms, '') <> '' THEN ' (' || v_checkout_rooms
            || CASE WHEN v_checkout > 8 THEN '…' ELSE '' END || ')'
          ELSE ''
        END
      );
    ELSE
      v_parts := array_append(v_parts, 'Çıkış: yok');
    END IF;

    IF v_cleaning > 0 THEN
      v_parts := array_append(
        v_parts,
        'Temizlik: ' || v_cleaning::text || ' oda'
        || CASE
          WHEN coalesce(v_cleaning_rooms, '') <> '' THEN ' (' || v_cleaning_rooms
            || CASE WHEN v_cleaning > 8 THEN '…' ELSE '' END || ')'
          ELSE ''
        END
      );
    ELSE
      v_parts := array_append(v_parts, 'Temizlik: yok');
    END IF;

    v_body := array_to_string(v_parts, E'\n');
    v_screen := CASE
      WHEN v_checkout > 0 THEN '/staff/checkout-board'
      ELSE '/staff/cleaning-plan'
    END;

    v_payload := jsonb_build_object(
      'notificationType', 'staff_ops_morning_digest',
      'screen', v_screen,
      'url', v_screen,
      'digestDate', v_today::text,
      'checkoutPending', v_checkout,
      'cleaningPending', v_cleaning
    );

    v_staff_ids := public.staff_ids_ops_morning_digest(v_org.organization_id);
    IF v_staff_ids IS NULL OR coalesce(array_length(v_staff_ids, 1), 0) = 0 THEN
      INSERT INTO public.ops_morning_digest_log (
        organization_id, digest_date, checkout_pending, cleaning_pending
      ) VALUES (
        v_org.organization_id, v_today, v_checkout, v_cleaning
      )
      ON CONFLICT DO NOTHING;
      CONTINUE;
    END IF;

    SELECT array_agg(f.staff_id)
    INTO v_filtered
    FROM public.filter_staff_notification_recipients(v_staff_ids, 'staff_ops_morning_digest') f;

    IF v_filtered IS NULL OR coalesce(array_length(v_filtered, 1), 0) = 0 THEN
      INSERT INTO public.ops_morning_digest_log (
        organization_id, digest_date, checkout_pending, cleaning_pending
      ) VALUES (
        v_org.organization_id, v_today, v_checkout, v_cleaning
      )
      ON CONFLICT DO NOTHING;
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (
      staff_id, guest_id, title, body, category, notification_type, data, created_by, sent_via, sent_at
    )
    SELECT
      sid,
      NULL,
      v_title,
      v_body,
      'staff',
      'staff_ops_morning_digest',
      v_payload,
      NULL,
      'both',
      now()
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

    INSERT INTO public.ops_morning_digest_log (
      organization_id, digest_date, checkout_pending, cleaning_pending
    ) VALUES (
      v_org.organization_id, v_today, v_checkout, v_cleaning
    )
    ON CONFLICT DO NOTHING;

    v_sent := v_sent + 1;
  END LOOP;

  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.send_ops_morning_digest() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_ops_morning_digest() TO postgres;
REVOKE ALL ON FUNCTION public.staff_ids_ops_morning_digest(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_ids_ops_morning_digest(uuid) TO postgres;

-- Pref: staff_ops_morning_digest → ops_morning_digest (ops_% smart_ops'a düşmesin)
CREATE OR REPLACE FUNCTION public.resolve_staff_notification_pref_key(p_notification_type text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  t text := lower(coalesce(trim(p_notification_type), ''));
BEGIN
  IF t = '' THEN
    RETURN 'announcement';
  END IF;

  IF t = 'staff_ops_morning_digest' THEN
    RETURN 'ops_morning_digest';
  END IF;

  IF t IN (
    'message', 'chat_message', 'admin_announcement', 'admin_panel_alert', 'staff_personnel_warning'
  ) OR t LIKE '%emergency%' THEN
    RETURN t;
  END IF;

  IF t IN (
    'staff_assignment', 'staff_new_task', 'staff_urgent_task', 'staff_task_done',
    'staff_new_repair', 'staff_urgent_repair', 'staff_repair_done',
    'stock_pending_approval', 'admin_critical_stock', 'admin_pending_stock', 'staff_stock_entry_pending',
    'breakfast_morning_briefing', 'breakfast_partner_entry', 'breakfast_partner_remind',
    'breakfast_partner_payment_staff',
    'staff_meal_menu_daily', 'transfer_tour',
    'attendance_missing_checkin', 'staff_attendance_action',
    'salary_deposited', 'salary_reminder', 'expense_pending_approval', 'report_status',
    'staff_shift_changes', 'admin_pending_leave', 'staff_permission_updated',
    'managed_contract', 'staff_personnel_warning_ack',
    'staff_mention', 'chat_mention', 'chat_screenshot',
    'feed_like', 'feed_comment', 'feed_comment_reply', 'story_like', 'story_reply',
    'feed_post', 'story_post', 'group_added', 'guest_welcome_app', 'staff_debt'
  ) THEN
    RETURN CASE t
      WHEN 'staff_assignment' THEN 'staff_assignment'
      WHEN 'staff_new_task' THEN 'new_task'
      WHEN 'staff_urgent_task' THEN 'new_task'
      WHEN 'staff_task_done' THEN 'new_task'
      WHEN 'staff_new_repair' THEN 'new_task'
      WHEN 'staff_urgent_repair' THEN 'new_task'
      WHEN 'staff_repair_done' THEN 'new_task'
      WHEN 'stock_pending_approval' THEN 'stock_pending_approval'
      WHEN 'admin_critical_stock' THEN 'stock_pending_approval'
      WHEN 'admin_pending_stock' THEN 'stock_pending_approval'
      WHEN 'staff_stock_entry_pending' THEN 'stock_pending_approval'
      WHEN 'breakfast_morning_briefing' THEN 'breakfast_briefing'
      WHEN 'breakfast_partner_entry' THEN 'breakfast_briefing'
      WHEN 'breakfast_partner_remind' THEN 'breakfast_briefing'
      WHEN 'breakfast_partner_payment_staff' THEN 'breakfast_briefing'
      WHEN 'staff_meal_menu_daily' THEN 'staff_meal_menu_daily'
      WHEN 'transfer_tour' THEN 'reception_request'
      WHEN 'attendance_missing_checkin' THEN 'attendance'
      WHEN 'staff_attendance_action' THEN 'attendance'
      WHEN 'salary_deposited' THEN 'salary_deposited'
      WHEN 'salary_reminder' THEN 'salary_reminder'
      WHEN 'expense_pending_approval' THEN 'expense_pending_approval'
      WHEN 'report_status' THEN 'report_status'
      WHEN 'staff_shift_changes' THEN 'shift_leave'
      WHEN 'admin_pending_leave' THEN 'shift_leave'
      WHEN 'staff_permission_updated' THEN 'staff_permission_updated'
      WHEN 'managed_contract' THEN 'managed_contract'
      WHEN 'staff_personnel_warning_ack' THEN 'staff_personnel_warning_ack'
      WHEN 'staff_mention' THEN 'staff_mention'
      WHEN 'chat_mention' THEN 'staff_mention'
      WHEN 'chat_screenshot' THEN 'chat_screenshot'
      WHEN 'feed_like' THEN 'feed_like'
      WHEN 'feed_comment' THEN 'feed_comment'
      WHEN 'feed_comment_reply' THEN 'feed_comment_reply'
      WHEN 'story_like' THEN 'story_like'
      WHEN 'story_reply' THEN 'story_reply'
      WHEN 'feed_post' THEN 'feed_post'
      WHEN 'story_post' THEN 'story_post'
      WHEN 'group_added' THEN 'group_added'
      WHEN 'guest_welcome_app' THEN 'guest_welcome_app'
      WHEN 'staff_debt' THEN 'accounting_document'
      ELSE t
    END;
  END IF;

  IF t LIKE 'breakfast_confirmation%' THEN RETURN 'breakfast_confirm'; END IF;
  IF t LIKE 'kitchen%' OR t LIKE 'meal%' THEN RETURN 'kitchen_request'; END IF;
  IF t LIKE 'guest_request%' OR t LIKE 'guest_checkin%' OR t LIKE 'guest_checkout%'
     OR t LIKE 'guest_admin_assigned%' OR t LIKE 'guest_room%' OR t LIKE 'admin_pending_checkin%' THEN
    RETURN 'reception_request';
  END IF;
  IF t LIKE 'staff_room_cleaning%' THEN RETURN 'room_cleaning'; END IF;
  IF t LIKE 'guest_complaint%' OR t LIKE 'staff_internal_note%' THEN RETURN 'complaint'; END IF;
  IF t LIKE 'missing_item%' THEN RETURN 'missing_item'; END IF;
  IF t LIKE 'attendance_%' THEN RETURN 'attendance'; END IF;
  IF t LIKE 'kbs_%' THEN RETURN 'kbs_notification'; END IF;
  IF t LIKE 'finance%' OR t LIKE 'maliye%' OR t LIKE '%accounting%' OR t LIKE '%document%' THEN
    RETURN 'accounting_document';
  END IF;
  IF t LIKE 'admin_contract%' OR t LIKE 'guest_contract%' OR t LIKE '%contract_acceptance%' OR t LIKE '%acceptance%' THEN
    RETURN 'guest_form';
  END IF;
  IF t LIKE 'smart_ops%' OR t LIKE 'ops_%' THEN RETURN 'smart_ops'; END IF;
  IF t LIKE 'admin_daily_report%' OR t LIKE 'admin_evening_report%' OR t LIKE 'admin_weekly_report%'
     OR t LIKE 'admin_high_occupancy%' OR t LIKE 'admin_empty_rooms%' OR t LIKE 'admin_payment_reminder%' THEN
    RETURN 'admin_reports';
  END IF;
  IF t LIKE 'staff_stock%' OR t LIKE 'kitchen_shortage%' OR t LIKE '%stock%' THEN
    RETURN 'stock_pending_approval';
  END IF;
  IF t LIKE 'chat_%' THEN RETURN 'staff_mention'; END IF;
  IF t LIKE 'bulk_%' OR t LIKE '%announcement%' OR t LIKE '%board%' THEN RETURN 'announcement'; END IF;
  IF t LIKE '%checkin%' OR t LIKE '%checkout%' THEN RETURN 'reception_request'; END IF;

  RETURN t;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('ops_morning_digest_tr')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'ops_morning_digest_tr'
  );
  PERFORM cron.schedule(
    'ops_morning_digest_tr',
    '0 5 * * *',
    'SELECT public.send_ops_morning_digest();'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron ops morning digest schedule skipped: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.send_ops_morning_digest() IS
  'Her gün 08:00 (Europe/Istanbul) bugün çıkış + temizlik oda sayısı; pg_cron UTC 05:00.';

COMMIT;
