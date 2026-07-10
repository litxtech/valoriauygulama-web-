-- Supabase: gen_random_bytes extensions şemasında (525 düzeltmesi — zaten uygulandıysa bu migration'ı çalıştırın).

BEGIN;

CREATE OR REPLACE FUNCTION public.breakfast_guest_pass_create(
  p_guest_name text,
  p_room_number text DEFAULT NULL,
  p_record_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_hotel_id uuid;
  v_hotel record;
  v_date date;
  v_today date;
  v_row public.breakfast_guest_passes;
  v_token text;
BEGIN
  v_hotel_id := public.breakfast_partner_current_hotel_id();
  IF v_hotel_id IS NULL THEN
    RAISE EXCEPTION 'Partner otel hesabı bulunamadı veya askıda.';
  END IF;

  SELECT * INTO v_hotel FROM public.breakfast_partner_hotels h WHERE h.id = v_hotel_id;
  IF NOT FOUND OR v_hotel.status <> 'active' THEN
    RAISE EXCEPTION 'Partner otel aktif değil.';
  END IF;

  IF p_guest_name IS NULL OR length(trim(p_guest_name)) = 0 THEN
    RAISE EXCEPTION 'Misafir adı zorunludur.';
  END IF;

  v_today := (timezone('Europe/Istanbul', now()))::date;
  v_date := coalesce(p_record_date, v_today);

  IF v_date < v_today - 1 OR v_date > v_today + 1 THEN
    RAISE EXCEPTION 'Kahvaltı tarihi yalnızca dün, bugün veya yarın olabilir.';
  END IF;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  INSERT INTO public.breakfast_guest_passes (
    partner_hotel_id,
    organization_id,
    record_date,
    guest_name,
    room_number,
    token,
    created_by_auth_id
  )
  VALUES (
    v_hotel_id,
    v_hotel.organization_id,
    v_date,
    trim(p_guest_name),
    nullif(trim(coalesce(p_room_number, '')), ''),
    v_token,
    auth.uid()
  )
  RETURNING * INTO v_row;

  RETURN public.breakfast_guest_pass_to_json(v_row);
END;
$$;

GRANT EXECUTE ON FUNCTION public.breakfast_guest_pass_create(text, text, date) TO authenticated;

COMMIT;
