-- Mutfak teslim kaydı (otel mutfağı → mutfakçı) ve stok ürünü çoklu fotoğraf.

BEGIN;

-- ---------------------------------------------------------------------------
-- Stok ürünü ek fotoğrafları (sınırsız; image_url ana kapak)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kitchen_stock_item_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.kitchen_stock_items(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kitchen_stock_item_images_item
  ON public.kitchen_stock_item_images(item_id, sort_order);

-- ---------------------------------------------------------------------------
-- Teslim kaydı başlık
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kitchen_handovers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  handover_date DATE NOT NULL DEFAULT CURRENT_DATE,
  handed_by_name TEXT NOT NULL,
  received_by_name TEXT NOT NULL,
  handed_by_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  received_by_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'acknowledged')),
  created_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kitchen_handovers_org_date
  ON public.kitchen_handovers(organization_id, handover_date DESC, created_at DESC);

-- ---------------------------------------------------------------------------
-- Teslim malzemeleri
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kitchen_handover_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handover_id UUID NOT NULL REFERENCES public.kitchen_handovers(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stock_item_id UUID REFERENCES public.kitchen_stock_items(id) ON DELETE SET NULL,
  material_name TEXT NOT NULL,
  quantity NUMERIC(14,3),
  unit TEXT NOT NULL DEFAULT 'adet',
  note TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kitchen_handover_items_handover
  ON public.kitchen_handover_items(handover_id, sort_order);

-- ---------------------------------------------------------------------------
-- Malzeme başına birden fazla fotoğraf
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kitchen_handover_item_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handover_item_id UUID NOT NULL REFERENCES public.kitchen_handover_items(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kitchen_handover_item_images_item
  ON public.kitchen_handover_item_images(handover_item_id, sort_order);

-- ---------------------------------------------------------------------------
-- Stok girişinde ürün fotoğrafını galeriye de ekle
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kitchen_stock_apply_movement(
  p_item_id UUID,
  p_movement_type TEXT,
  p_quantity NUMERIC,
  p_reason TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_unit_price NUMERIC DEFAULT NULL,
  p_supplier_name TEXT DEFAULT NULL,
  p_expires_at DATE DEFAULT NULL,
  p_photo_url TEXT DEFAULT NULL,
  p_invoice_photo_url TEXT DEFAULT NULL,
  p_product_photo_url TEXT DEFAULT NULL,
  p_package_photo_url TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'manual'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_staff_id UUID;
  v_org_id UUID;
  v_item public.kitchen_stock_items%ROWTYPE;
  v_delta NUMERIC;
  v_movement_id UUID;
  v_settings public.kitchen_ops_settings%ROWTYPE;
  v_product_photo TEXT;
  v_next_sort INT;
BEGIN
  IF NOT public.staff_has_kitchen_ops_access() THEN
    RAISE EXCEPTION 'Mutfak operasyon yetkisi yok';
  END IF;

  v_staff_id := public.current_staff_id();
  SELECT * INTO v_item FROM public.kitchen_stock_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ürün bulunamadı'; END IF;

  IF v_item.organization_id <> public.current_staff_organization_id()
     AND NOT public.current_user_is_staff_admin() THEN
    RAISE EXCEPTION 'Bu işletmenin stokuna erişim yok';
  END IF;

  v_org_id := v_item.organization_id;
  v_product_photo := NULLIF(btrim(coalesce(p_product_photo_url, '')), '');
  v_delta := CASE WHEN p_movement_type IN ('in', 'return') THEN p_quantity
                  WHEN p_movement_type IN ('out', 'waste') THEN -p_quantity
                  ELSE p_quantity END;

  IF p_movement_type IN ('out', 'waste') AND (v_item.current_quantity + v_delta) < 0 THEN
    RAISE EXCEPTION 'Yetersiz stok. Mevcut: %', v_item.current_quantity;
  END IF;

  INSERT INTO public.kitchen_stock_movements (
    organization_id, item_id, movement_type, quantity, unit_price, supplier_name,
    expires_at, reason, note, photo_url, invoice_photo_url, product_photo_url,
    package_photo_url, source, created_by
  ) VALUES (
    v_org_id, p_item_id, p_movement_type, p_quantity, p_unit_price, p_supplier_name,
    p_expires_at, p_reason, p_note, p_photo_url, p_invoice_photo_url, p_product_photo_url,
    p_package_photo_url, coalesce(p_source, 'manual'), v_staff_id
  ) RETURNING id INTO v_movement_id;

  UPDATE public.kitchen_stock_items SET
    current_quantity = current_quantity + v_delta,
    last_purchase_price = CASE WHEN p_movement_type = 'in' AND p_unit_price IS NOT NULL THEN p_unit_price ELSE last_purchase_price END,
    last_in_at = CASE WHEN p_movement_type IN ('in', 'return') THEN now() ELSE last_in_at END,
    last_out_at = CASE WHEN p_movement_type IN ('out', 'waste') THEN now() ELSE last_out_at END,
    nearest_expires_at = CASE
      WHEN p_expires_at IS NOT NULL THEN
        LEAST(coalesce(nearest_expires_at, p_expires_at), p_expires_at)
      ELSE nearest_expires_at END,
    image_url = CASE
      WHEN v_product_photo IS NOT NULL AND p_movement_type IN ('in', 'return') THEN v_product_photo
      ELSE image_url
    END,
    updated_at = now()
  WHERE id = p_item_id;

  IF v_product_photo IS NOT NULL AND p_movement_type IN ('in', 'return') THEN
    SELECT coalesce(max(sort_order), -1) + 1 INTO v_next_sort
    FROM public.kitchen_stock_item_images WHERE item_id = p_item_id;
    INSERT INTO public.kitchen_stock_item_images (item_id, organization_id, image_url, sort_order)
    VALUES (p_item_id, v_org_id, v_product_photo, v_next_sort);
  END IF;

  SELECT * INTO v_item FROM public.kitchen_stock_items WHERE id = p_item_id;
  SELECT * INTO v_settings FROM public.kitchen_ops_settings WHERE organization_id = v_org_id;

  UPDATE public.kitchen_stock_alerts SET resolved = true, resolved_at = now(), resolved_by = v_staff_id
  WHERE item_id = p_item_id AND alert_type IN ('low_stock', 'out_of_stock') AND resolved = false;

  IF v_item.current_quantity <= 0 THEN
    INSERT INTO public.kitchen_stock_alerts (organization_id, item_id, alert_type, severity, message)
    VALUES (v_org_id, p_item_id, 'out_of_stock', 'critical',
      format('%s stoğu tükendi. Yeni alım gerekiyor.', v_item.name));
  ELSIF v_item.minimum_quantity > 0 AND v_item.current_quantity <= v_item.minimum_quantity THEN
    INSERT INTO public.kitchen_stock_alerts (organization_id, item_id, alert_type, severity, message)
    VALUES (v_org_id, p_item_id, 'low_stock', 'warning',
      format('%s stoğu kritik seviyeye düştü. Kalan: %s %s', v_item.name, v_item.current_quantity, v_item.unit));
  END IF;

  IF v_item.nearest_expires_at IS NOT NULL THEN
    IF v_item.nearest_expires_at < CURRENT_DATE THEN
      INSERT INTO public.kitchen_stock_alerts (organization_id, item_id, alert_type, severity, message)
      VALUES (v_org_id, p_item_id, 'expired', 'critical',
        format('%s son kullanma tarihi geçti.', v_item.name));
    ELSIF v_item.nearest_expires_at <= CURRENT_DATE + coalesce(v_settings.skt_critical_days, 1) THEN
      INSERT INTO public.kitchen_stock_alerts (organization_id, item_id, alert_type, severity, message)
      VALUES (v_org_id, p_item_id, 'expiring_soon', 'critical',
        format('%s son kullanma tarihi yaklaşıyor.', v_item.name));
    ELSIF v_item.nearest_expires_at <= CURRENT_DATE + coalesce(v_settings.skt_warning_days, 3) THEN
      INSERT INTO public.kitchen_stock_alerts (organization_id, item_id, alert_type, severity, message)
      VALUES (v_org_id, p_item_id, 'expiring_soon', 'warning',
        format('%s son kullanma tarihi yaklaşıyor.', v_item.name));
    END IF;
  END IF;

  RETURN v_movement_id;
END;
$$;

-- Stok ürününe manuel fotoğraf ekle
CREATE OR REPLACE FUNCTION public.kitchen_stock_add_item_images(
  p_item_id UUID,
  p_image_urls TEXT[]
)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_url TEXT;
  v_sort INT;
  v_count INT := 0;
BEGIN
  IF NOT public.staff_has_kitchen_ops_access() THEN
    RAISE EXCEPTION 'Mutfak operasyon yetkisi yok';
  END IF;

  SELECT organization_id INTO v_org_id FROM public.kitchen_stock_items WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ürün bulunamadı'; END IF;

  IF v_org_id <> public.current_staff_organization_id() AND NOT public.current_user_is_staff_admin() THEN
    RAISE EXCEPTION 'Bu işletmenin stokuna erişim yok';
  END IF;

  SELECT coalesce(max(sort_order), -1) INTO v_sort FROM public.kitchen_stock_item_images WHERE item_id = p_item_id;

  FOREACH v_url IN ARRAY coalesce(p_image_urls, ARRAY[]::TEXT[]) LOOP
    v_url := NULLIF(btrim(v_url), '');
    CONTINUE WHEN v_url IS NULL;
    v_sort := v_sort + 1;
    INSERT INTO public.kitchen_stock_item_images (item_id, organization_id, image_url, sort_order)
    VALUES (p_item_id, v_org_id, v_url, v_sort);
    v_count := v_count + 1;
    IF v_count = 1 THEN
      UPDATE public.kitchen_stock_items SET image_url = v_url, updated_at = now() WHERE id = p_item_id AND image_url IS NULL;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Teslim kaydı oluştur (malzemeler + fotoğraflar tek RPC)
CREATE OR REPLACE FUNCTION public.kitchen_save_handover(
  p_handover_date DATE,
  p_handed_by_name TEXT,
  p_received_by_name TEXT,
  p_notes TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_staff_id UUID;
  v_org_id UUID;
  v_handover_id UUID;
  v_item JSONB;
  v_item_id UUID;
  v_img TEXT;
  v_sort INT;
  v_i INT;
  v_img_i INT;
BEGIN
  IF NOT public.staff_has_kitchen_ops_access() THEN
    RAISE EXCEPTION 'Mutfak operasyon yetkisi yok';
  END IF;

  v_staff_id := public.current_staff_id();
  v_org_id := public.current_staff_organization_id();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'İşletme bulunamadı'; END IF;

  IF NULLIF(btrim(coalesce(p_handed_by_name, '')), '') IS NULL
     OR NULLIF(btrim(coalesce(p_received_by_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Teslim eden ve teslim alan zorunlu';
  END IF;

  INSERT INTO public.kitchen_handovers (
    organization_id, handover_date, handed_by_name, received_by_name,
    handed_by_staff_id, received_by_staff_id, notes, status, created_by
  ) VALUES (
    v_org_id,
    coalesce(p_handover_date, CURRENT_DATE),
    btrim(p_handed_by_name),
    btrim(p_received_by_name),
    v_staff_id,
    v_staff_id,
    NULLIF(btrim(coalesce(p_notes, '')), ''),
    'submitted',
    v_staff_id
  ) RETURNING id INTO v_handover_id;

  v_i := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) LOOP
    IF NULLIF(btrim(coalesce(v_item->>'material_name', '')), '') IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.kitchen_handover_items (
      handover_id, organization_id, stock_item_id, material_name, quantity, unit, note, sort_order
    ) VALUES (
      v_handover_id,
      v_org_id,
      NULLIF(v_item->>'stock_item_id', '')::UUID,
      btrim(v_item->>'material_name'),
      NULLIF(v_item->>'quantity', '')::NUMERIC,
      coalesce(NULLIF(btrim(v_item->>'unit'), ''), 'adet'),
      NULLIF(btrim(coalesce(v_item->>'note', '')), ''),
      v_i
    ) RETURNING id INTO v_item_id;

    v_img_i := 0;
    FOR v_img IN
      SELECT jsonb_array_elements_text(coalesce(v_item->'image_urls', '[]'::jsonb))
    LOOP
      v_img := NULLIF(btrim(v_img), '');
      CONTINUE WHEN v_img IS NULL;
      INSERT INTO public.kitchen_handover_item_images (handover_item_id, organization_id, image_url, sort_order)
      VALUES (v_item_id, v_org_id, v_img, v_img_i);
      v_img_i := v_img_i + 1;
    END LOOP;

    v_i := v_i + 1;
  END LOOP;

  IF v_i = 0 THEN
    RAISE EXCEPTION 'En az bir malzeme ekleyin';
  END IF;

  RETURN v_handover_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kitchen_stock_add_item_images(UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_save_handover(DATE, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- RLS
ALTER TABLE public.kitchen_stock_item_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_handover_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_handover_item_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kitchen_stock_item_images_select" ON public.kitchen_stock_item_images FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin() OR (public.staff_has_kitchen_ops_access() AND organization_id = public.current_staff_organization_id()));
CREATE POLICY "kitchen_stock_item_images_insert" ON public.kitchen_stock_item_images FOR INSERT TO authenticated
  WITH CHECK (public.staff_has_kitchen_ops_access() AND organization_id = public.current_staff_organization_id());

CREATE POLICY "kitchen_handovers_select" ON public.kitchen_handovers FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin() OR public.staff_has_kitchen_ops_access() OR public.staff_has_kitchen_reception_access());
CREATE POLICY "kitchen_handovers_insert" ON public.kitchen_handovers FOR INSERT TO authenticated
  WITH CHECK (public.staff_has_kitchen_ops_access() AND organization_id = public.current_staff_organization_id());
CREATE POLICY "kitchen_handovers_update" ON public.kitchen_handovers FOR UPDATE TO authenticated
  USING (public.staff_has_kitchen_ops_access() AND organization_id = public.current_staff_organization_id());

CREATE POLICY "kitchen_handover_items_select" ON public.kitchen_handover_items FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin() OR public.staff_has_kitchen_ops_access() OR public.staff_has_kitchen_reception_access());
CREATE POLICY "kitchen_handover_items_insert" ON public.kitchen_handover_items FOR INSERT TO authenticated
  WITH CHECK (public.staff_has_kitchen_ops_access() AND organization_id = public.current_staff_organization_id());

CREATE POLICY "kitchen_handover_item_images_select" ON public.kitchen_handover_item_images FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin() OR public.staff_has_kitchen_ops_access() OR public.staff_has_kitchen_reception_access());
CREATE POLICY "kitchen_handover_item_images_insert" ON public.kitchen_handover_item_images FOR INSERT TO authenticated
  WITH CHECK (public.staff_has_kitchen_ops_access() AND organization_id = public.current_staff_organization_id());

COMMIT;
