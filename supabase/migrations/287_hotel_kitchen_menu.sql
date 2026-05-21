-- Otel mutfağı menüsü: kendi yemeklerimiz (oda servisi / dış mekan rehberinden ayrı)

BEGIN;

CREATE TABLE IF NOT EXISTS public.hotel_kitchen_menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_title text NOT NULL,
  name text NOT NULL,
  description text,
  price numeric(10, 2) NOT NULL CHECK (price >= 0),
  served_in_hotel_restaurant boolean NOT NULL DEFAULT true,
  is_available boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hotel_kitchen_menu_items_org
  ON public.hotel_kitchen_menu_items (organization_id, is_available, sort_order DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hotel_kitchen_menu_items_org_category
  ON public.hotel_kitchen_menu_items (organization_id, lower(category_title));

CREATE TABLE IF NOT EXISTS public.hotel_kitchen_menu_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.hotel_kitchen_menu_items(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hotel_kitchen_menu_images_item
  ON public.hotel_kitchen_menu_images (item_id, sort_order);

CREATE TABLE IF NOT EXISTS public.hotel_kitchen_menu_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.hotel_kitchen_menu_items(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_kitchen_menu_favorites_unique UNIQUE (guest_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_hotel_kitchen_menu_favorites_guest
  ON public.hotel_kitchen_menu_favorites (guest_id);

CREATE OR REPLACE FUNCTION public.hotel_kitchen_menu_items_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hotel_kitchen_menu_items_updated ON public.hotel_kitchen_menu_items;
CREATE TRIGGER trg_hotel_kitchen_menu_items_updated
  BEFORE UPDATE ON public.hotel_kitchen_menu_items
  FOR EACH ROW EXECUTE FUNCTION public.hotel_kitchen_menu_items_set_updated_at();

CREATE OR REPLACE FUNCTION public.hotel_kitchen_menu_images_max_five()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.hotel_kitchen_menu_images
  WHERE item_id = NEW.item_id;
  IF v_count >= 5 THEN
    RAISE EXCEPTION 'En fazla 5 görsel eklenebilir';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hotel_kitchen_menu_images_max ON public.hotel_kitchen_menu_images;
CREATE TRIGGER trg_hotel_kitchen_menu_images_max
  BEFORE INSERT ON public.hotel_kitchen_menu_images
  FOR EACH ROW EXECUTE FUNCTION public.hotel_kitchen_menu_images_max_five();

CREATE OR REPLACE FUNCTION public.staff_has_hotel_kitchen_menu_permission()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT
        s.role = 'admin'
        OR (s.app_permissions->>'otel_mutfak_menu') IN ('true', 't', '1', 'True', 'TRUE')
      FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.is_active = true
        AND s.deleted_at IS NULL
      LIMIT 1
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.staff_has_hotel_kitchen_menu_permission() IS
  'Otel mutfağı menüsü yönetimi: admin veya app_permissions.otel_mutfak_menu';

ALTER TABLE public.hotel_kitchen_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_kitchen_menu_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_kitchen_menu_favorites ENABLE ROW LEVEL SECURITY;

-- Misafir: kendi otelindeki yayınlanan ürünler
DROP POLICY IF EXISTS hotel_kitchen_menu_items_select_guest ON public.hotel_kitchen_menu_items;
CREATE POLICY hotel_kitchen_menu_items_select_guest ON public.hotel_kitchen_menu_items
  FOR SELECT TO authenticated
  USING (
    is_available = true
    AND organization_id = public.current_guest_organization_id()
  );

-- Personel: aynı organizasyondaki tüm ürünler (yönetim ekranı pasifleri de görür)
DROP POLICY IF EXISTS hotel_kitchen_menu_items_select_staff ON public.hotel_kitchen_menu_items;
CREATE POLICY hotel_kitchen_menu_items_select_staff ON public.hotel_kitchen_menu_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.is_active = true
        AND s.deleted_at IS NULL
        AND s.organization_id = hotel_kitchen_menu_items.organization_id
    )
  );

DROP POLICY IF EXISTS hotel_kitchen_menu_items_write_staff ON public.hotel_kitchen_menu_items;
CREATE POLICY hotel_kitchen_menu_items_write_staff ON public.hotel_kitchen_menu_items
  FOR ALL TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND (
      public.current_user_is_staff_admin()
      OR public.staff_has_hotel_kitchen_menu_permission()
    )
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND (
      public.current_user_is_staff_admin()
      OR public.staff_has_hotel_kitchen_menu_permission()
    )
  );

DROP POLICY IF EXISTS hotel_kitchen_menu_images_select ON public.hotel_kitchen_menu_images;
CREATE POLICY hotel_kitchen_menu_images_select ON public.hotel_kitchen_menu_images
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hotel_kitchen_menu_items i
      WHERE i.id = hotel_kitchen_menu_images.item_id
        AND (
          (i.is_available = true AND i.organization_id = public.current_guest_organization_id())
          OR EXISTS (
            SELECT 1 FROM public.staff s
            WHERE s.auth_id = auth.uid()
              AND s.is_active = true
              AND s.deleted_at IS NULL
              AND s.organization_id = i.organization_id
          )
        )
    )
  );

