-- Mutfak operasyon, stok, hasılat, cari ve gün sonu modülü (genel stok sisteminden ayrı).

BEGIN;

-- ---------------------------------------------------------------------------
-- Ayarlar
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kitchen_ops_settings (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  cari_debt_limit NUMERIC(14,2) NOT NULL DEFAULT 50000,
  receipt_required_above NUMERIC(14,2) NOT NULL DEFAULT 1000,
  skt_warning_days INT NOT NULL DEFAULT 3,
  skt_critical_days INT NOT NULL DEFAULT 1,
  day_close_required BOOLEAN NOT NULL DEFAULT true,
  double_approval_above NUMERIC(14,2) NOT NULL DEFAULT 5000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Kategoriler
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kitchen_stock_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_kitchen_stock_categories_org ON public.kitchen_stock_categories(organization_id);

-- ---------------------------------------------------------------------------
-- Stok ürünleri
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kitchen_stock_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.kitchen_stock_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  barcode TEXT,
  unit TEXT NOT NULL DEFAULT 'adet',
  current_quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  minimum_quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  last_purchase_price NUMERIC(14,2),
  last_in_at TIMESTAMPTZ,
  last_out_at TIMESTAMPTZ,
  nearest_expires_at DATE,
  image_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS kitchen_stock_items_org_barcode_uidx
  ON public.kitchen_stock_items (organization_id, barcode)
  WHERE barcode IS NOT NULL AND btrim(barcode) <> '';

CREATE INDEX IF NOT EXISTS idx_kitchen_stock_items_org ON public.kitchen_stock_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_stock_items_name ON public.kitchen_stock_items(organization_id, name);

-- ---------------------------------------------------------------------------
-- Stok hareketleri
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kitchen_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.kitchen_stock_items(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('in', 'out', 'waste', 'return', 'correction')),
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(14,2),
  supplier_name TEXT,
  expires_at DATE,
  reason TEXT,
  note TEXT,
  photo_url TEXT,
  invoice_photo_url TEXT,
  product_photo_url TEXT,
  package_photo_url TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'barcode', 'quick_button')),
  corrects_movement_id UUID REFERENCES public.kitchen_stock_movements(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kitchen_stock_movements_org ON public.kitchen_stock_movements(organization_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_stock_movements_item ON public.kitchen_stock_movements(item_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Alarmlar
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kitchen_stock_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.kitchen_stock_items(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('low_stock', 'out_of_stock', 'expiring_soon', 'expired', 'cari_limit', 'debt_due', 'day_not_closed', 'pos_mismatch')),
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('warning', 'critical')),
  message TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kitchen_stock_alerts_org ON public.kitchen_stock_alerts(organization_id, resolved, created_at DESC);

-- ---------------------------------------------------------------------------
-- Hasılat
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kitchen_revenues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  payment_type TEXT NOT NULL CHECK (payment_type IN ('nakit', 'otel_pos', 'havale', 'veresiye', 'otel_hesabi')),
  note TEXT,
  photo_url TEXT,
  created_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kitchen_revenues_org_date ON public.kitchen_revenues(organization_id, entry_date DESC);

-- ---------------------------------------------------------------------------
-- Giderler
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kitchen_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  payment_type TEXT NOT NULL DEFAULT 'nakit',
  supplier_name TEXT,
  description TEXT,
  note TEXT,
  receipt_photo_url TEXT,
  created_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kitchen_expenses_org_date ON public.kitchen_expenses(organization_id, entry_date DESC);

-- ---------------------------------------------------------------------------
-- Personel ödemeleri
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kitchen_personnel_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_name TEXT NOT NULL,
  staff_role TEXT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  payment_type TEXT NOT NULL CHECK (payment_type IN ('gunluk', 'haftalik', 'maas', 'avans', 'prim', 'ek')),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  note TEXT,
  created_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Tedarikçi borçları
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kitchen_supplier_debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_name TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue')),
  description TEXT,
  note TEXT,
  created_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Otel - Mutfak cari
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kitchen_cari_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('kitchen_owes_hotel', 'hotel_owes_kitchen')),
  category TEXT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  description TEXT,
  reference_type TEXT,
  reference_id UUID,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kitchen_cari_ledger_org ON public.kitchen_cari_ledger(organization_id, entry_date DESC);

-- ---------------------------------------------------------------------------
-- POS işlemleri
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kitchen_pos_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'transferred', 'commission_deducted', 'completed')),
  approved_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kitchen_pos_transactions_org ON public.kitchen_pos_transactions(organization_id, entry_date DESC, status);

