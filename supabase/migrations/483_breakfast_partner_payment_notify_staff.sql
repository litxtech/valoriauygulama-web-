-- Partner cari tahsilat: admin panelinde seçilen personele push + uygulama içi bildirim

BEGIN;

ALTER TABLE public.breakfast_partner_settings
  ADD COLUMN IF NOT EXISTS payment_notify_staff_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.breakfast_partner_settings.payment_notify_staff_ids IS
  'Partner cari tahsilatı kaydedildiğinde bildirim alacak personel. Boşsa yalnızca partner portalına gider.';

CREATE OR REPLACE FUNCTION public.staff_ids_breakfast_partner_payment_notify(p_org_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT s.id), ARRAY[]::uuid[])
  FROM public.breakfast_partner_settings bps
  JOIN public.staff s ON s.id = ANY (bps.payment_notify_staff_ids)
  WHERE bps.organization_id = p_org_id
    AND s.organization_id = p_org_id
    AND s.is_active = true
    AND s.deleted_at IS NULL;
$$;

COMMENT ON FUNCTION public.staff_ids_breakfast_partner_payment_notify(uuid) IS
  'Admin panelinde seçilen partner cari tahsilat bildirim alıcıları (aktif personel).';

-- breakfast_partner_entry ile aynı pref grubu
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

CREATE OR REPLACE FUNCTION public.breakfast_partner_notify_payment_on_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hotel record;
  v_partner_ids uuid[];
  v_staff_ids uuid[];
  v_filtered uuid[];
  v_title text;
  v_body text;
  v_partner_payload jsonb;
  v_staff_payload jsonb;
  v_push_url text := 'https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/send-expo-push';
  v_amount_label text;
BEGIN
  IF NEW.counterparty_id IS NULL OR NEW.kind <> 'income' THEN
    RETURN NEW;
  END IF;

  SELECT h.id, h.name, h.organization_id
  INTO v_hotel
  FROM public.breakfast_partner_hotels h
  WHERE h.counterparty_id = NEW.counterparty_id
    AND h.status = 'active'
  LIMIT 1;

  IF v_hotel.id IS NULL THEN
    RETURN NEW;
  END IF;

  v_amount_label := to_char(NEW.amount, 'FM999G999G990D00') || ' ₺';

  -- Partner portal bildirimi
  v_title := 'Tahsilat alındı';
  v_body := format('%s tutarında tahsilat kaydedildi.', v_amount_label);
  v_partner_payload := jsonb_build_object(
    'notificationType', 'breakfast_partner_payment',
    'screen', '/partner/(tabs)/account',
    'url', '/partner/(tabs)/account',
    'amount', NEW.amount,
    'hotelName', v_hotel.name,
    'movementId', NEW.id
  );

  PERFORM public.breakfast_partner_insert_notifications(
    v_hotel.id,
    'breakfast_partner_payment',
    v_title,
    v_body,
    v_partner_payload
  );

  v_partner_ids := public.breakfast_partner_user_ids_for_hotel(v_hotel.id);
  IF v_partner_ids IS NOT NULL AND array_length(v_partner_ids, 1) > 0 THEN
    PERFORM net.http_post(
      url := v_push_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'partnerUserIds', to_jsonb(v_partner_ids),
        'title', v_title,
        'body', v_body,
        'data', v_partner_payload
      ),
      timeout_milliseconds := 15000
    );
  END IF;

  -- Admin panelinde seçilen personel
  v_staff_ids := public.staff_ids_breakfast_partner_payment_notify(v_hotel.organization_id);
  IF v_staff_ids IS NULL OR array_length(v_staff_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(array_agg(f.staff_id), ARRAY[]::uuid[])
  INTO v_filtered
  FROM public.filter_staff_notification_recipients(v_staff_ids, 'breakfast_partner_payment_staff') f;

  IF v_filtered IS NULL OR array_length(v_filtered, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  v_title := 'Partner cari tahsilat';
  v_body := v_hotel.name || ' · ' || v_amount_label;
  IF NEW.description IS NOT NULL AND length(trim(NEW.description)) > 0 THEN
    v_body := v_body || E'\n' || left(trim(NEW.description), 120);
  END IF;

  v_staff_payload := jsonb_build_object(
    'notificationType', 'breakfast_partner_payment_staff',
    'screen', '/admin/breakfast-partners/' || v_hotel.id::text,
    'url', '/admin/breakfast-partners/' || v_hotel.id::text,
    'adminUrl', '/admin/breakfast-partners/' || v_hotel.id::text,
    'amount', NEW.amount,
    'hotelName', v_hotel.name,
    'partnerHotelId', v_hotel.id::text,
    'movementId', NEW.id::text,
    'organizationId', v_hotel.organization_id::text
  );

  INSERT INTO public.notifications (
    staff_id, guest_id, title, body, category, notification_type, data, created_by, sent_via, sent_at
  )
  SELECT sid, NULL, v_title, left(v_body, 500), 'staff', 'breakfast_partner_payment_staff', v_staff_payload, NULL, 'both', now()
  FROM unnest(v_filtered) AS sid;

  PERFORM net.http_post(
    url := v_push_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'staffIds', to_jsonb(v_filtered),
      'title', v_title,
      'body', left(v_body, 240),
      'data', v_staff_payload
    ),
    timeout_milliseconds := 15000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'breakfast_partner_notify_payment_on_movement: %', SQLERRM;
  RETURN NEW;
END;
$$;

COMMIT;
