-- Online rezervasyon: kapasite etiketi (2+1 / 3 kişilik), trafik, misafir bağlama, PDF

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS capacity_label TEXT,
  ADD COLUMN IF NOT EXISTS display_title TEXT,
  ADD COLUMN IF NOT EXISTS max_guests INTEGER;

COMMENT ON COLUMN public.rooms.capacity_label IS 'Misafire gösterilen kapasite: 2+1, 3 kişilik, 1+1 vb. Oda numarası gösterilmez.';
COMMENT ON COLUMN public.rooms.display_title IS 'Opsiyonel vitrin başlığı (ör. Göl Suite)';
COMMENT ON COLUMN public.rooms.max_guests IS 'Maksimum kişi (yetişkin+çocuk)';

UPDATE public.rooms
SET capacity_label = COALESCE(NULLIF(btrim(capacity_label), ''), bed_type, 'Standart')
WHERE capacity_label IS NULL OR btrim(capacity_label) = '';

ALTER TABLE public.online_bookings
  ADD COLUMN IF NOT EXISTS guest_id UUID REFERENCES public.guests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS capacity_label TEXT,
  ADD COLUMN IF NOT EXISTS display_title TEXT,
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS pdf_path TEXT,
  ADD COLUMN IF NOT EXISTS session_claimed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_online_bookings_guest
  ON public.online_bookings(guest_id, created_at DESC);

INSERT INTO storage.buckets (id, name, public)
VALUES ('room-booking-media', 'room-booking-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/quicktime', 'video/webm',
  'application/pdf'
]
WHERE id = 'room-booking-media';

-- Trafik / kanal ölçümü
CREATE TABLE IF NOT EXISTS public.booking_channel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'page_view', 'room_view', 'form_start', 'form_submit', 'login_auto', 'pdf_ready'
    )
  ),
  source TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'app', 'lobby')),
  session_key TEXT,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.online_bookings(id) ON DELETE SET NULL,
  capacity_label TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_channel_events_created
  ON public.booking_channel_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_channel_events_type
  ON public.booking_channel_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_channel_events_source
  ON public.booking_channel_events(source, created_at DESC);

ALTER TABLE public.booking_channel_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_channel_events_staff_select ON public.booking_channel_events;
CREATE POLICY booking_channel_events_staff_select ON public.booking_channel_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.is_active = true
        AND s.role IN ('admin', 'manager', 'reception')
    )
  );

