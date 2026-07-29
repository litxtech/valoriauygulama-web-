-- İşe başladım / mesaim bitti push: tüm personele gitsin; tercih ile kapatılamaz.

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
    'staff_personnel_warning',
    'staff_quick_note',
    'staff_attendance_action'
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

COMMENT ON FUNCTION public.filter_staff_notification_recipients(uuid[], text) IS
  'Personel alıcı listesini staff_notif_<pref_key> tercihine göre filtreler; mesaj, acil, resmi uyarı, admin duyuruları, personel notları ve mesai giriş/çıkış (staff_attendance_action) daima açıktır.';