-- ---------------------------------------------------------------------------
-- Ödeme / mahsup
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kitchen_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payer_name TEXT,
  payee_name TEXT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  method TEXT NOT NULL DEFAULT 'nakit',
  description TEXT,
  receipt_photo_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'partial', 'cancelled')),
  handover_from UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  handover_to UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  handover_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Gün sonu kapanış
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kitchen_day_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  closure_date DATE NOT NULL,
  total_revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_pos NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_cash NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_expenses NUMERIC(14,2) NOT NULL DEFAULT 0,
  personnel_expenses NUMERIC(14,2) NOT NULL DEFAULT 0,
  supplier_debt NUMERIC(14,2) NOT NULL DEFAULT 0,
  cari_net NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_remaining NUMERIC(14,2) NOT NULL DEFAULT 0,
  checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved')),
  submitted_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, closure_date)
);

-- ---------------------------------------------------------------------------
-- Denetim logu (finansal kayıtlar silinmez)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kitchen_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  changed_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kitchen_audit_logs_org ON public.kitchen_audit_logs(organization_id, changed_at DESC);

-- ---------------------------------------------------------------------------
-- Yardımcı: mutfak erişimi
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_has_kitchen_ops_access()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.auth_id = auth.uid()
      AND s.is_active = true
      AND s.deleted_at IS NULL
      AND (
        s.role = 'admin'
        OR public.staff_has_app_permission('mutfak_operasyon')
        OR lower(coalesce(s.department, '')) IN ('kitchen', 'kitchen_staff', 'mutfak', 'chef', 'head_chef', 'pastry')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.staff_has_kitchen_reception_access()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.auth_id = auth.uid()
      AND s.is_active = true
      AND s.deleted_at IS NULL
      AND (
        s.role = 'admin'
        OR s.role = 'reception_chief'
        OR public.staff_has_app_permission('reception_mutfak_muhasebe')
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Varsayılan kategorileri seed et
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kitchen_seed_default_categories(p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_names TEXT[] := ARRAY[
    'Sebze', 'Meyve', 'Kahvaltılık', 'Et / Tavuk', 'Süt Ürünleri',
    'İçecek', 'Kuru Gıda', 'Baharat', 'Temizlik', 'Donuk Ürün', 'Tatlı', 'Diğer'
  ];
  v_name TEXT;
  v_i INT := 0;
BEGIN
  FOREACH v_name IN ARRAY v_names LOOP
    INSERT INTO public.kitchen_stock_categories (organization_id, name, sort_order)
    VALUES (p_org_id, v_name, v_i)
    ON CONFLICT (organization_id, name) DO NOTHING;
    v_i := v_i + 1;
  END LOOP;
  INSERT INTO public.kitchen_ops_settings (organization_id)
  VALUES (p_org_id)
  ON CONFLICT (organization_id) DO NOTHING;
END;
$$;

-- Mevcut işletmeler için seed
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.organizations LOOP
    PERFORM public.kitchen_seed_default_categories(r.id);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Stok hareketi RPC
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
    updated_at = now()
  WHERE id = p_item_id;

  SELECT * INTO v_item FROM public.kitchen_stock_items WHERE id = p_item_id;
  SELECT * INTO v_settings FROM public.kitchen_ops_settings WHERE organization_id = v_org_id;

  -- Eski stok alarmlarını çöz
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

  -- SKT alarmları
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

-- Ürün oluştur veya bul
CREATE OR REPLACE FUNCTION public.kitchen_stock_upsert_item(
  p_name TEXT,
  p_unit TEXT DEFAULT 'adet',
  p_category_id UUID DEFAULT NULL,
  p_barcode TEXT DEFAULT NULL,
  p_minimum_quantity NUMERIC DEFAULT 0,
  p_image_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_staff_id UUID;
  v_item_id UUID;
BEGIN
  IF NOT public.staff_has_kitchen_ops_access() THEN
    RAISE EXCEPTION 'Mutfak operasyon yetkisi yok';
  END IF;
  v_org_id := public.current_staff_organization_id();
  v_staff_id := public.current_staff_id();

  IF p_barcode IS NOT NULL AND btrim(p_barcode) <> '' THEN
    SELECT id INTO v_item_id FROM public.kitchen_stock_items
    WHERE organization_id = v_org_id AND barcode = btrim(p_barcode) AND active = true
    LIMIT 1;
    IF v_item_id IS NOT NULL THEN RETURN v_item_id; END IF;
  END IF;

  INSERT INTO public.kitchen_stock_items (
    organization_id, category_id, name, barcode, unit, minimum_quantity, image_url, created_by
  ) VALUES (
    v_org_id, p_category_id, btrim(p_name), NULLIF(btrim(coalesce(p_barcode, '')), ''),
    coalesce(NULLIF(btrim(p_unit), ''), 'adet'), coalesce(p_minimum_quantity, 0), p_image_url, v_staff_id
  ) RETURNING id INTO v_item_id;

  RETURN v_item_id;
END;
$$;

-- Gün sonu özeti
CREATE OR REPLACE FUNCTION public.kitchen_day_closure_summary(p_date DATE DEFAULT CURRENT_DATE)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_rev NUMERIC; v_pos NUMERIC; v_cash NUMERIC; v_exp NUMERIC; v_per NUMERIC; v_debt NUMERIC;
  v_kitchen_owes NUMERIC; v_hotel_owes NUMERIC;
BEGIN
  v_org_id := public.current_staff_organization_id();
  SELECT coalesce(sum(amount), 0) INTO v_rev FROM public.kitchen_revenues
  WHERE organization_id = v_org_id AND entry_date = p_date;
  SELECT coalesce(sum(amount), 0) INTO v_pos FROM public.kitchen_pos_transactions
  WHERE organization_id = v_org_id AND entry_date = p_date;
  SELECT coalesce(sum(amount), 0) INTO v_cash FROM public.kitchen_revenues
  WHERE organization_id = v_org_id AND entry_date = p_date AND payment_type = 'nakit';
  SELECT coalesce(sum(amount), 0) INTO v_exp FROM public.kitchen_expenses
  WHERE organization_id = v_org_id AND entry_date = p_date;
  SELECT coalesce(sum(amount), 0) INTO v_per FROM public.kitchen_personnel_payments
  WHERE organization_id = v_org_id AND entry_date = p_date;
  SELECT coalesce(sum(amount - paid_amount), 0) INTO v_debt FROM public.kitchen_supplier_debts
  WHERE organization_id = v_org_id AND status IN ('pending', 'partial', 'overdue');
  SELECT coalesce(sum(amount), 0) INTO v_kitchen_owes FROM public.kitchen_cari_ledger
  WHERE organization_id = v_org_id AND direction = 'kitchen_owes_hotel';
  SELECT coalesce(sum(amount), 0) INTO v_hotel_owes FROM public.kitchen_cari_ledger
  WHERE organization_id = v_org_id AND direction = 'hotel_owes_kitchen';

  RETURN jsonb_build_object(
    'total_revenue', v_rev,
    'total_pos', v_pos,
    'total_cash', v_cash,
    'total_expenses', v_exp,
    'personnel_expenses', v_per,
    'supplier_debt', v_debt,
    'kitchen_owes_hotel', v_kitchen_owes,
    'hotel_owes_kitchen', v_hotel_owes,
    'cari_net', v_hotel_owes - v_kitchen_owes,
    'net_remaining', v_rev - v_exp - v_per
  );
END;
$$;

-- Cari net bakiye
CREATE OR REPLACE FUNCTION public.kitchen_cari_net_balance()
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT sum(CASE WHEN direction = 'hotel_owes_kitchen' THEN amount ELSE -amount END)
     FROM public.kitchen_cari_ledger
     WHERE organization_id = public.current_staff_organization_id()),
    0
  );
$$;

-- POS uyuşmazlık kontrolü
CREATE OR REPLACE FUNCTION public.kitchen_check_pos_mismatch(p_date DATE DEFAULT CURRENT_DATE)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT abs(
    coalesce((SELECT sum(amount) FROM public.kitchen_revenues
      WHERE organization_id = public.current_staff_organization_id()
        AND entry_date = p_date AND payment_type = 'otel_pos'), 0)
    -
    coalesce((SELECT sum(amount) FROM public.kitchen_pos_transactions
      WHERE organization_id = public.current_staff_organization_id()
        AND entry_date = p_date), 0)
  ) > 0.01;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.kitchen_ops_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_stock_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_stock_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_revenues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_personnel_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_supplier_debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_cari_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_pos_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_day_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_audit_logs ENABLE ROW LEVEL SECURITY;

-- Ortak org policy macro via repeated patterns
CREATE POLICY "kitchen_ops_settings_select" ON public.kitchen_ops_settings FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin() OR organization_id = public.current_staff_organization_id());
CREATE POLICY "kitchen_ops_settings_update" ON public.kitchen_ops_settings FOR UPDATE TO authenticated
  USING (public.current_user_is_staff_admin())
  WITH CHECK (public.current_user_is_staff_admin());

CREATE POLICY "kitchen_categories_select" ON public.kitchen_stock_categories FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin() OR (public.staff_has_kitchen_ops_access() AND organization_id = public.current_staff_organization_id()));
CREATE POLICY "kitchen_categories_write" ON public.kitchen_stock_categories FOR ALL TO authenticated
  USING (public.current_user_is_staff_admin())
  WITH CHECK (public.current_user_is_staff_admin());

