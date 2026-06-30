-- Otel mutfağı menüsü: yemek adı / kategori / açıklama EN + AR çevirileri

BEGIN;

ALTER TABLE public.hotel_kitchen_menu_items
  ADD COLUMN IF NOT EXISTS name_en text,
  ADD COLUMN IF NOT EXISTS name_ar text,
  ADD COLUMN IF NOT EXISTS description_en text,
  ADD COLUMN IF NOT EXISTS description_ar text,
  ADD COLUMN IF NOT EXISTS category_title_en text,
  ADD COLUMN IF NOT EXISTS category_title_ar text;

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
  p_category_title_ar text DEFAULT NULL
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
      category_title_ar
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
      nullif(trim(COALESCE(p_category_title_ar, '')), '')
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