CREATE OR REPLACE FUNCTION public.track_booking_channel_event(
  p_event_type TEXT,
  p_source TEXT DEFAULT 'web',
  p_session_key TEXT DEFAULT NULL,
  p_room_id UUID DEFAULT NULL,
  p_booking_id UUID DEFAULT NULL,
  p_capacity_label TEXT DEFAULT NULL,
  p_org_slug TEXT DEFAULT 'valoria',
  p_meta JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
  v_id UUID;
  v_src TEXT;
  v_type TEXT;
BEGIN
  v_type := lower(trim(coalesce(p_event_type, '')));
  IF v_type NOT IN ('page_view', 'room_view', 'form_start', 'form_submit', 'login_auto', 'pdf_ready') THEN
    RAISE EXCEPTION 'invalid_event';
  END IF;
  v_src := CASE WHEN p_source IN ('web', 'app', 'lobby') THEN p_source ELSE 'web' END;

  SELECT o.id INTO v_org
  FROM public.organizations o
  WHERE o.slug = lower(trim(coalesce(p_org_slug, 'valoria')))
  LIMIT 1;

  INSERT INTO public.booking_channel_events (
    organization_id, event_type, source, session_key, room_id, booking_id, capacity_label, meta
  ) VALUES (
    v_org, v_type, v_src, nullif(trim(coalesce(p_session_key, '')), ''),
    p_room_id, p_booking_id, nullif(trim(coalesce(p_capacity_label, '')), ''),
    coalesce(p_meta, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_booking_channel_event(
  TEXT, TEXT, TEXT, UUID, UUID, TEXT, TEXT, JSONB
) TO anon, authenticated;

-- Public catalog: oda numarası dönülür ama istemci göstermez; kapasite etiketi asıl başlık
DROP FUNCTION IF EXISTS public.list_bookable_rooms(TEXT);
CREATE FUNCTION public.list_bookable_rooms(p_org_slug TEXT DEFAULT 'valoria')
RETURNS TABLE (
  id UUID,
  capacity_label TEXT,
  display_title TEXT,
  max_guests INTEGER,
  floor INTEGER,
  view_type TEXT,
  area_sqm NUMERIC,
  bed_type TEXT,
  price_per_night NUMERIC,
  status TEXT,
  description TEXT,
  video_url TEXT,
  amenities JSONB,
  cover_image_url TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    COALESCE(NULLIF(btrim(r.capacity_label), ''), 'Standart') AS capacity_label,
    r.display_title,
    r.max_guests,
    r.floor,
    r.view_type,
    r.area_sqm,
    r.bed_type,
    r.price_per_night,
    r.status,
    r.description,
    r.video_url,
    r.amenities,
    (
      SELECT ri.url
      FROM public.room_images ri
      WHERE ri.room_id = r.id
        AND coalesce(ri.media_kind, 'image') = 'image'
      ORDER BY ri.sort_order ASC NULLS LAST, ri.created_at ASC
      LIMIT 1
    ) AS cover_image_url
  FROM public.rooms r
  LEFT JOIN public.organizations o ON o.id = r.organization_id
  WHERE coalesce(r.bookable, true) = true
    AND r.status IN ('available', 'cleaning')
    AND (
      o.slug IS NOT DISTINCT FROM lower(trim(p_org_slug))
      OR r.organization_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM public.organizations ox WHERE ox.slug = lower(trim(p_org_slug)))
    )
  ORDER BY COALESCE(r.max_guests, 99), r.capacity_label, r.room_number;
$$;

GRANT EXECUTE ON FUNCTION public.list_bookable_rooms(TEXT) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.get_bookable_room(UUID);
CREATE FUNCTION public.get_bookable_room(p_room_id UUID)
RETURNS TABLE (
  id UUID,
  capacity_label TEXT,
  display_title TEXT,
  max_guests INTEGER,
  floor INTEGER,
  view_type TEXT,
  area_sqm NUMERIC,
  bed_type TEXT,
  price_per_night NUMERIC,
  status TEXT,
  description TEXT,
  video_url TEXT,
  amenities JSONB,
  image_urls TEXT[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    COALESCE(NULLIF(btrim(r.capacity_label), ''), 'Standart') AS capacity_label,
    r.display_title,
    r.max_guests,
    r.floor,
    r.view_type,
    r.area_sqm,
    r.bed_type,
    r.price_per_night,
    r.status,
    r.description,
    r.video_url,
    r.amenities,
    coalesce(
      (
        SELECT array_agg(ri.url ORDER BY ri.sort_order ASC NULLS LAST, ri.created_at ASC)
        FROM public.room_images ri
        WHERE ri.room_id = r.id AND coalesce(ri.media_kind, 'image') = 'image'
      ),
      '{}'::text[]
    ) AS image_urls
  FROM public.rooms r
  WHERE r.id = p_room_id
    AND coalesce(r.bookable, true) = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_bookable_room(UUID) TO anon, authenticated;

-- create_online_booking: kapasite etiketini kaydet
CREATE OR REPLACE FUNCTION public.create_online_booking(
  p_org_slug TEXT,
  p_room_id UUID,
  p_check_in DATE,
  p_check_out DATE,
  p_adults INTEGER,
  p_children INTEGER,
  p_guest_full_name TEXT,
  p_guest_phone TEXT,
  p_guest_email TEXT DEFAULT NULL,
  p_guest_note TEXT DEFAULT NULL,
  p_extras JSONB DEFAULT '[]'::jsonb,
  p_source TEXT DEFAULT 'web'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_room public.rooms%ROWTYPE;
  v_nights INTEGER;
  v_id UUID;
  v_source TEXT;
  v_label TEXT;
BEGIN
  IF p_check_in IS NULL OR p_check_out IS NULL OR p_check_out <= p_check_in THEN
    RAISE EXCEPTION 'invalid_dates';
  END IF;
  IF coalesce(p_adults, 0) < 1 THEN
    RAISE EXCEPTION 'invalid_adults';
  END IF;
  IF length(trim(coalesce(p_guest_full_name, ''))) < 2 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;
  IF length(trim(coalesce(p_guest_phone, ''))) < 7 THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;

  v_source := CASE WHEN p_source IN ('web', 'app', 'lobby') THEN p_source ELSE 'web' END;

  SELECT o.id INTO v_org_id
  FROM public.organizations o
  WHERE o.slug = lower(trim(coalesce(p_org_slug, 'valoria')))
  LIMIT 1;

  IF v_org_id IS NULL THEN
    SELECT o.id INTO v_org_id FROM public.organizations o ORDER BY o.created_at ASC LIMIT 1;
  END IF;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'org_not_found';
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'room_not_found';
  END IF;

  v_nights := GREATEST(1, (p_check_out - p_check_in));
  v_label := COALESCE(NULLIF(btrim(v_room.capacity_label), ''), NULLIF(btrim(v_room.display_title), ''), 'Standart');

  INSERT INTO public.online_bookings (
    organization_id, room_id, room_number, room_label, capacity_label, display_title,
    check_in_date, check_out_date, nights_count, adults, children,
    guest_full_name, guest_phone, guest_email, guest_note, extras,
    quoted_price_per_night, quoted_total, source
  ) VALUES (
    v_org_id, v_room.id, v_room.room_number, v_label, v_label, v_room.display_title,
    p_check_in, p_check_out, v_nights,
    least(greatest(coalesce(p_adults, 1), 1), 12),
    least(greatest(coalesce(p_children, 0), 0), 12),
    trim(p_guest_full_name), trim(p_guest_phone),
    nullif(trim(coalesce(p_guest_email, '')), ''),
    nullif(trim(coalesce(p_guest_note, '')), ''),
    coalesce(p_extras, '[]'::jsonb),
    v_room.price_per_night,
    CASE WHEN v_room.price_per_night IS NULL THEN NULL ELSE v_room.price_per_night * v_nights END,
    v_source
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_online_booking(
  TEXT, UUID, DATE, DATE, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT
) TO anon, authenticated;

-- Rezervasyon sonrası oturumdaki misafire bağla + profil bilgilerini yaz
CREATE OR REPLACE FUNCTION public.claim_online_booking_for_caller(
  p_booking_id UUID,
  p_pdf_url TEXT DEFAULT NULL,
  p_pdf_path TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_guest_id UUID;
  v_booking public.online_bookings%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_booking FROM public.online_bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;

  -- Personel hesabına bağlama
  IF EXISTS (SELECT 1 FROM public.staff s WHERE s.auth_id = v_uid AND s.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'staff_cannot_claim';
  END IF;

  SELECT g.id INTO v_guest_id
  FROM public.guests g
  WHERE g.auth_user_id = v_uid
  LIMIT 1;

  IF v_guest_id IS NULL THEN
    RAISE EXCEPTION 'guest_not_found';
  END IF;

  UPDATE public.guests
  SET
    full_name = COALESCE(NULLIF(btrim(full_name), ''), v_booking.guest_full_name),
    phone = COALESCE(NULLIF(btrim(phone), ''), v_booking.guest_phone),
    email = COALESCE(NULLIF(btrim(email), ''), v_booking.guest_email),
    updated_at = now()
  WHERE id = v_guest_id;

  UPDATE public.online_bookings
  SET
    guest_id = v_guest_id,
    session_claimed_at = now(),
    pdf_url = COALESCE(NULLIF(btrim(coalesce(p_pdf_url, '')), ''), pdf_url),
    pdf_path = COALESCE(NULLIF(btrim(coalesce(p_pdf_path, '')), ''), pdf_path),
    updated_at = now()
  WHERE id = p_booking_id;

  RETURN v_guest_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_online_booking_for_caller(UUID, TEXT, TEXT) TO authenticated;

-- Misafir kendi rezervasyonlarını görsün
DROP POLICY IF EXISTS online_bookings_guest_select ON public.online_bookings;
CREATE POLICY online_bookings_guest_select ON public.online_bookings
  FOR SELECT TO authenticated
  USING (
    guest_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.guests g
      WHERE g.id = online_bookings.guest_id
        AND g.auth_user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.booking_channel_traffic_summary(p_hours INTEGER DEFAULT 24)
RETURNS TABLE (
  source TEXT,
  event_type TEXT,
  event_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.source, e.event_type, count(*)::bigint
  FROM public.booking_channel_events e
  WHERE e.created_at >= now() - make_interval(hours => greatest(1, least(coalesce(p_hours, 24), 720)))
  GROUP BY e.source, e.event_type
  ORDER BY e.source, e.event_type;
$$;

GRANT EXECUTE ON FUNCTION public.booking_channel_traffic_summary(INTEGER) TO authenticated;
