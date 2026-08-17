-- Personel ayrılış listesi: planlanan otelden çıkış tarihleri + bildirim tercihleri + özel ses

BEGIN;

CREATE TABLE IF NOT EXISTS public.staff_departures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  departure_date date NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'completed', 'cancelled')),
  created_by uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_departures_note_len CHECK (note IS NULL OR length(trim(note)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_departures_one_planned_per_staff
  ON public.staff_departures (organization_id, staff_id)
  WHERE status = 'planned';

CREATE INDEX IF NOT EXISTS idx_staff_departures_org_date
  ON public.staff_departures (organization_id, departure_date ASC, status);

CREATE INDEX IF NOT EXISTS idx_staff_departures_staff
  ON public.staff_departures (staff_id, status, departure_date DESC);

CREATE OR REPLACE FUNCTION public.staff_departures_validate_org()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.id = NEW.staff_id
      AND s.organization_id = NEW.organization_id
      AND s.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'staff_departures: staff organization mismatch';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_departures_validate ON public.staff_departures;
CREATE TRIGGER trg_staff_departures_validate
  BEFORE INSERT OR UPDATE ON public.staff_departures
  FOR EACH ROW EXECUTE FUNCTION public.staff_departures_validate_org();

ALTER TABLE public.staff_departures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_departures_select ON public.staff_departures;
CREATE POLICY staff_departures_select
  ON public.staff_departures FOR SELECT TO authenticated
  USING (
    staff_id = public.current_staff_id()
    OR (
      public.current_user_is_staff_admin()
      AND organization_id = public.current_staff_organization_id()
    )
  );

DROP POLICY IF EXISTS staff_departures_insert ON public.staff_departures;
CREATE POLICY staff_departures_insert
  ON public.staff_departures FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_staff_admin()
    AND organization_id = public.current_staff_organization_id()
    AND created_by = public.current_staff_id()
  );

DROP POLICY IF EXISTS staff_departures_update ON public.staff_departures;
CREATE POLICY staff_departures_update
  ON public.staff_departures FOR UPDATE TO authenticated
  USING (
    public.current_user_is_staff_admin()
    AND organization_id = public.current_staff_organization_id()
  )
  WITH CHECK (
    public.current_user_is_staff_admin()
    AND organization_id = public.current_staff_organization_id()
  );

DROP POLICY IF EXISTS staff_departures_delete ON public.staff_departures;
CREATE POLICY staff_departures_delete
  ON public.staff_departures FOR DELETE TO authenticated
  USING (
    public.current_user_is_staff_admin()
    AND organization_id = public.current_staff_organization_id()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_departures TO authenticated;

COMMENT ON TABLE public.staff_departures IS
  'Personelin otelden planlanan ayrılış tarihleri; oluşturma/güncellemede push bildirim gider.';

-- Bildirim tercih anahtarı
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

  IF t LIKE 'staff_departure%' THEN
    RETURN 'staff_departure';
  END IF;

  IF t IN ('staff_ptt_talk', 'staff_ptt') THEN
    RETURN 'staff_ptt';
  END IF;

  IF t IN ('staff_room_cleaning_started') THEN
    RETURN 'room_cleaning_started';
  END IF;
  IF t IN ('staff_room_cleaning_done') THEN
    RETURN 'room_cleaning_done';
  END IF;

  IF t LIKE 'staff_perf%' THEN RETURN 'staff_perf'; END IF;
  IF t = 'staff_room_linen_handover' OR t LIKE 'staff_room_linen%' THEN RETURN 'room_linen'; END IF;
  IF t = 'booking_offer' OR t LIKE 'booking_%' THEN RETURN 'booking_offer'; END IF;
  IF t LIKE 'room_intelligence%' THEN RETURN 'room_intelligence'; END IF;
  IF t = 'app_screenshot' THEN RETURN 'chat_screenshot'; END IF;
  IF t = 'staff_task_failed' THEN RETURN 'new_task'; END IF;
  IF t = 'kitchen_menu_order_paid' THEN RETURN 'guest_service_request'; END IF;

  IF t LIKE 'lost_found%' THEN RETURN 'lost_found'; END IF;
  IF t LIKE 'incident%' THEN RETURN 'incident'; END IF;
  IF t LIKE 'facility_journal%' THEN RETURN 'facility_journal'; END IF;
  IF t = 'staff_security_camera_recording' OR t LIKE 'security_camera%' OR t LIKE 'staff_security%' THEN
    RETURN 'security_recordings';
  END IF;
  IF t IN ('staff_board_announcement', 'staff_feature_intro') THEN
    RETURN 'announcement';
  END IF;
  IF t LIKE 'qr_complaint%' THEN RETURN 'complaint'; END IF;

  IF t = 'staff_ops_morning_digest' THEN
    RETURN 'ops_morning_digest';
  END IF;

  IF t = 'fault_record_created' OR t LIKE 'fault_record%' THEN
    RETURN 'technical_asset';
  END IF;

  IF t IN (
    'message', 'chat_message', 'admin_announcement', 'admin_panel_alert', 'staff_personnel_warning',
    'staff_quick_note'
  ) OR t LIKE '%emergency%' THEN
    RETURN t;
  END IF;

  IF t IN (
    'kitchen_revenue_entry', 'kitchen_expense_entry', 'kitchen_monthly_market_expense'
  ) THEN
    RETURN 'kitchen_finance';
  END IF;

  IF t IN (
    'staff_assignment', 'staff_new_task', 'staff_urgent_task', 'staff_task_done', 'staff_task_failed',
    'staff_new_repair', 'staff_urgent_repair', 'staff_repair_done',
    'stock_pending_approval', 'admin_critical_stock', 'admin_pending_stock', 'staff_stock_entry_pending',
    'breakfast_morning_briefing', 'breakfast_partner_entry', 'breakfast_partner_remind',
    'breakfast_partner_payment_staff', 'breakfast_partner_approved', 'breakfast_partner_price',
    'breakfast_partner_suspended', 'breakfast_partner_campaign', 'breakfast_partner_camera_video',
    'breakfast_guest_pass_redeemed',
    'staff_meal_menu_daily', 'transfer_tour',
    'attendance_missing_checkin', 'staff_attendance_action',
    'salary_deposited', 'salary_reminder', 'expense_pending_approval', 'report_status',
    'staff_shift_changes', 'admin_pending_leave', 'staff_permission_updated',
    'managed_contract', 'staff_personnel_warning_ack',
    'staff_mention', 'chat_mention', 'chat_screenshot', 'app_screenshot',
    'feed_like', 'feed_comment', 'feed_comment_reply', 'story_like', 'story_reply',
    'feed_post', 'story_post', 'group_added', 'guest_welcome_app', 'staff_debt',
    'tech_fault_report', 'tech_asset_status', 'tech_maintenance_log', 'hotel_facility_status',
    'staff_room_linen_handover', 'booking_offer', 'staff_perf', 'staff_perf_event',
    'hotel_kitchen_menu_order', 'kitchen_menu_order_paid'
  ) THEN
    RETURN CASE t
      WHEN 'staff_assignment' THEN 'staff_assignment'
      WHEN 'staff_new_task' THEN 'new_task'
      WHEN 'staff_urgent_task' THEN 'new_task'
      WHEN 'staff_task_done' THEN 'new_task'
      WHEN 'staff_task_failed' THEN 'new_task'
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
      WHEN 'breakfast_partner_approved' THEN 'breakfast_briefing'
      WHEN 'breakfast_partner_price' THEN 'breakfast_briefing'
      WHEN 'breakfast_partner_suspended' THEN 'breakfast_briefing'
      WHEN 'breakfast_partner_campaign' THEN 'breakfast_briefing'
      WHEN 'breakfast_partner_camera_video' THEN 'breakfast_briefing'
      WHEN 'breakfast_guest_pass_redeemed' THEN 'breakfast_briefing'
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
      WHEN 'app_screenshot' THEN 'chat_screenshot'
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
      WHEN 'tech_fault_report' THEN 'technical_asset'
      WHEN 'tech_asset_status' THEN 'technical_asset'
      WHEN 'tech_maintenance_log' THEN 'technical_asset'
      WHEN 'hotel_facility_status' THEN 'technical_asset'
      WHEN 'staff_room_linen_handover' THEN 'room_linen'
      WHEN 'booking_offer' THEN 'booking_offer'
      WHEN 'staff_perf' THEN 'staff_perf'
      WHEN 'staff_perf_event' THEN 'staff_perf'
      WHEN 'hotel_kitchen_menu_order' THEN 'guest_service_request'
      WHEN 'kitchen_menu_order_paid' THEN 'guest_service_request'
      ELSE t
    END;
  END IF;

  IF t LIKE 'breakfast_confirmation%' THEN RETURN 'breakfast_confirm'; END IF;
  IF t LIKE 'breakfast_partner%' THEN RETURN 'breakfast_briefing'; END IF;
  IF t LIKE 'kitchen%' OR t LIKE 'meal%' THEN RETURN 'kitchen_request'; END IF;
  IF t LIKE 'guest_request%' OR t LIKE 'guest_checkin%' OR t LIKE 'guest_checkout%'
     OR t LIKE 'guest_admin_assigned%' OR t LIKE 'guest_room%' OR t LIKE 'admin_pending_checkin%' THEN
    RETURN 'reception_request';
  END IF;
  IF t LIKE 'staff_room_payment%' THEN RETURN 'room_payment'; END IF;
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
  IF t LIKE 'tech_%' THEN RETURN 'technical_asset'; END IF;
  IF t LIKE 'chat_%' THEN RETURN 'staff_mention'; END IF;
  IF t LIKE 'bulk_%' OR t LIKE '%announcement%' OR t LIKE '%board%' THEN RETURN 'announcement'; END IF;
  IF t LIKE '%checkin%' OR t LIKE '%checkout%' THEN RETURN 'reception_request'; END IF;

  RETURN t;
END;
$$;

-- Ayrılış bildirimi kapatılamaz (ilgili personel mutlaka görür)
CREATE OR REPLACE FUNCTION public.filter_staff_notification_recipients(
  p_staff_ids uuid[],
  p_notification_type text
)
RETURNS TABLE(staff_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text := lower(coalesce(trim(p_notification_type), ''));
  v_pref text;
BEGIN
  IF p_staff_ids IS NULL OR array_length(p_staff_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF v_type IN (
    'message',
    'chat_message',
    'admin_announcement',
    'admin_panel_alert',
    'staff_personnel_warning',
    'staff_quick_note',
    'staff_attendance_action',
    'scheduled_template_notification',
    'room_intelligence',
    'room_intelligence_completed',
    'room_intelligence_update',
    'staff_departure_scheduled',
    'staff_departure_updated',
    'staff_departure_cancelled'
  ) OR v_type LIKE '%emergency%'
    OR v_type LIKE 'room_intelligence%'
    OR v_type LIKE 'staff_departure%' THEN
    RETURN QUERY
    SELECT s.id FROM public.staff s WHERE s.id = ANY (p_staff_ids);
    RETURN;
  END IF;

  v_pref := public.resolve_staff_notification_pref_key(v_type);

  RETURN QUERY
  SELECT s.id
  FROM public.staff s
  LEFT JOIN public.notification_preferences np
    ON np.staff_id = s.id
   AND np.pref_key = 'staff_notif_' || v_pref
  WHERE s.id = ANY (p_staff_ids)
    AND coalesce(np.enabled, true)
    AND NOT EXISTS (
      SELECT 1
      FROM public.staff_notification_admin_blocks b
      WHERE b.staff_id = s.id
        AND b.pref_key = v_pref
    );
END;
$$;

-- Özel ayrılış bildirim sesi
CREATE OR REPLACE FUNCTION public.get_notification_sound_push_config(
  p_organization_id uuid,
  p_feature_key text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (
      SELECT jsonb_build_object(
        'feature_key', s.feature_key,
        'is_active', s.is_active,
        'ios_push_sound', CASE WHEN s.is_active THEN coalesce(nullif(trim(s.ios_push_sound), ''), 'default') ELSE 'default' END,
        'android_push_sound', CASE WHEN s.is_active THEN coalesce(nullif(trim(s.android_push_sound), ''), 'default') ELSE 'default' END,
        'android_channel_id', coalesce(
          nullif(trim(s.android_channel_id), ''),
          'valoria_ns_' || s.feature_key || '_v' || s.android_channel_version::text
        ),
        'sound_file_url', s.sound_file_url,
        'sound_file_name', s.sound_file_name,
        'sound_duration', s.sound_duration,
        'suppress_default_sound', coalesce(s.suppress_default_sound, false)
          AND nullif(trim(s.sound_file_url), '') IS NOT NULL,
        'priority', CASE
          WHEN s.feature_key IN ('emergency_alert', 'staff_ptt', 'staff_departure') THEN 'high'
          ELSE 'normal'
        END
      )
      FROM public.notification_sound_settings s
      WHERE s.organization_id = p_organization_id
        AND s.feature_key = p_feature_key
        AND s.is_active = true
      LIMIT 1
    ),
    jsonb_build_object(
      'feature_key', p_feature_key,
      'is_active', true,
      'ios_push_sound', CASE p_feature_key
        WHEN 'emergency_alert' THEN 'emergency_alert.wav'
        WHEN 'new_task' THEN 'task_ping.wav'
        WHEN 'kitchen_request' THEN 'meal_chime.wav'
        WHEN 'salary' THEN 'salary_cash.wav'
        WHEN 'staff_call' THEN 'warning_alert.wav'
        WHEN 'kbs_notification' THEN 'kbs_scan.wav'
        WHEN 'new_message' THEN 'message_pop.wav'
        WHEN 'room_cleaning' THEN 'room_cleaning.wav'
        WHEN 'room_payment' THEN 'room_payment.wav'
        WHEN 'staff_ptt' THEN 'walkie_ptt_open.wav'
        WHEN 'staff_departure' THEN 'staff_departure_farewell.wav'
        ELSE 'default'
      END,
      'android_push_sound', CASE p_feature_key
        WHEN 'emergency_alert' THEN 'emergency_alert.wav'
        WHEN 'new_task' THEN 'task_ping.wav'
        WHEN 'kitchen_request' THEN 'meal_chime.wav'
        WHEN 'salary' THEN 'salary_cash.wav'
        WHEN 'staff_call' THEN 'warning_alert.wav'
        WHEN 'kbs_notification' THEN 'kbs_scan.wav'
        WHEN 'new_message' THEN 'message_pop.wav'
        WHEN 'room_cleaning' THEN 'room_cleaning.wav'
        WHEN 'room_payment' THEN 'room_payment.wav'
        WHEN 'staff_ptt' THEN 'walkie_ptt_open.wav'
        WHEN 'staff_departure' THEN 'staff_departure_farewell.wav'
        ELSE 'default'
      END,
      'android_channel_id', CASE p_feature_key
        WHEN 'emergency_alert' THEN 'valoria_emergency_alert'
        WHEN 'new_task' THEN 'valoria_task_v1'
        WHEN 'kitchen_request' THEN 'valoria_meal_v1'
        WHEN 'salary' THEN 'valoria_salary_v1'
        WHEN 'staff_call' THEN 'valoria_warning_v1'
        WHEN 'kbs_notification' THEN 'valoria_kbs_v1'
        WHEN 'new_message' THEN 'valoria_messages_v2'
        WHEN 'room_cleaning' THEN 'valoria_cleaning_v1'
        WHEN 'room_payment' THEN 'valoria_room_payment_v1'
        WHEN 'staff_ptt' THEN 'valoria_ns_staff_ptt_v2'
        WHEN 'staff_departure' THEN 'valoria_ns_staff_departure_v1'
        ELSE 'valoria_urgent'
      END,
      'suppress_default_sound', false,
      'priority', CASE
        WHEN p_feature_key IN ('emergency_alert', 'staff_ptt', 'staff_departure') THEN 'high'
        ELSE 'normal'
      END
    )
  );
$$;

INSERT INTO public.notification_sound_settings (
  organization_id,
  feature_key,
  title,
  description,
  ios_push_sound,
  android_push_sound,
  android_channel_id,
  is_active,
  android_channel_version
)
SELECT
  o.id,
  'staff_departure',
  'Personel ayrılış',
  'Planlanan otelden çıkış tarihi bildirimi',
  'staff_departure_farewell.wav',
  'staff_departure_farewell.wav',
  'valoria_ns_staff_departure_v1',
  true,
  1
FROM public.organizations o
ON CONFLICT (organization_id, feature_key) DO UPDATE
SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  ios_push_sound = CASE
    WHEN coalesce(nullif(trim(notification_sound_settings.sound_file_url), ''), '') = ''
      THEN EXCLUDED.ios_push_sound
    ELSE notification_sound_settings.ios_push_sound
  END,
  android_push_sound = CASE
    WHEN coalesce(nullif(trim(notification_sound_settings.sound_file_url), ''), '') = ''
      THEN EXCLUDED.android_push_sound
    ELSE notification_sound_settings.android_push_sound
  END,
  android_channel_id = CASE
    WHEN coalesce(nullif(trim(notification_sound_settings.sound_file_url), ''), '') = ''
      THEN EXCLUDED.android_channel_id
    ELSE notification_sound_settings.android_channel_id
  END,
  is_active = true,
  updated_at = NOW();

COMMIT;
