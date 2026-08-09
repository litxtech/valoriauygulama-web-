-- Hotel-level showcase gallery for online booking ("Oteli gezelim")
-- Org-scoped images/videos (up to 100 active), separate from per-room media.

CREATE TABLE IF NOT EXISTS public.booking_hotel_showcase (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  media_kind TEXT NOT NULL CHECK (media_kind IN ('image', 'video')),
  media_url TEXT NOT NULL,
  thumbnail_url TEXT,
  title TEXT,
  category TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_hotel_showcase_org_active
  ON public.booking_hotel_showcase (organization_id, is_active, sort_order);

ALTER TABLE public.booking_hotel_showcase ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_hotel_showcase_staff_all ON public.booking_hotel_showcase;
CREATE POLICY booking_hotel_showcase_staff_all ON public.booking_hotel_showcase
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.is_active = true
        AND s.role IN ('admin', 'manager', 'reception')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.is_active = true
        AND s.role IN ('admin', 'manager', 'reception')
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_booking_hotel_showcase_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  active_count INT;
BEGIN
  IF NEW.is_active IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;
  SELECT COUNT(*)::INT INTO active_count
  FROM public.booking_hotel_showcase
  WHERE organization_id = NEW.organization_id
    AND is_active = true
    AND (TG_OP = 'INSERT' OR id IS DISTINCT FROM NEW.id);
  IF active_count >= 100 THEN
    RAISE EXCEPTION 'Otel galerisinde en fazla 100 aktif medya olabilir';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_hotel_showcase_limit ON public.booking_hotel_showcase;
CREATE TRIGGER trg_booking_hotel_showcase_limit
  BEFORE INSERT OR UPDATE OF is_active, organization_id
  ON public.booking_hotel_showcase
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_booking_hotel_showcase_limit();

CREATE OR REPLACE FUNCTION public.list_booking_hotel_showcase(
  p_org_slug TEXT DEFAULT 'valoria'
)
RETURNS TABLE (
  id UUID,
  media_kind TEXT,
  media_url TEXT,
  thumbnail_url TEXT,
  title TEXT,
  category TEXT,
  sort_order INT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.media_kind,
    s.media_url,
    s.thumbnail_url,
    s.title,
    s.category,
    s.sort_order
  FROM public.booking_hotel_showcase s
  JOIN public.organizations o ON o.id = s.organization_id
  WHERE o.slug = lower(trim(coalesce(p_org_slug, 'valoria')))
    AND s.is_active = true
  ORDER BY s.sort_order ASC, s.created_at ASC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.list_booking_hotel_showcase(TEXT) TO anon, authenticated;

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
  IF v_type NOT IN (
    'page_view', 'room_view', 'form_start', 'form_submit',
    'login_auto', 'pdf_ready', 'hotel_showcase_open'
  ) THEN
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'booking_hotel_showcase'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_hotel_showcase;
  END IF;
END $$;
