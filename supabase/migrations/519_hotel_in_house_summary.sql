-- Otel nüfusu özeti: içeride konaklayan, dolu oda ve BUGÜN giriş yapan kişi sayısı.
-- Kaynak: ops.stay_assignments (KBS kimlik çekimi). Tarih Türkiye saatine göre hesaplanır.

BEGIN;

CREATE OR REPLACE FUNCTION public.hotel_in_house_summary()
RETURNS TABLE (
  in_house integer,
  occupied_rooms integer,
  checkins_today integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_hotel_id uuid;
BEGIN
  v_hotel_id := public.hotel_current_ops_hotel_id();
  IF v_hotel_id IS NULL THEN
    RETURN QUERY SELECT 0, 0, 0;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    count(*) FILTER (
      WHERE s.stay_status IN ('assigned', 'checked_in', 'checkout_pending')
    )::int,
    count(DISTINCT s.room_id) FILTER (
      WHERE s.stay_status IN ('assigned', 'checked_in', 'checkout_pending')
    )::int,
    count(*) FILTER (
      WHERE s.stay_status <> 'cancelled'
        AND (s.check_in_at AT TIME ZONE 'Europe/Istanbul')::date
            = (now() AT TIME ZONE 'Europe/Istanbul')::date
    )::int
  FROM ops.stay_assignments s
  WHERE s.hotel_id = v_hotel_id;
END;
$$;

REVOKE ALL ON FUNCTION public.hotel_in_house_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hotel_in_house_summary() TO authenticated;

COMMIT;