CREATE POLICY "kitchen_items_select" ON public.kitchen_stock_items FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin() OR (public.staff_has_kitchen_ops_access() AND organization_id = public.current_staff_organization_id()));
CREATE POLICY "kitchen_items_insert" ON public.kitchen_stock_items FOR INSERT TO authenticated
  WITH CHECK (public.staff_has_kitchen_ops_access() AND (public.current_user_is_staff_admin() OR organization_id = public.current_staff_organization_id()));
CREATE POLICY "kitchen_items_update" ON public.kitchen_stock_items FOR UPDATE TO authenticated
  USING (public.current_user_is_staff_admin() OR (public.staff_has_kitchen_ops_access() AND organization_id = public.current_staff_organization_id()))
  WITH CHECK (public.current_user_is_staff_admin() OR organization_id = public.current_staff_organization_id());
CREATE POLICY "kitchen_items_delete" ON public.kitchen_stock_items FOR DELETE TO authenticated
  USING (public.current_user_is_staff_admin());

CREATE POLICY "kitchen_movements_select" ON public.kitchen_stock_movements FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin() OR (public.staff_has_kitchen_ops_access() AND organization_id = public.current_staff_organization_id()));
CREATE POLICY "kitchen_movements_insert" ON public.kitchen_stock_movements FOR INSERT TO authenticated
  WITH CHECK (public.staff_has_kitchen_ops_access() AND organization_id = public.current_staff_organization_id());