DROP POLICY IF EXISTS hotel_kitchen_menu_images_write_staff ON public.hotel_kitchen_menu_images;
CREATE POLICY hotel_kitchen_menu_images_write_staff ON public.hotel_kitchen_menu_images
  FOR ALL TO authenticated
  USING (
    (
      public.staff_has_hotel_kitchen_menu_permission()
      OR public.current_user_is_staff_admin()
    )
    AND EXISTS (
      SELECT 1 FROM public.hotel_kitchen_menu_items i
      WHERE i.id = hotel_kitchen_menu_images.item_id
        AND i.organization_id = public.current_staff_organization_id()
    )
  )
  WITH CHECK (
    (
      public.staff_has_hotel_kitchen_menu_permission()
      OR public.current_user_is_staff_admin()
    )
    AND EXISTS (
      SELECT 1 FROM public.hotel_kitchen_menu_items i
      WHERE i.id = hotel_kitchen_menu_images.item_id
        AND i.organization_id = public.current_staff_organization_id()
    )
  );

DROP POLICY IF EXISTS hotel_kitchen_menu_favorites_select_guest ON public.hotel_kitchen_menu_favorites;
CREATE POLICY hotel_kitchen_menu_favorites_select_guest ON public.hotel_kitchen_menu_favorites
  FOR SELECT TO authenticated
  USING (
    guest_id IN (
      SELECT g.id FROM public.guests g WHERE g.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS hotel_kitchen_menu_favorites_select_staff ON public.hotel_kitchen_menu_favorites;
CREATE POLICY hotel_kitchen_menu_favorites_select_staff ON public.hotel_kitchen_menu_favorites
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.hotel_kitchen_menu_items i
      JOIN public.staff s ON s.organization_id = i.organization_id
      WHERE i.id = hotel_kitchen_menu_favorites.item_id
        AND s.auth_id = auth.uid()
        AND s.is_active = true
        AND s.deleted_at IS NULL
        AND (
          public.current_user_is_staff_admin()
          OR public.staff_has_hotel_kitchen_menu_permission()
        )
    )
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('hotel-kitchen-menu', 'hotel-kitchen-menu', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS hotel_kitchen_menu_storage_insert ON storage.objects;
CREATE POLICY hotel_kitchen_menu_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'hotel-kitchen-menu'
    AND (
      public.staff_has_hotel_kitchen_menu_permission()
      OR public.current_user_is_staff_admin()
    )
  );

DROP POLICY IF EXISTS hotel_kitchen_menu_storage_update ON storage.objects;
CREATE POLICY hotel_kitchen_menu_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'hotel-kitchen-menu'
    AND (
      public.staff_has_hotel_kitchen_menu_permission()
      OR public.current_user_is_staff_admin()
    )
  );

DROP POLICY IF EXISTS hotel_kitchen_menu_storage_delete ON storage.objects;
CREATE POLICY hotel_kitchen_menu_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'hotel-kitchen-menu'
    AND (
      public.staff_has_hotel_kitchen_menu_permission()
      OR public.current_user_is_staff_admin()
    )
  );

