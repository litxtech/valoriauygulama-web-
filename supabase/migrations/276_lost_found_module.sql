BEGIN;

-- Buluntu / emanet (unutulan eşya) — "Eksik Var" (stok eksikliği) modülünden bağımsız.

CREATE TABLE IF NOT EXISTS public.lost_found_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  reference_code text NOT NULL,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'other' CHECK (category IN (
    'electronics', 'clothing', 'jewelry', 'documents', 'accessories', 'other'
  )),
  value_tier text NOT NULL DEFAULT 'low' CHECK (value_tier IN ('low', 'medium', 'high')),
  found_location_type text NOT NULL DEFAULT 'room' CHECK (found_location_type IN (
    'room', 'lobby', 'restaurant', 'pool', 'spa', 'parking', 'other'
  )),
  found_location_detail text,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  guest_id uuid REFERENCES public.guests(id) ON DELETE SET NULL,
  found_at timestamptz NOT NULL DEFAULT now(),
  storage_location text,
  status text NOT NULL DEFAULT 'stored' CHECK (status IN ('stored', 'returned', 'disposed')),
  registered_by_staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  returned_at timestamptz,
  returned_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  returned_to_name text,
  returned_to_phone text,
  return_note text,
  disposed_at timestamptz,
  disposed_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  dispose_note text,
  retention_until date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lost_found_items_title_not_blank CHECK (length(trim(title)) > 0),
  CONSTRAINT lost_found_items_reference_not_blank CHECK (length(trim(reference_code)) > 0),
  CONSTRAINT lost_found_items_return_fields CHECK (
    (status = 'returned' AND returned_at IS NOT NULL AND returned_by_staff_id IS NOT NULL)
    OR status <> 'returned'
  ),
  CONSTRAINT lost_found_items_dispose_fields CHECK (
    (status = 'disposed' AND disposed_at IS NOT NULL AND disposed_by_staff_id IS NOT NULL)
    OR status <> 'disposed'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lost_found_items_org_reference
  ON public.lost_found_items (organization_id, reference_code);
CREATE INDEX IF NOT EXISTS idx_lost_found_items_org_status_found
  ON public.lost_found_items (organization_id, status, found_at DESC);
CREATE INDEX IF NOT EXISTS idx_lost_found_items_retention
  ON public.lost_found_items (organization_id, retention_until)
  WHERE status = 'stored';

CREATE TABLE IF NOT EXISTS public.lost_found_item_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.lost_found_items(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  public_url text NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lost_found_item_photos_item
  ON public.lost_found_item_photos (item_id, sort_order);

-- ---------- Referans kodu ----------
CREATE OR REPLACE FUNCTION public.lost_found_next_reference(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_seq integer;
  v_year text;
BEGIN
  v_year := to_char(now() AT TIME ZONE 'UTC', 'YYYY');
  SELECT count(*)::integer + 1
  INTO v_seq
  FROM public.lost_found_items lf
  WHERE lf.organization_id = p_org_id
    AND lf.created_at >= make_timestamptz(
      v_year::integer, 1, 1, 0, 0, 0, 'UTC'
    );
  RETURN 'LF-' || v_year || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

-- ---------- Triggers ----------
CREATE OR REPLACE FUNCTION public.lost_found_items_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lost_found_items_updated_at ON public.lost_found_items;
CREATE TRIGGER trg_lost_found_items_updated_at
  BEFORE UPDATE ON public.lost_found_items
  FOR EACH ROW EXECUTE FUNCTION public.lost_found_items_set_updated_at();

CREATE OR REPLACE FUNCTION public.lost_found_items_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.reference_code IS NULL OR trim(NEW.reference_code) = '' THEN
    NEW.reference_code := public.lost_found_next_reference(NEW.organization_id);
  END IF;
  IF NEW.retention_until IS NULL THEN
    NEW.retention_until := (NEW.found_at AT TIME ZONE 'UTC')::date + 30;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lost_found_items_before_insert ON public.lost_found_items;
CREATE TRIGGER trg_lost_found_items_before_insert
  BEFORE INSERT ON public.lost_found_items
  FOR EACH ROW EXECUTE FUNCTION public.lost_found_items_before_insert();

CREATE OR REPLACE FUNCTION public.lost_found_items_set_status_meta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_staff_id := public.current_staff_id();

  IF NEW.status = 'returned' THEN
    NEW.returned_at := COALESCE(NEW.returned_at, now());
    NEW.returned_by_staff_id := COALESCE(NEW.returned_by_staff_id, v_staff_id);
    NEW.disposed_at := NULL;
    NEW.disposed_by_staff_id := NULL;
    NEW.dispose_note := NULL;
  ELSIF NEW.status = 'disposed' THEN
    NEW.disposed_at := COALESCE(NEW.disposed_at, now());
    NEW.disposed_by_staff_id := COALESCE(NEW.disposed_by_staff_id, v_staff_id);
  ELSIF NEW.status = 'stored' THEN
    NEW.returned_at := NULL;
    NEW.returned_by_staff_id := NULL;
    NEW.returned_to_name := NULL;
    NEW.returned_to_phone := NULL;
    NEW.return_note := NULL;
    NEW.disposed_at := NULL;
    NEW.disposed_by_staff_id := NULL;
    NEW.dispose_note := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lost_found_items_status_meta ON public.lost_found_items;
CREATE TRIGGER trg_lost_found_items_status_meta
  BEFORE UPDATE OF status ON public.lost_found_items
  FOR EACH ROW EXECUTE FUNCTION public.lost_found_items_set_status_meta();

-- ---------- Bildirim ----------
CREATE OR REPLACE FUNCTION public.lost_found_items_notify_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_ids uuid[];
  v_title text;
  v_body text;
  v_payload jsonb;
BEGIN
  SELECT array_agg(s.id)
  INTO v_staff_ids
  FROM public.staff s
  WHERE s.organization_id = NEW.organization_id
    AND s.is_active = true
    AND s.deleted_at IS NULL;

  IF v_staff_ids IS NULL OR array_length(v_staff_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  v_title := 'Emanet — Yeni kayıt: ' || NEW.reference_code;
  v_body := COALESCE(NULLIF(trim(NEW.title), ''), 'Buluntu eşya kaydı oluşturuldu.');
  v_payload := jsonb_build_object(
    'kind', 'lost_found_opened',
    'lostFoundItemId', NEW.id::text,
    'referenceCode', NEW.reference_code,
    'url', '/staff/lost-found/' || NEW.id::text
  );

  INSERT INTO public.notifications (
    staff_id, guest_id, title, body, category, notification_type, data, created_by, sent_via, sent_at
  )
  SELECT sid, NULL, v_title, v_body, 'staff', 'lost_found_opened', v_payload, NEW.registered_by_staff_id, 'both', now()
  FROM unnest(v_staff_ids) sid;

  PERFORM net.http_post(
    url := 'https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/send-expo-push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'staffIds', to_jsonb(v_staff_ids),
      'title', v_title,
      'body', v_body,
      'data', v_payload
    ),
    timeout_milliseconds := 10000
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lost_found_items_notify_insert ON public.lost_found_items;
CREATE TRIGGER trg_lost_found_items_notify_insert
  AFTER INSERT ON public.lost_found_items
  FOR EACH ROW EXECUTE FUNCTION public.lost_found_items_notify_insert();

-- ---------- RLS ----------
ALTER TABLE public.lost_found_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lost_found_item_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lost_found_items_select_staff_org ON public.lost_found_items;
CREATE POLICY lost_found_items_select_staff_org ON public.lost_found_items
  FOR SELECT TO authenticated
  USING (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS lost_found_items_insert_staff_org ON public.lost_found_items;
CREATE POLICY lost_found_items_insert_staff_org ON public.lost_found_items
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND registered_by_staff_id = public.current_staff_id()
  );

DROP POLICY IF EXISTS lost_found_items_update_staff_org ON public.lost_found_items;
CREATE POLICY lost_found_items_update_staff_org ON public.lost_found_items
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_staff_organization_id())
  WITH CHECK (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS lost_found_item_photos_all ON public.lost_found_item_photos;
CREATE POLICY lost_found_item_photos_all ON public.lost_found_item_photos
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lost_found_items lf
      WHERE lf.id = item_id
        AND lf.organization_id = public.current_staff_organization_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lost_found_items lf
      WHERE lf.id = item_id
        AND lf.organization_id = public.current_staff_organization_id()
    )
  );

-- ---------- Storage ----------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lost-found-media',
  'lost-found-media',
  true,
  15728640,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS lost_found_media_insert ON storage.objects;
CREATE POLICY lost_found_media_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lost-found-media');

DROP POLICY IF EXISTS lost_found_media_select ON storage.objects;
CREATE POLICY lost_found_media_select ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'lost-found-media');

COMMIT;
