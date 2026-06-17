BEGIN;

-- Çoklu mesai oturumu: gün içinde birden fazla giriş/çıkış.
-- Kural: son kayıt check_in ise yalnızca çıkış; değilse giriş yapılabilir.

CREATE OR REPLACE FUNCTION public.staff_attendance_last_work_event_today(
  p_staff_id uuid,
  p_work_date date
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT e.event_type
  FROM public.staff_attendance_events e
  WHERE e.staff_id = p_staff_id
    AND e.event_type IN ('check_in', 'check_out')
    AND (e.event_time AT TIME ZONE 'Europe/Istanbul')::date = p_work_date
  ORDER BY e.event_time DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.staff_attendance_check_in(
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_accuracy_m double precision DEFAULT NULL,
  p_device_info jsonb DEFAULT '{}'::jsonb,
  p_note text DEFAULT NULL,
  p_event_time timestamptz DEFAULT now(),
  p_source text DEFAULT 'mobile'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_hotel_lat double precision;
  v_hotel_lon double precision;
  v_geo_radius integer := 250;
  v_distance integer;
  v_location_status text := 'missing';
  v_shift_start time;
  v_shift_grace integer := 5;
  v_shift_start_ts timestamptz;
  v_late_minutes integer := 0;
  v_today date := (p_event_time AT TIME ZONE 'Europe/Istanbul')::date;
  v_last_event text;
  v_first_checkin_today timestamptz;
BEGIN
  v_staff_id := public.get_my_staff_id();
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Personel kaydi bulunamadi';
  END IF;

  v_last_event := public.staff_attendance_last_work_event_today(v_staff_id, v_today);
  IF v_last_event = 'check_in' THEN
    RAISE EXCEPTION 'Halen mesaidesiniz. Once cikis yapin.';
  END IF;

  SELECT hi.latitude, hi.longitude, hi.attendance_geofence_radius_m
  INTO v_hotel_lat, v_hotel_lon, v_geo_radius
  FROM public.hotel_info hi
  ORDER BY hi.created_at ASC
  LIMIT 1;

  SELECT sh.start_time, sh.grace_minutes
  INTO v_shift_start, v_shift_grace
  FROM public.staff s
  LEFT JOIN public.shifts sh ON sh.id = s.shift_id
  WHERE s.id = v_staff_id;

  IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL AND v_hotel_lat IS NOT NULL AND v_hotel_lon IS NOT NULL THEN
    v_distance := public.haversine_distance_m(p_latitude, p_longitude, v_hotel_lat, v_hotel_lon);
    IF v_distance <= COALESCE(v_geo_radius, 250) THEN
      v_location_status := 'verified';
    ELSE
      v_location_status := 'outside_hotel_radius';
      RAISE EXCEPTION 'Konum dogrulanamadi';
    END IF;
  ELSIF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
    v_location_status := 'unavailable';
  END IF;

  SELECT min(e.event_time)
  INTO v_first_checkin_today
  FROM public.staff_attendance_events e
  WHERE e.staff_id = v_staff_id
    AND e.event_type = 'check_in'
    AND (e.event_time AT TIME ZONE 'Europe/Istanbul')::date = v_today;

  IF v_first_checkin_today IS NULL AND v_shift_start IS NOT NULL THEN
    v_shift_start_ts := (v_today::text || ' ' || v_shift_start::text || '+03')::timestamptz;
    v_late_minutes := GREATEST(
      0,
      floor(
        extract(
          epoch FROM (
            p_event_time
            - (v_shift_start_ts + make_interval(mins => COALESCE(v_shift_grace, 5)))
          )
        ) / 60
      )::integer
    );
  END IF;

  INSERT INTO public.staff_attendance_events (
    staff_id,
    event_type,
    event_time,
    source,
    latitude,
    longitude,
    accuracy_m,
    distance_to_hotel_m,
    location_status,
    device_info,
    note,
    metadata,
    created_by_staff_id
  ) VALUES (
    v_staff_id,
    'check_in',
    p_event_time,
    COALESCE(NULLIF(trim(p_source), ''), 'mobile'),
    p_latitude,
    p_longitude,
    p_accuracy_m,
    v_distance,
    v_location_status,
    COALESCE(p_device_info, '{}'::jsonb),
    p_note,
    jsonb_build_object('late_minutes', v_late_minutes),
    v_staff_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'staff_id', v_staff_id,
    'event_time', p_event_time,
    'late_minutes', v_late_minutes,
    'location_status', v_location_status,
    'distance_to_hotel_m', v_distance
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_attendance_check_out(
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_accuracy_m double precision DEFAULT NULL,
  p_device_info jsonb DEFAULT '{}'::jsonb,
  p_note text DEFAULT NULL,
  p_event_time timestamptz DEFAULT now(),
  p_source text DEFAULT 'mobile'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_hotel_lat double precision;
  v_hotel_lon double precision;
  v_geo_radius integer := 250;
  v_distance integer;
  v_location_status text := 'missing';
  v_today date := (p_event_time AT TIME ZONE 'Europe/Istanbul')::date;
  v_last_event text;
BEGIN
  v_staff_id := public.get_my_staff_id();
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Personel kaydi bulunamadi';
  END IF;

  v_last_event := public.staff_attendance_last_work_event_today(v_staff_id, v_today);
  IF v_last_event IS DISTINCT FROM 'check_in' THEN
    RAISE EXCEPTION 'Acik mesai kaydi yok. Once giris yapin.';
  END IF;

  SELECT hi.latitude, hi.longitude, hi.attendance_geofence_radius_m
  INTO v_hotel_lat, v_hotel_lon, v_geo_radius
  FROM public.hotel_info hi
  ORDER BY hi.created_at ASC
  LIMIT 1;

  IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL AND v_hotel_lat IS NOT NULL AND v_hotel_lon IS NOT NULL THEN
    v_distance := public.haversine_distance_m(p_latitude, p_longitude, v_hotel_lat, v_hotel_lon);
    IF v_distance <= COALESCE(v_geo_radius, 250) THEN
      v_location_status := 'verified';
    ELSE
      v_location_status := 'outside_hotel_radius';
      RAISE EXCEPTION 'Konum dogrulanamadi';
    END IF;
  ELSIF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
    v_location_status := 'unavailable';
  END IF;

  INSERT INTO public.staff_attendance_events (
    staff_id,
    event_type,
    event_time,
    source,
    latitude,
    longitude,
    accuracy_m,
    distance_to_hotel_m,
    location_status,
    device_info,
    note,
    metadata,
    created_by_staff_id
  ) VALUES (
    v_staff_id,
    'check_out',
    p_event_time,
    COALESCE(NULLIF(trim(p_source), ''), 'mobile'),
    p_latitude,
    p_longitude,
    p_accuracy_m,
    v_distance,
    v_location_status,
    COALESCE(p_device_info, '{}'::jsonb),
    p_note,
    '{}'::jsonb,
    v_staff_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'staff_id', v_staff_id,
    'event_time', p_event_time,
    'location_status', v_location_status,
    'distance_to_hotel_m', v_distance
  );
END;
$$;

DROP VIEW IF EXISTS public.staff_attendance_daily_report;

CREATE VIEW public.staff_attendance_daily_report AS
WITH dates AS (
  SELECT generate_series(
    (now() AT TIME ZONE 'Europe/Istanbul')::date - interval '90 days',
    (now() AT TIME ZONE 'Europe/Istanbul')::date,
    interval '1 day'
  )::date AS work_date
),
staff_dates AS (
  SELECT s.id AS staff_id, s.full_name, s.role, s.shift_id, d.work_date
  FROM public.staff s
  CROSS JOIN dates d
  WHERE COALESCE(s.is_active, true) = true
),
day_events AS (
  SELECT
    e.staff_id,
    (e.event_time AT TIME ZONE 'Europe/Istanbul')::date AS work_date,
    e.event_type,
    e.event_time,
    row_number() OVER (
      PARTITION BY e.staff_id, (e.event_time AT TIME ZONE 'Europe/Istanbul')::date, e.event_type
      ORDER BY e.event_time
    ) AS type_seq
  FROM public.staff_attendance_events e
  WHERE e.event_type IN ('check_in', 'check_out')
),
session_pairs AS (
  SELECT
    ci.staff_id,
    ci.work_date,
    extract(epoch FROM (co.event_time - ci.event_time)) / 3600.0 AS session_hours
  FROM day_events ci
  INNER JOIN day_events co
    ON co.staff_id = ci.staff_id
   AND co.work_date = ci.work_date
   AND co.event_type = 'check_out'
   AND co.type_seq = ci.type_seq
  WHERE ci.event_type = 'check_in'
),
events AS (
  SELECT
    e.staff_id,
    (e.event_time AT TIME ZONE 'Europe/Istanbul')::date AS work_date,
    min(e.event_time) FILTER (WHERE e.event_type = 'check_in') AS check_in_at,
    max(e.event_time) FILTER (WHERE e.event_type = 'check_out') AS check_out_at,
    max(e.event_time) FILTER (WHERE e.event_type = 'check_in') AS last_check_in_at,
    count(*) FILTER (WHERE e.event_type = 'check_in') AS check_in_count,
    count(*) FILTER (WHERE e.event_type = 'check_out') AS check_out_count
  FROM public.staff_attendance_events e
  WHERE e.event_type IN ('check_in', 'check_out')
  GROUP BY e.staff_id, (e.event_time AT TIME ZONE 'Europe/Istanbul')::date
),
session_totals AS (
  SELECT staff_id, work_date, sum(session_hours) AS total_hours
  FROM session_pairs
  GROUP BY staff_id, work_date
)
SELECT
  sd.work_date,
  sd.staff_id,
  sd.full_name,
  sd.role,
  ev.check_in_at,
  ev.check_out_at,
  ev.last_check_in_at,
  ev.check_in_count,
  ev.check_out_count,
  st.total_hours,
  sh.start_time,
  sh.end_time,
  sh.grace_minutes,
  CASE
    WHEN ev.check_in_at IS NULL THEN NULL
    WHEN sh.start_time IS NULL THEN 0
    ELSE GREATEST(
      0,
      floor(
        extract(
          epoch FROM (
            ev.check_in_at
            - ((sd.work_date::text || ' ' || sh.start_time::text || '+03')::timestamptz + make_interval(mins => COALESCE(sh.grace_minutes, 5)))
          )
        ) / 60
      )::integer
    )
  END AS late_minutes,
  CASE
    WHEN ev.check_in_count IS NULL OR ev.check_in_count = 0 THEN 'devamsiz'
    WHEN ev.check_in_count > COALESCE(ev.check_out_count, 0) THEN 'eksik_kayit'
    WHEN sh.start_time IS NOT NULL
      AND ev.check_in_at > ((sd.work_date::text || ' ' || sh.start_time::text || '+03')::timestamptz + make_interval(mins => COALESCE(sh.grace_minutes, 5)))
      THEN 'gec_geldi'
    WHEN sh.end_time IS NOT NULL
      AND ev.check_out_at IS NOT NULL
      AND ev.check_out_at < ((sd.work_date::text || ' ' || sh.end_time::text || '+03')::timestamptz)
      THEN 'erken_cikti'
    ELSE 'zamaninda'
  END AS day_status
FROM staff_dates sd
LEFT JOIN events ev ON ev.staff_id = sd.staff_id AND ev.work_date = sd.work_date
LEFT JOIN session_totals st ON st.staff_id = sd.staff_id AND st.work_date = sd.work_date
LEFT JOIN public.shifts sh ON sh.id = sd.shift_id;

GRANT EXECUTE ON FUNCTION public.staff_attendance_last_work_event_today(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_attendance_check_in(double precision, double precision, double precision, jsonb, text, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_attendance_check_out(double precision, double precision, double precision, jsonb, text, timestamptz, text) TO authenticated;

COMMIT;
