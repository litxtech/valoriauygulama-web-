-- Menü hızlı filtre etiketleri + resimli/videolu ürün yorumları

BEGIN;

ALTER TABLE public.hotel_kitchen_menu_items
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS review_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_avg numeric(3, 2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS hotel_kitchen_menu_items_tags_gin
  ON public.hotel_kitchen_menu_items USING gin (tags);

COMMENT ON COLUMN public.hotel_kitchen_menu_items.tags IS
  'Hızlı filtre: meat, vegetarian, seafood, vegan, dessert, breakfast, drink';

CREATE TABLE IF NOT EXISTS public.kitchen_menu_item_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.hotel_kitchen_menu_items(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  display_name text,
  media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'hidden')),
  client_ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kitchen_menu_item_reviews_body_chk CHECK (
    (comment IS NOT NULL AND char_length(btrim(comment)) >= 1)
    OR jsonb_array_length(media_urls) > 0
  )
);

CREATE INDEX IF NOT EXISTS kitchen_menu_item_reviews_item_idx
  ON public.kitchen_menu_item_reviews (menu_item_id, created_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS kitchen_menu_item_reviews_org_idx
  ON public.kitchen_menu_item_reviews (organization_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.sync_kitchen_menu_item_review_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t_item_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    t_item_id := OLD.menu_item_id;
  ELSE
    t_item_id := NEW.menu_item_id;
  END IF;

  UPDATE public.hotel_kitchen_menu_items i
  SET
    review_count = COALESCE((
      SELECT COUNT(*)::integer
      FROM public.kitchen_menu_item_reviews r
      WHERE r.menu_item_id = t_item_id AND r.status = 'published'
    ), 0),
    rating_avg = COALESCE((
      SELECT ROUND(AVG(r.rating)::numeric, 2)
      FROM public.kitchen_menu_item_reviews r
      WHERE r.menu_item_id = t_item_id AND r.status = 'published'
    ), 0),
    updated_at = now()
  WHERE i.id = t_item_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_kitchen_menu_item_reviews_sync_stats ON public.kitchen_menu_item_reviews;
CREATE TRIGGER trg_kitchen_menu_item_reviews_sync_stats
  AFTER INSERT OR UPDATE OF status, rating OR DELETE ON public.kitchen_menu_item_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_kitchen_menu_item_review_stats();

ALTER TABLE public.kitchen_menu_item_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kitchen_menu_reviews_public_read" ON public.kitchen_menu_item_reviews;
CREATE POLICY "kitchen_menu_reviews_public_read"
  ON public.kitchen_menu_item_reviews
  FOR SELECT TO anon, authenticated
  USING (status = 'published');

DROP POLICY IF EXISTS "kitchen_menu_reviews_staff_update" ON public.kitchen_menu_item_reviews;
CREATE POLICY "kitchen_menu_reviews_staff_update"
  ON public.kitchen_menu_item_reviews
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND COALESCE(s.is_active, true) = true
        AND s.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND COALESCE(s.is_active, true) = true
        AND s.deleted_at IS NULL
    )
  );

GRANT SELECT ON public.kitchen_menu_item_reviews TO anon, authenticated;
GRANT UPDATE ON public.kitchen_menu_item_reviews TO authenticated;

-- Storage: public read, edge (service role) write
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kitchen-menu-reviews',
  'kitchen-menu-reviews',
  true,
  52428800,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/3gpp'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "kitchen_menu_reviews_storage_public_read" ON storage.objects;
CREATE POLICY "kitchen_menu_reviews_storage_public_read"
  ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'kitchen-menu-reviews');

