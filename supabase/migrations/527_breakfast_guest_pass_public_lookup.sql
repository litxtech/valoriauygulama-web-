-- Kahvaltı misafir QR — token ile herkese açık bilgi sorgusu (QR web sayfası).

BEGIN;

CREATE OR REPLACE FUNCTION public.breakfast_guest_pass_public_lookup(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RETURN NULL;
  END IF;

  SELECT
    p.guest_name,
    p.room_number,
    p.record_date,
    p.created_at,
    p.redeemed_at,
    p.cancelled_at,
    h.name AS hotel_name,
    h.city AS hotel_city,
    h.phone AS hotel_phone,
    h.contact_name AS hotel_contact
  INTO v_row
  FROM public.breakfast_guest_passes p
  JOIN public.breakfast_partner_hotels h ON h.id = p.partner_hotel_id
  WHERE p.token = trim(p_token)
    AND h.status = 'active';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'guestName', v_row.guest_name,
    'roomNumber', v_row.room_number,
    'recordDate', v_row.record_date,
    'createdAt', v_row.created_at,
    'redeemedAt', v_row.redeemed_at,
    'cancelledAt', v_row.cancelled_at,
    'partnerHotelName', v_row.hotel_name,
    'partnerHotelCity', v_row.hotel_city,
    'partnerHotelPhone', v_row.hotel_phone,
    'partnerHotelContact', v_row.hotel_contact,
    'status', CASE
      WHEN v_row.cancelled_at IS NOT NULL THEN 'cancelled'
      WHEN v_row.redeemed_at IS NOT NULL THEN 'redeemed'
      ELSE 'pending'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.breakfast_guest_pass_public_lookup(text) TO anon, authenticated;

COMMIT;