-- Favori eklendiğinde mutfak yetkililerine bildirim
CREATE OR REPLACE FUNCTION public.hotel_kitchen_menu_favorite_notify_kitchen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item record;
  v_guest_name text;
  v_staff_ids uuid[];
  v_title text;
  v_body text;
  v_payload jsonb;
BEGIN
  SELECT i.organization_id, i.name, i.category_title
  INTO v_item
  FROM public.hotel_kitchen_menu_items i
  WHERE i.id = NEW.item_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT g.full_name INTO v_guest_name
  FROM public.guests g
  WHERE g.id = NEW.guest_id;

  SELECT array_agg(s.id)
  INTO v_staff_ids
  FROM public.staff s
  WHERE s.organization_id = v_item.organization_id
    AND s.is_active = true
    AND s.deleted_at IS NULL
    AND (
      s.role = 'admin'
      OR (s.app_permissions->>'otel_mutfak_menu') IN ('true', 't', '1', 'True', 'TRUE')
    );

  IF v_staff_ids IS NULL OR array_length(v_staff_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  v_title := 'Otel menüsü — Favori: ' || v_item.name;
  v_body := COALESCE(NULLIF(trim(v_guest_name), ''), 'Misafir')
    || ' 「' || v_item.name || '」 ürününü favorilere ekledi.';
  v_payload := jsonb_build_object(
    'kind', 'hotel_kitchen_menu_favorite',
    'itemId', NEW.item_id::text,
    'guestId', NEW.guest_id::text,
    'url', '/staff/hotel-menu'
  );

  INSERT INTO public.notifications (
    staff_id, guest_id, title, body, category, notification_type, data, sent_via, sent_at
  )
  SELECT sid, NULL, v_title, v_body, 'guest', 'hotel_kitchen_menu_favorite', v_payload, 'both', now()
  FROM unnest(v_staff_ids) sid;

  BEGIN
    PERFORM net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-expo-push',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'staffIds', to_jsonb(v_staff_ids),
        'title', v_title,
        'body', v_body,
        'data', v_payload
      ),
      timeout_milliseconds := 10000
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hotel_kitchen_menu_favorite_notify ON public.hotel_kitchen_menu_favorites;
CREATE TRIGGER trg_hotel_kitchen_menu_favorite_notify
  AFTER INSERT ON public.hotel_kitchen_menu_favorites
  FOR EACH ROW EXECUTE FUNCTION public.hotel_kitchen_menu_favorite_notify_kitchen();

-- Misafir favori aç/kapa
CREATE OR REPLACE FUNCTION public.toggle_hotel_kitchen_menu_favorite(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id uuid;
  v_org uuid;
  v_item_org uuid;
  v_existing uuid;
BEGIN
  SELECT g.id, g.organization_id INTO v_guest_id, v_org
  FROM public.guests g
  WHERE g.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_guest_id IS NULL THEN
    RAISE EXCEPTION 'Misafir kaydı bulunamadı';
  END IF;

  SELECT i.organization_id INTO v_item_org
  FROM public.hotel_kitchen_menu_items i
  WHERE i.id = p_item_id AND i.is_available = true;

  IF v_item_org IS NULL OR v_item_org IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'Ürün bulunamadı';
  END IF;

  SELECT f.id INTO v_existing
  FROM public.hotel_kitchen_menu_favorites f
  WHERE f.guest_id = v_guest_id AND f.item_id = p_item_id;

  IF v_existing IS NOT NULL THEN
    DELETE FROM public.hotel_kitchen_menu_favorites WHERE id = v_existing;
    RETURN jsonb_build_object('favorited', false);
  END IF;

  INSERT INTO public.hotel_kitchen_menu_favorites (guest_id, item_id)
  VALUES (v_guest_id, p_item_id);

  RETURN jsonb_build_object('favorited', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_hotel_kitchen_menu_favorite(uuid) TO authenticated;

COMMENT ON TABLE public.hotel_kitchen_menu_items IS
  'Otel mutfağı menüsü — kendi yemek/içecek kartları (oda servisi ve dış mekan rehberinden bağımsız).';

COMMIT;
