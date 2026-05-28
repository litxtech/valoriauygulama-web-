-- Mutfak personeli stok girişinde kategori adını yazarak oluşturabilsin (admin listesi zorunlu değil).

BEGIN;

CREATE OR REPLACE FUNCTION public.kitchen_stock_ensure_category(p_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_cat_id UUID;
  v_name TEXT;
BEGIN
  IF NOT public.staff_has_kitchen_ops_access() THEN
    RAISE EXCEPTION 'Mutfak operasyon yetkisi yok';
  END IF;

  v_name := btrim(coalesce(p_name, ''));
  IF v_name = '' THEN
    RETURN NULL;
  END IF;

  v_org_id := public.current_staff_organization_id();

  SELECT id INTO v_cat_id
  FROM public.kitchen_stock_categories
  WHERE organization_id = v_org_id
    AND lower(name) = lower(v_name)
  LIMIT 1;

  IF v_cat_id IS NOT NULL THEN
    UPDATE public.kitchen_stock_categories SET active = true WHERE id = v_cat_id AND NOT active;
    RETURN v_cat_id;
  END IF;

  INSERT INTO public.kitchen_stock_categories (organization_id, name, sort_order)
  VALUES (
    v_org_id,
    v_name,
    coalesce(
      (SELECT max(sort_order) + 1 FROM public.kitchen_stock_categories WHERE organization_id = v_org_id),
      0
    )
  )
  ON CONFLICT (organization_id, name) DO UPDATE
    SET active = true
  RETURNING id INTO v_cat_id;

  RETURN v_cat_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kitchen_stock_ensure_category(TEXT) TO authenticated;

COMMIT;
