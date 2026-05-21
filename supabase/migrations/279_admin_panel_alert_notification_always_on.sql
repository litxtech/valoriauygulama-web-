-- Admin panel push türleri: personel tercihinde kapalı olsa bile (sendExpoPush yolu) admin alıcıları filtrelenmesin.
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
BEGIN
  IF p_staff_ids IS NULL OR array_length(p_staff_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF v_type IN (
    'message',
    'admin_announcement',
    'admin_panel_alert',
    'stock_pending_approval',
    'expense_pending_approval',
    'staff_personnel_warning',
    'staff_personnel_warning_ack'
  ) THEN
    RETURN QUERY
    SELECT s.id
    FROM public.staff s
    WHERE s.id = ANY (p_staff_ids);
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.id
  FROM public.staff s
  LEFT JOIN public.notification_preferences np
    ON np.staff_id = s.id
   AND np.pref_key = 'staff_notif_' || v_type
  WHERE s.id = ANY (p_staff_ids)
    AND coalesce(np.enabled, true);
END;
$$;

COMMENT ON FUNCTION public.filter_staff_notification_recipients(uuid[], text) IS
  'Personel alıcı listesini tercihe göre filtreler; mesaj, admin duyuru ve admin panel onay türleri daima açıktır.';
