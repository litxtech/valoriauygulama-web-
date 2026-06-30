-- Partner kamera talebi: doğrudan INSERT (RPC 522 yedek) + sistem mesajı trigger.

BEGIN;

-- Partner INSERT (PostgREST — RPC yerine, daha hızlı)
DROP POLICY IF EXISTS camera_requests_partner_insert ON public.camera_requests;
CREATE POLICY camera_requests_partner_insert ON public.camera_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    partner_user_id = public.breakfast_partner_current_user_id()
    AND EXISTS (
      SELECT 1
      FROM public.breakfast_partner_users u
      JOIN public.breakfast_partner_hotels h ON h.id = u.partner_hotel_id
      WHERE u.id = public.breakfast_partner_current_user_id()
        AND u.partner_hotel_id = camera_requests.partner_hotel_id
        AND h.organization_id = camera_requests.organization_id
        AND u.is_active = true
        AND h.status = 'active'
    )
  );

-- Sistem mesajı — INSERT sonrası (RPC + doğrudan insert için tek kaynak)
CREATE OR REPLACE FUNCTION public.camera_request_on_insert_system_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.camera_request_messages (camera_request_id, sender_type, sender_id, body)
  VALUES (NEW.id, 'system', NULL, 'Talep oluşturuldu — durum: BEKLİYOR');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_camera_request_system_message ON public.camera_requests;
CREATE TRIGGER trg_camera_request_system_message
  AFTER INSERT ON public.camera_requests
  FOR EACH ROW EXECUTE FUNCTION public.camera_request_on_insert_system_message();

-- RPC: çift mesajı kaldır; SECURITY DEFINER + row_security kapalı
CREATE OR REPLACE FUNCTION public.partner_create_camera_request(
  p_request_date date,
  p_time_start time,
  p_time_end time DEFAULT NULL,
  p_guest_name text DEFAULT NULL,
  p_room_number text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_request_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_hotel_id uuid;
  v_org_id uuid;
  v_id uuid;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  v_user_id := public.breakfast_partner_current_user_id();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Partner oturumu gerekli';
  END IF;

  IF p_request_date IS NULL OR p_time_start IS NULL THEN
    RAISE EXCEPTION 'Tarih ve saat zorunludur';
  END IF;
  IF p_description IS NULL OR length(trim(p_description)) = 0 THEN
    RAISE EXCEPTION 'Açıklama zorunludur';
  END IF;
  IF p_request_reason IS NULL OR length(trim(p_request_reason)) = 0 THEN
    RAISE EXCEPTION 'Talep nedeni zorunludur';
  END IF;

  SELECT u.partner_hotel_id, h.organization_id
  INTO v_hotel_id, v_org_id
  FROM public.breakfast_partner_users u
  JOIN public.breakfast_partner_hotels h ON h.id = u.partner_hotel_id
  WHERE u.id = v_user_id AND h.status = 'active';

  IF v_hotel_id IS NULL THEN
    RAISE EXCEPTION 'Aktif partner hesabı gerekli';
  END IF;

  INSERT INTO public.camera_requests (
    partner_user_id, partner_hotel_id, organization_id,
    request_date, time_start, time_end,
    guest_name, room_number, description, request_reason, status
  )
  VALUES (
    v_user_id, v_hotel_id, v_org_id,
    p_request_date, p_time_start, p_time_end,
    NULLIF(trim(p_guest_name), ''), NULLIF(trim(p_room_number), ''),
    trim(p_description), trim(p_request_reason), 'bekliyor'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
