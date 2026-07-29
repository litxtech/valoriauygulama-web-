-- Online rezervasyon vitrini: oda açıklama, video, bookable + medya bucket

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS bookable BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS amenities JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.rooms.description IS 'Online rezervasyon sayfasında gösterilen oda açıklaması';
COMMENT ON COLUMN public.rooms.video_url IS 'Oda tanıtım videosu (public URL)';
COMMENT ON COLUMN public.rooms.bookable IS 'false ise online rezervasyon listesinde gizlenir';
COMMENT ON COLUMN public.rooms.amenities IS 'Örn. ["wifi","klima","balkon","minibar"]';

ALTER TABLE public.room_images
  ADD COLUMN IF NOT EXISTS media_kind TEXT NOT NULL DEFAULT 'image'
    CHECK (media_kind IN ('image', 'video'));

-- Public room catalog (görsel + video dahil)
DROP FUNCTION IF EXISTS public.list_bookable_rooms(TEXT);
CREATE OR REPLACE FUNCTION public.list_bookable_rooms(p_org_slug TEXT DEFAULT 'valoria')
RETURNS TABLE (
  id UUID,
  room_number TEXT,
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
    r.room_number,
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
        AND ri.media_kind = 'image'
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
  ORDER BY r.room_number;
$$;

GRANT EXECUTE ON FUNCTION public.list_bookable_rooms(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_bookable_room(p_room_id UUID)
RETURNS TABLE (
  id UUID,
  room_number TEXT,
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
    r.room_number,
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
        WHERE ri.room_id = r.id AND ri.media_kind = 'image'
      ),
      '{}'::text[]
    ) AS image_urls
  FROM public.rooms r
  WHERE r.id = p_room_id
    AND coalesce(r.bookable, true) = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_bookable_room(UUID) TO anon, authenticated;

-- Storage bucket for room showcase media
INSERT INTO storage.buckets (id, name, public)
VALUES ('room-booking-media', 'room-booking-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS room_booking_media_public_read ON storage.objects;
CREATE POLICY room_booking_media_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'room-booking-media');

DROP POLICY IF EXISTS room_booking_media_staff_write ON storage.objects;
CREATE POLICY room_booking_media_staff_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'room-booking-media'
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.is_active = true
        AND s.role IN ('admin', 'manager', 'reception')
    )
  );

DROP POLICY IF EXISTS room_booking_media_staff_update ON storage.objects;
CREATE POLICY room_booking_media_staff_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'room-booking-media'
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.is_active = true
        AND s.role IN ('admin', 'manager', 'reception')
    )
  );

DROP POLICY IF EXISTS room_booking_media_staff_delete ON storage.objects;
CREATE POLICY room_booking_media_staff_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'room-booking-media'
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.is_active = true
        AND s.role IN ('admin', 'manager', 'reception')
    )
  );