-- Upsert RPC: tags desteği
CREATE OR REPLACE FUNCTION public.upsert_hotel_kitchen_menu_item(
  p_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_category_title text DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_price numeric DEFAULT NULL,
  p_served_in_hotel_restaurant boolean DEFAULT true,
  p_is_available boolean DEFAULT true,
  p_sort_order int DEFAULT 0,
  p_image_urls text[] DEFAULT '{}'::text[],
  p_name_en text DEFAULT NULL,
  p_name_ar text DEFAULT NULL,
  p_description_en text DEFAULT NULL,
  p_description_ar text DEFAULT NULL,
  p_category_title_en text DEFAULT NULL,
  p_category_title_ar text DEFAULT NULL,
  p_tags text[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_staff_id uuid;
  v_item_id uuid;
  v_cat text;
  v_nm text;
  v_url text;
  v_i int;
  v_cover text;
  v_exists boolean;
  v_tags text[];
  v_allowed text[] := ARRAY['meat','vegetarian','seafood','vegan','dessert','breakfast','drink'];
BEGIN
  v_staff_id := public.assert_staff_can_manage_hotel_kitchen_menu(p_organization_id);

  v_cat := nullif(trim(COALESCE(p_category_title, '')), '');
  v_nm := nullif(trim(COALESCE(p_name, '')), '');
  IF v_cat IS NULL OR v_nm IS NULL THEN
    RAISE EXCEPTION 'Kategori ve ad zorunlu';
  END IF;
  IF p_price IS NULL OR p_price < 0 THEN
    RAISE EXCEPTION 'Geçersiz fiyat';
  END IF;

  IF p_tags IS NULL THEN
    v_tags := NULL;
  ELSE
    SELECT COALESCE(array_agg(DISTINCT t ORDER BY t), '{}'::text[])
    INTO v_tags
    FROM unnest(p_tags) AS t
    WHERE t = ANY (v_allowed);
  END IF;

  v_item_id := p_id;
  v_exists := false;
  IF v_item_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.hotel_kitchen_menu_items i
      WHERE i.id = v_item_id AND i.organization_id = p_organization_id
    ) INTO v_exists;
  END IF;

  IF v_exists THEN
    UPDATE public.hotel_kitchen_menu_items
    SET
      category_title = v_cat,
      name = v_nm,
      description = nullif(trim(COALESCE(p_description, '')), ''),
      price = p_price,
      served_in_hotel_restaurant = COALESCE(p_served_in_hotel_restaurant, true),
      is_available = COALESCE(p_is_available, true),
      sort_order = COALESCE(p_sort_order, 0),
      name_en = nullif(trim(COALESCE(p_name_en, '')), ''),
      name_ar = nullif(trim(COALESCE(p_name_ar, '')), ''),
      description_en = nullif(trim(COALESCE(p_description_en, '')), ''),
      description_ar = nullif(trim(COALESCE(p_description_ar, '')), ''),
      category_title_en = nullif(trim(COALESCE(p_category_title_en, '')), ''),
      category_title_ar = nullif(trim(COALESCE(p_category_title_ar, '')), ''),
      tags = COALESCE(v_tags, tags),
      updated_at = now()
    WHERE id = v_item_id;
  ELSE
    v_item_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO public.hotel_kitchen_menu_items (
      id,
      organization_id,
      category_title,
      name,
      description,
      price,
      served_in_hotel_restaurant,
      is_available,
      sort_order,
      created_by_staff_id,
      cover_image_url,
      image_count,
      name_en,
      name_ar,
      description_en,
      description_ar,
      category_title_en,
      category_title_ar,
      tags
    ) VALUES (
      v_item_id,
      p_organization_id,
      v_cat,
      v_nm,
      nullif(trim(COALESCE(p_description, '')), ''),
      p_price,
      COALESCE(p_served_in_hotel_restaurant, true),
      COALESCE(p_is_available, true),
      COALESCE(p_sort_order, 0),
      v_staff_id,
      NULL,
      0,
      nullif(trim(COALESCE(p_name_en, '')), ''),
      nullif(trim(COALESCE(p_name_ar, '')), ''),
      nullif(trim(COALESCE(p_description_en, '')), ''),
      nullif(trim(COALESCE(p_description_ar, '')), ''),
      nullif(trim(COALESCE(p_category_title_en, '')), ''),
      nullif(trim(COALESCE(p_category_title_ar, '')), ''),
      COALESCE(v_tags, '{}'::text[])
    );
  END IF;

  DELETE FROM public.hotel_kitchen_menu_images WHERE item_id = v_item_id;

  v_i := 0;
  v_cover := NULL;
  FOREACH v_url IN ARRAY COALESCE(p_image_urls, '{}'::text[])
  LOOP
    v_url := nullif(trim(v_url), '');
    IF v_url IS NULL THEN
      CONTINUE;
    END IF;
    v_i := v_i + 1;
    IF v_i > 5 THEN
      EXIT;
    END IF;
    IF v_cover IS NULL THEN
      v_cover := v_url;
    END IF;
    INSERT INTO public.hotel_kitchen_menu_images (item_id, image_url, sort_order)
    VALUES (v_item_id, v_url, v_i - 1);
  END LOOP;

  UPDATE public.hotel_kitchen_menu_items
  SET cover_image_url = v_cover, image_count = v_i
  WHERE id = v_item_id;

  RETURN v_item_id;
END;
$$;

COMMIT;
