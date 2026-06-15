-- Personel bildirim tercihleri: notification_type → staff_notif_<pref_key> eşlemesi
-- Kapalı pref → filter_staff_notification_recipients alıcıyı çıkarır.

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

  -- Zorunlu / doğrudan anahtar
  IF t IN (
    'message', 'chat_message', 'admin_announcement', 'admin_panel_alert', 'staff_personnel_warning'
  ) OR t LIKE '%emergency%' THEN
    RETURN t;
  END IF;

  -- Tam eşleşme
  IF t IN (
    'staff_assignment', 'staff_new_task', 'staff_urgent_task', 'staff_task_done',
    'staff_new_repair', 'staff_urgent_repair', 'staff_repair_done',
    'stock_pending_approval', 'admin_critical_stock', 'admin_pending_stock', 'staff_stock_entry_pending',
    'breakfast_morning_briefing', 'staff_meal_menu_daily', 'transfer_tour',
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

  -- Prefix / contains
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

  -- Zorunlu bildirimler — kapatılamaz
  IF v_type IN (
    'message',
    'chat_message',
    'admin_announcement',
    'admin_panel_alert',
    'staff_personnel_warning'
  ) OR v_type LIKE '%emergency%' THEN
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
    AND coalesce(np.enabled, true);
END;
$$;

COMMENT ON FUNCTION public.resolve_staff_notification_pref_key(text) IS
  'notification_type → staff_notif_<pref_key> eşlemesi (personel profil tercihleri).';

COMMENT ON FUNCTION public.filter_staff_notification_recipients(uuid[], text) IS
  'Personel alıcı listesini staff_notif_<pref_key> tercihine göre filtreler; mesaj, acil, resmi uyarı ve admin duyuruları daima açıktır.';

GRANT EXECUTE ON FUNCTION public.resolve_staff_notification_pref_key(text) TO authenticated;