CREATE POLICY "kitchen_alerts_select" ON public.kitchen_stock_alerts FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin() OR public.staff_has_kitchen_ops_access() OR public.staff_has_kitchen_reception_access());
CREATE POLICY "kitchen_alerts_update" ON public.kitchen_stock_alerts FOR UPDATE TO authenticated
  USING (public.current_user_is_staff_admin() OR public.staff_has_kitchen_ops_access());

-- Finans tabloları: mutfak yazabilir, reception POS okuyabilir/onaylayabilir
CREATE POLICY "kitchen_revenues_select" ON public.kitchen_revenues FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin() OR public.staff_has_kitchen_ops_access() OR public.staff_has_kitchen_reception_access());
CREATE POLICY "kitchen_revenues_insert" ON public.kitchen_revenues FOR INSERT TO authenticated
  WITH CHECK (public.staff_has_kitchen_ops_access() AND organization_id = public.current_staff_organization_id());
CREATE POLICY "kitchen_revenues_update" ON public.kitchen_revenues FOR UPDATE TO authenticated
  USING (public.current_user_is_staff_admin() OR (public.staff_has_kitchen_ops_access() AND organization_id = public.current_staff_organization_id()));

CREATE POLICY "kitchen_expenses_select" ON public.kitchen_expenses FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin() OR public.staff_has_kitchen_ops_access() OR public.staff_has_kitchen_reception_access());
CREATE POLICY "kitchen_expenses_insert" ON public.kitchen_expenses FOR INSERT TO authenticated
  WITH CHECK (public.staff_has_kitchen_ops_access() AND organization_id = public.current_staff_organization_id());

