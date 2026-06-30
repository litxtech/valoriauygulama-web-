-- Partner Ticaret Sistemi — Kahvaltı partner modülünden bağımsız yeni B2B cari modülü.

BEGIN;

-- ---------- Kategoriler ----------
CREATE TABLE IF NOT EXISTS public.partner_trade_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_trade_categories_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_trade_categories_org_name
  ON public.partner_trade_categories (organization_id, lower(trim(name)));

CREATE INDEX IF NOT EXISTS idx_partner_trade_categories_org_sort
  ON public.partner_trade_categories (organization_id, sort_order, name);

COMMENT ON TABLE public.partner_trade_categories IS
  'Partner Ticaret — sektör/kategori (Temizlik, Çamaşırhane, vb.).';

-- ---------- Partner firmalar ----------
CREATE TABLE IF NOT EXISTS public.partner_trade_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  category_id uuid NOT NULL REFERENCES public.partner_trade_categories(id) ON DELETE RESTRICT,
  company_name text NOT NULL,
  contact_name text,
  phone text,
  email text NOT NULL,
  address text,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  notes text,
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_trade_partners_company_not_blank CHECK (length(trim(company_name)) > 0),
  CONSTRAINT partner_trade_partners_email_not_blank CHECK (length(trim(email)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_partner_trade_partners_org
  ON public.partner_trade_partners (organization_id, status, company_name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_trade_partners_auth
  ON public.partner_trade_partners (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_partner_trade_partners_category
  ON public.partner_trade_partners (category_id);

COMMENT ON TABLE public.partner_trade_partners IS
  'Partner Ticaret — dış tedarikçi / hizmet firması cari hesabı.';

-- ---------- İşlemler (fatura / hizmet kaydı) ----------
CREATE TABLE IF NOT EXISTS public.partner_trade_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  partner_id uuid NOT NULL REFERENCES public.partner_trade_partners(id) ON DELETE RESTRICT,
  reference_code text,
  notes text,
  status text NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'approved', 'disputed', 'cancelled')),
  total_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  currency text NOT NULL DEFAULT 'TRY',
  partner_response_at timestamptz,
  partner_dispute_note text,
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_trade_transactions_partner
  ON public.partner_trade_transactions (partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_trade_transactions_org_status
  ON public.partner_trade_transactions (organization_id, status, created_at DESC);

COMMENT ON TABLE public.partner_trade_transactions IS
  'Partner Ticaret — admin tarafından oluşturulan işlem; partner onaylar veya itiraz eder.';

-- ---------- İşlem kalemleri ----------
CREATE TABLE IF NOT EXISTS public.partner_trade_transaction_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.partner_trade_transactions(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(14, 3) NOT NULL CHECK (quantity > 0),
  unit_label text NOT NULL DEFAULT 'Adet',
  unit_price numeric(14, 2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(14, 2) NOT NULL CHECK (line_total >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT partner_trade_transaction_items_desc_not_blank CHECK (length(trim(description)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_partner_trade_transaction_items_tx
  ON public.partner_trade_transaction_items (transaction_id, sort_order);

COMMENT ON TABLE public.partner_trade_transaction_items IS
  'Partner Ticaret — işlem satır kalemleri (ürün/hizmet, adet, birim fiyat).';

-- ---------- Cari hareketler (borç / alacak) ----------
CREATE TABLE IF NOT EXISTS public.partner_trade_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  partner_id uuid NOT NULL REFERENCES public.partner_trade_partners(id) ON DELETE RESTRICT,
  transaction_id uuid REFERENCES public.partner_trade_transactions(id) ON DELETE SET NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('borc', 'alacak')),
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  note text,
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_trade_movements_partner
  ON public.partner_trade_movements (partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_trade_movements_tx
  ON public.partner_trade_movements (transaction_id)
  WHERE transaction_id IS NOT NULL;

COMMENT ON TABLE public.partner_trade_movements IS
  'Partner Ticaret cari — borc: otelin firmaya borcu artar; alacak: ödeme/tahsilat ile azalır. Bakiye = borc - alacak.';

-- ---------- updated_at ----------
CREATE OR REPLACE FUNCTION public.partner_trade_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partner_trade_partners_updated ON public.partner_trade_partners;
CREATE TRIGGER trg_partner_trade_partners_updated
  BEFORE UPDATE ON public.partner_trade_partners
  FOR EACH ROW EXECUTE FUNCTION public.partner_trade_touch_updated_at();

DROP TRIGGER IF EXISTS trg_partner_trade_transactions_updated ON public.partner_trade_transactions;
CREATE TRIGGER trg_partner_trade_transactions_updated
  BEFORE UPDATE ON public.partner_trade_transactions
  FOR EACH ROW EXECUTE FUNCTION public.partner_trade_touch_updated_at();

-- ---------- Yetki yardımcıları ----------
CREATE OR REPLACE FUNCTION public.staff_can_manage_partner_trade(p_org_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT s.role = 'admin'
      FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND COALESCE(s.is_active, true) = true
        AND s.deleted_at IS NULL
        AND (p_org_id IS NULL OR s.organization_id = p_org_id)
      LIMIT 1
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.partner_trade_current_partner_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM public.partner_trade_partners p
  WHERE p.auth_user_id = auth.uid()
    AND p.status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.partner_trade_provider_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id
  FROM public.organizations o
  WHERE o.slug = 'valoria'
  LIMIT 1;
$$;

-- ---------- Varsayılan kategoriler ----------
CREATE OR REPLACE FUNCTION public.partner_trade_seed_categories(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_names text[] := ARRAY[
    'Temizlik Malzemeleri',
    'Çamaşırhane',
    'Tekstil',
    'Transfer',
    'Teknik Servis',
    'Muhasebe',
    'Yazılım Hizmetleri',
    'Gıda Tedarikçileri',
    'Marketler',
    'Diğer'
  ];
  v_name text;
  v_i integer := 0;
BEGIN
  IF p_org_id IS NULL THEN RETURN; END IF;
  FOREACH v_name IN ARRAY v_names LOOP
    v_i := v_i + 1;
    IF NOT EXISTS (
      SELECT 1 FROM public.partner_trade_categories c
      WHERE c.organization_id = p_org_id AND lower(trim(c.name)) = lower(trim(v_name))
    ) THEN
      INSERT INTO public.partner_trade_categories (organization_id, name, sort_order)
      VALUES (p_org_id, v_name, v_i);
    END IF;
  END LOOP;
END;
$$;

-- Mevcut valoria org için seed
DO $$
DECLARE
  v_org uuid;
BEGIN
  SELECT public.partner_trade_provider_org_id() INTO v_org;
  IF v_org IS NOT NULL THEN
    PERFORM public.partner_trade_seed_categories(v_org);
  END IF;
END;
$$;

-- ---------- Bakiye hesabı ----------
CREATE OR REPLACE FUNCTION public.partner_trade_partner_balance(p_partner_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT
        COALESCE(SUM(CASE WHEN m.movement_type = 'borc' THEN m.amount ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN m.movement_type = 'alacak' THEN m.amount ELSE 0 END), 0)
      FROM public.partner_trade_movements m
      WHERE m.partner_id = p_partner_id
    ),
    0
  );
$$;

-- ---------- Partner kayıt (edge function) ----------
CREATE OR REPLACE FUNCTION public.partner_trade_register_partner(
  p_organization_id uuid,
  p_auth_id uuid,
  p_category_id uuid,
  p_company_name text,
  p_contact_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_id uuid;
  v_staff_id uuid;
BEGIN
  IF NOT public.staff_can_manage_partner_trade(p_organization_id) THEN
    RAISE EXCEPTION 'Yetkisiz';
  END IF;

  SELECT s.id INTO v_staff_id
  FROM public.staff s
  WHERE s.auth_id = auth.uid()
  LIMIT 1;

  PERFORM public.partner_trade_seed_categories(p_organization_id);

  INSERT INTO public.partner_trade_partners (
    organization_id,
    category_id,
    company_name,
    contact_name,
    phone,
    email,
    address,
    auth_user_id,
    notes,
    created_by_staff_id
  )
  VALUES (
    p_organization_id,
    p_category_id,
    trim(p_company_name),
    nullif(trim(coalesce(p_contact_name, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    lower(trim(coalesce(p_email, ''))),
    nullif(trim(coalesce(p_address, '')), ''),
    p_auth_id,
    nullif(trim(coalesce(p_notes, '')), ''),
    v_staff_id
  )
  RETURNING id INTO v_partner_id;

  RETURN v_partner_id;
END;
$$;

-- ---------- İşlem oluştur ----------
CREATE OR REPLACE FUNCTION public.partner_trade_create_transaction(
  p_partner_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_reference_code text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner public.partner_trade_partners%ROWTYPE;
  v_staff_id uuid;
  v_tx_id uuid;
  v_item jsonb;
  v_total numeric(14, 2) := 0;
  v_qty numeric(14, 3);
  v_price numeric(14, 2);
  v_line numeric(14, 2);
  v_sort integer := 0;
BEGIN
  SELECT * INTO v_partner
  FROM public.partner_trade_partners
  WHERE id = p_partner_id;

  IF v_partner.id IS NULL THEN
    RAISE EXCEPTION 'Partner bulunamadı';
  END IF;

  IF NOT public.staff_can_manage_partner_trade(v_partner.organization_id) THEN
    RAISE EXCEPTION 'Yetkisiz';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'En az bir kalem gerekli';
  END IF;

  SELECT s.id INTO v_staff_id FROM public.staff s WHERE s.auth_id = auth.uid() LIMIT 1;

  INSERT INTO public.partner_trade_transactions (
    organization_id,
    partner_id,
    reference_code,
    notes,
    status,
    total_amount,
    created_by_staff_id
  )
  VALUES (
    v_partner.organization_id,
    p_partner_id,
    nullif(trim(coalesce(p_reference_code, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    'pending_approval',
    0,
    v_staff_id
  )
  RETURNING id INTO v_tx_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_sort := v_sort + 1;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'unit_price')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 OR v_price IS NULL OR v_price < 0 THEN
      RAISE EXCEPTION 'Geçersiz kalem';
    END IF;
    v_line := round(v_qty * v_price, 2);
    v_total := v_total + v_line;

    INSERT INTO public.partner_trade_transaction_items (
      transaction_id,
      description,
      quantity,
      unit_label,
      unit_price,
      line_total,
      sort_order
    )
    VALUES (
      v_tx_id,
      trim(v_item->>'description'),
      v_qty,
      coalesce(nullif(trim(v_item->>'unit_label'), ''), 'Adet'),
      v_price,
      v_line,
      v_sort
    );
  END LOOP;

  UPDATE public.partner_trade_transactions
  SET total_amount = v_total
  WHERE id = v_tx_id;

  RETURN v_tx_id;
END;
$$;

-- ---------- Partner yanıtı (onay / itiraz) ----------
CREATE OR REPLACE FUNCTION public.partner_trade_respond_transaction(
  p_transaction_id uuid,
  p_action text,
  p_dispute_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_id uuid;
  v_tx public.partner_trade_transactions%ROWTYPE;
BEGIN
  v_partner_id := public.partner_trade_current_partner_id();
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'Partner oturumu bulunamadı';
  END IF;

  SELECT * INTO v_tx
  FROM public.partner_trade_transactions
  WHERE id = p_transaction_id
    AND partner_id = v_partner_id
  FOR UPDATE;

  IF v_tx.id IS NULL THEN
    RAISE EXCEPTION 'İşlem bulunamadı';
  END IF;

  IF v_tx.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Bu işlem zaten yanıtlanmış';
  END IF;

  IF p_action = 'approve' THEN
    UPDATE public.partner_trade_transactions
    SET status = 'approved',
        partner_response_at = now(),
        partner_dispute_note = NULL
    WHERE id = p_transaction_id;

    INSERT INTO public.partner_trade_movements (
      organization_id,
      partner_id,
      transaction_id,
      movement_type,
      amount,
      note
    )
    VALUES (
      v_tx.organization_id,
      v_partner_id,
      p_transaction_id,
      'borc',
      v_tx.total_amount,
      coalesce(v_tx.reference_code, 'Onaylanan işlem')
    );
  ELSIF p_action = 'dispute' THEN
    UPDATE public.partner_trade_transactions
    SET status = 'disputed',
        partner_response_at = now(),
        partner_dispute_note = nullif(trim(coalesce(p_dispute_note, '')), '')
    WHERE id = p_transaction_id;
  ELSE
    RAISE EXCEPTION 'Geçersiz işlem';
  END IF;
END;
$$;

-- ---------- Ödeme kaydı (admin) ----------
CREATE OR REPLACE FUNCTION public.partner_trade_record_payment(
  p_partner_id uuid,
  p_amount numeric,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner public.partner_trade_partners%ROWTYPE;
  v_staff_id uuid;
  v_movement_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Tutar pozitif olmalı';
  END IF;

  SELECT * INTO v_partner FROM public.partner_trade_partners WHERE id = p_partner_id;
  IF v_partner.id IS NULL THEN RAISE EXCEPTION 'Partner bulunamadı'; END IF;

  IF NOT public.staff_can_manage_partner_trade(v_partner.organization_id) THEN
    RAISE EXCEPTION 'Yetkisiz';
  END IF;

  SELECT s.id INTO v_staff_id FROM public.staff s WHERE s.auth_id = auth.uid() LIMIT 1;

  INSERT INTO public.partner_trade_movements (
    organization_id,
    partner_id,
    movement_type,
    amount,
    note,
    created_by_staff_id
  )
  VALUES (
    v_partner.organization_id,
    p_partner_id,
    'alacak',
    round(p_amount, 2),
    nullif(trim(coalesce(p_note, '')), ''),
    v_staff_id
  )
  RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$;

-- ---------- Partner portal: işlem listesi ----------
CREATE OR REPLACE FUNCTION public.partner_trade_partner_transactions(p_limit integer DEFAULT 50)
RETURNS TABLE(
  id uuid,
  reference_code text,
  notes text,
  status text,
  total_amount numeric,
  currency text,
  partner_response_at timestamptz,
  partner_dispute_note text,
  created_at timestamptz,
  item_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.reference_code,
    t.notes,
    t.status,
    t.total_amount,
    t.currency,
    t.partner_response_at,
    t.partner_dispute_note,
    t.created_at,
    (SELECT count(*) FROM public.partner_trade_transaction_items i WHERE i.transaction_id = t.id)
  FROM public.partner_trade_transactions t
  WHERE t.partner_id = public.partner_trade_current_partner_id()
  ORDER BY t.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
$$;

-- ---------- Partner portal: cari hareketler ----------
CREATE OR REPLACE FUNCTION public.partner_trade_partner_ledger(p_limit integer DEFAULT 100)
RETURNS TABLE(
  id uuid,
  movement_type text,
  amount numeric,
  note text,
  transaction_id uuid,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.movement_type,
    m.amount,
    m.note,
    m.transaction_id,
    m.created_at
  FROM public.partner_trade_movements m
  WHERE m.partner_id = public.partner_trade_current_partner_id()
  ORDER BY m.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 100), 500));
$$;

-- ---------- RLS ----------
ALTER TABLE public.partner_trade_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_trade_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_trade_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_trade_transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_trade_movements ENABLE ROW LEVEL SECURITY;

-- Kategoriler
DROP POLICY IF EXISTS partner_trade_categories_admin ON public.partner_trade_categories;
CREATE POLICY partner_trade_categories_admin ON public.partner_trade_categories
  FOR ALL
  USING (public.staff_can_manage_partner_trade(organization_id))
  WITH CHECK (public.staff_can_manage_partner_trade(organization_id));

DROP POLICY IF EXISTS partner_trade_categories_partner_read ON public.partner_trade_categories;
CREATE POLICY partner_trade_categories_partner_read ON public.partner_trade_categories
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.partner_trade_partners p
      WHERE p.category_id = partner_trade_categories.id
        AND p.auth_user_id = auth.uid()
        AND p.status = 'active'
    )
  );

-- Partner firmalar
DROP POLICY IF EXISTS partner_trade_partners_admin ON public.partner_trade_partners;
CREATE POLICY partner_trade_partners_admin ON public.partner_trade_partners
  FOR ALL
  USING (public.staff_can_manage_partner_trade(organization_id))
  WITH CHECK (public.staff_can_manage_partner_trade(organization_id));

DROP POLICY IF EXISTS partner_trade_partners_self_read ON public.partner_trade_partners;
CREATE POLICY partner_trade_partners_self_read ON public.partner_trade_partners
  FOR SELECT
  USING (auth_user_id = auth.uid() AND status = 'active');

-- İşlemler
DROP POLICY IF EXISTS partner_trade_transactions_admin ON public.partner_trade_transactions;
CREATE POLICY partner_trade_transactions_admin ON public.partner_trade_transactions
  FOR ALL
  USING (public.staff_can_manage_partner_trade(organization_id))
  WITH CHECK (public.staff_can_manage_partner_trade(organization_id));

DROP POLICY IF EXISTS partner_trade_transactions_partner_read ON public.partner_trade_transactions;
CREATE POLICY partner_trade_transactions_partner_read ON public.partner_trade_transactions
  FOR SELECT
  USING (partner_id = public.partner_trade_current_partner_id());

-- Kalemler
DROP POLICY IF EXISTS partner_trade_items_admin ON public.partner_trade_transaction_items;
CREATE POLICY partner_trade_items_admin ON public.partner_trade_transaction_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.partner_trade_transactions t
      WHERE t.id = transaction_id
        AND public.staff_can_manage_partner_trade(t.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.partner_trade_transactions t
      WHERE t.id = transaction_id
        AND public.staff_can_manage_partner_trade(t.organization_id)
    )
  );

DROP POLICY IF EXISTS partner_trade_items_partner_read ON public.partner_trade_transaction_items;
CREATE POLICY partner_trade_items_partner_read ON public.partner_trade_transaction_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.partner_trade_transactions t
      WHERE t.id = transaction_id
        AND t.partner_id = public.partner_trade_current_partner_id()
    )
  );

-- Hareketler
DROP POLICY IF EXISTS partner_trade_movements_admin ON public.partner_trade_movements;
CREATE POLICY partner_trade_movements_admin ON public.partner_trade_movements
  FOR ALL
  USING (public.staff_can_manage_partner_trade(organization_id))
  WITH CHECK (public.staff_can_manage_partner_trade(organization_id));

DROP POLICY IF EXISTS partner_trade_movements_partner_read ON public.partner_trade_movements;
CREATE POLICY partner_trade_movements_partner_read ON public.partner_trade_movements
  FOR SELECT
  USING (partner_id = public.partner_trade_current_partner_id());

-- ---------- GRANT ----------
GRANT SELECT ON public.partner_trade_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_trade_partners TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_trade_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_trade_transaction_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_trade_movements TO authenticated;

GRANT EXECUTE ON FUNCTION public.staff_can_manage_partner_trade(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_trade_current_partner_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_trade_provider_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_trade_seed_categories(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_trade_partner_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_trade_register_partner(uuid, uuid, uuid, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_trade_create_transaction(uuid, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_trade_respond_transaction(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_trade_record_payment(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_trade_partner_transactions(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_trade_partner_ledger(integer) TO authenticated;

COMMIT;
