-- Stok girişindeki ürün fotoğrafı ürün kartında (image_url) görünsün.

BEGIN;

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

COMMIT;
