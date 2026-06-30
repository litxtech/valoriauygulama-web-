-- upsert_guest/staff_push_token: partner sütunu eklendikten (473) sonra aynı Expo token
-- partner → misafir/personel geçişinde breakfast_partner_user_id temizlenmiyordu;
-- push_recipient_check ihlali (23514) oluşuyordu.

CREATE OR REPLACE FUNCTION public.upsert_staff_push_token(p_token TEXT, p_device_info JSONB DEFAULT '{}'::JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_staff_id UUID;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN;
  END IF;
  SELECT id INTO v_staff_id FROM public.staff WHERE auth_id = auth.uid() LIMIT 1;
  IF v_staff_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.push_tokens (guest_id, staff_id, breakfast_partner_user_id, token, device_info)
  VALUES (NULL, v_staff_id, NULL, btrim(p_token), COALESCE(p_device_info, '{}'::JSONB))
  ON CONFLICT (token) DO UPDATE SET
    staff_id = EXCLUDED.staff_id,
    guest_id = NULL,
    breakfast_partner_user_id = NULL,
    device_info = EXCLUDED.device_info;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_guest_push_token(p_app_token TEXT, p_token TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_guest_id UUID;
BEGIN
  IF p_app_token IS NULL OR p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN;
  END IF;
  v_guest_id := public.messaging_resolve_guest_id(p_app_token);
  IF v_guest_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.push_tokens (guest_id, staff_id, breakfast_partner_user_id, token, device_info)
  VALUES (v_guest_id, NULL, NULL, btrim(p_token), '{}'::jsonb)
  ON CONFLICT (token) DO UPDATE SET
    guest_id = EXCLUDED.guest_id,
    staff_id = NULL,
    breakfast_partner_user_id = NULL;
END;
$$;