CREATE POLICY "kitchen_personnel_select" ON public.kitchen_personnel_payments FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin() OR public.staff_has_kitchen_ops_access() OR public.staff_has_kitchen_reception_access());
CREATE POLICY "kitchen_personnel_insert" ON public.kitchen_personnel_payments FOR INSERT TO authenticated
  WITH CHECK (public.staff_has_kitchen_ops_access() AND organization_id = public.current_staff_organization_id());

CREATE POLICY "kitchen_supplier_debts_select" ON public.kitchen_supplier_debts FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin() OR public.staff_has_kitchen_ops_access() OR public.staff_has_kitchen_reception_access());
CREATE POLICY "kitchen_supplier_debts_write" ON public.kitchen_supplier_debts FOR ALL TO authenticated
  USING (public.staff_has_kitchen_ops_access() OR public.current_user_is_staff_admin())
  WITH CHECK (public.staff_has_kitchen_ops_access() OR public.current_user_is_staff_admin());

CREATE POLICY "kitchen_cari_select" ON public.kitchen_cari_ledger FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin() OR public.staff_has_kitchen_ops_access() OR public.staff_has_kitchen_reception_access());
CREATE POLICY "kitchen_cari_insert" ON public.kitchen_cari_ledger FOR INSERT TO authenticated
  WITH CHECK (public.staff_has_kitchen_ops_access() AND organization_id = public.current_staff_organization_id());

CREATE POLICY "kitchen_pos_select" ON public.kitchen_pos_transactions FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin() OR public.staff_has_kitchen_ops_access() OR public.staff_has_kitchen_reception_access());
CREATE POLICY "kitchen_pos_insert" ON public.kitchen_pos_transactions FOR INSERT TO authenticated
  WITH CHECK (public.staff_has_kitchen_ops_access() AND organization_id = public.current_staff_organization_id());
CREATE POLICY "kitchen_pos_update" ON public.kitchen_pos_transactions FOR UPDATE TO authenticated
  USING (public.current_user_is_staff_admin() OR public.staff_has_kitchen_reception_access());

CREATE POLICY "kitchen_settlements_select" ON public.kitchen_settlements FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin() OR public.staff_has_kitchen_ops_access() OR public.staff_has_kitchen_reception_access());
CREATE POLICY "kitchen_settlements_write" ON public.kitchen_settlements FOR ALL TO authenticated
  USING (public.staff_has_kitchen_ops_access() OR public.current_user_is_staff_admin() OR public.staff_has_kitchen_reception_access())
  WITH CHECK (public.staff_has_kitchen_ops_access() OR public.current_user_is_staff_admin() OR public.staff_has_kitchen_reception_access());

CREATE POLICY "kitchen_day_closures_select" ON public.kitchen_day_closures FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin() OR public.staff_has_kitchen_ops_access() OR public.staff_has_kitchen_reception_access());
CREATE POLICY "kitchen_day_closures_write" ON public.kitchen_day_closures FOR ALL TO authenticated
  USING (public.staff_has_kitchen_ops_access() OR public.current_user_is_staff_admin() OR public.staff_has_kitchen_reception_access())
  WITH CHECK (public.staff_has_kitchen_ops_access() OR public.current_user_is_staff_admin() OR public.staff_has_kitchen_reception_access());

CREATE POLICY "kitchen_audit_select" ON public.kitchen_audit_logs FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin() OR public.staff_has_kitchen_ops_access());
CREATE POLICY "kitchen_audit_insert" ON public.kitchen_audit_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('kitchen-ops-proofs', 'kitchen-ops-proofs', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "kitchen_ops_proofs_select" ON storage.objects;
CREATE POLICY "kitchen_ops_proofs_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'kitchen-ops-proofs');
DROP POLICY IF EXISTS "kitchen_ops_proofs_insert" ON storage.objects;
CREATE POLICY "kitchen_ops_proofs_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'kitchen-ops-proofs' AND public.staff_has_kitchen_ops_access());
DROP POLICY IF EXISTS "kitchen_ops_proofs_update" ON storage.objects;
CREATE POLICY "kitchen_ops_proofs_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'kitchen-ops-proofs')
  WITH CHECK (bucket_id = 'kitchen-ops-proofs');

COMMIT;
