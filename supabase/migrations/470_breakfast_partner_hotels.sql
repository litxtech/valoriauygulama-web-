-- Kahvaltı partner otelleri: ayrı modül — admin hesap açar, partner günlük kişi sayısı girer, cariye alacak işlenir.

BEGIN;

-- ---------- Ayarlar (işletme bazlı varsayılan birim fiyat) ----------
CREATE TABLE IF NOT EXISTS public.breakfast_partner_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  default_unit_price numeric(14, 2) NOT NULL DEFAULT 0 CHECK (default_unit_price >= 0),
  feature_enabled boolean NOT NULL DEFAULT true,
  updated_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.breakfast_partner_settings IS
  'Kahvaltı partner oteli modülü — varsayılan kişi başı ücret ve açık/kapalı.';

-- ---------- Partner otel ----------
CREATE TABLE IF NOT EXISTS public.breakfast_partner_hotels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  counterparty_id uuid NOT NULL REFERENCES public.finance_counterparties(id) ON DELETE RESTRICT,
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  address text,
  tax_id text,
  unit_price numeric(14, 2) CHECK (unit_price IS NULL OR unit_price >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  notes text,
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT breakfast_partner_hotels_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_breakfast_partner_hotels_org
  ON public.breakfast_partner_hotels (organization_id, status, name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_breakfast_partner_hotels_counterparty
  ON public.breakfast_partner_hotels (counterparty_id);

-- ---------- Partner kullanıcı (auth.users) ----------
CREATE TABLE IF NOT EXISTS public.breakfast_partner_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_hotel_id uuid NOT NULL REFERENCES public.breakfast_partner_hotels(id) ON DELETE CASCADE,
  auth_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT breakfast_partner_users_name_not_blank CHECK (length(trim(full_name)) > 0),
  CONSTRAINT breakfast_partner_users_email_not_blank CHECK (length(trim(email)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_breakfast_partner_users_auth
  ON public.breakfast_partner_users (auth_id);

CREATE INDEX IF NOT EXISTS idx_breakfast_partner_users_hotel
  ON public.breakfast_partner_users (partner_hotel_id);

-- ---------- Günlük kayıt ----------
CREATE TABLE IF NOT EXISTS public.breakfast_partner_daily_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_hotel_id uuid NOT NULL REFERENCES public.breakfast_partner_hotels(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  record_date date NOT NULL,
  guest_count integer NOT NULL DEFAULT 0 CHECK (guest_count >= 0),
  unit_price_snapshot numeric(14, 2) NOT NULL DEFAULT 0 CHECK (unit_price_snapshot >= 0),
  line_total numeric(14, 2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  note text,
  agreement_id uuid REFERENCES public.finance_counterparty_agreements(id) ON DELETE SET NULL,
  created_by_auth_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_auth_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT breakfast_partner_daily_entries_date_unique UNIQUE (partner_hotel_id, record_date)
);

CREATE INDEX IF NOT EXISTS idx_breakfast_partner_entries_hotel_date
  ON public.breakfast_partner_daily_entries (partner_hotel_id, record_date DESC);

CREATE INDEX IF NOT EXISTS idx_breakfast_partner_entries_org_date
  ON public.breakfast_partner_daily_entries (organization_id, record_date DESC);

-- ---------- updated_at ----------
CREATE OR REPLACE FUNCTION public.breakfast_partner_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_breakfast_partner_hotels_updated ON public.breakfast_partner_hotels;
CREATE TRIGGER trg_breakfast_partner_hotels_updated
  BEFORE UPDATE ON public.breakfast_partner_hotels
  FOR EACH ROW EXECUTE FUNCTION public.breakfast_partner_touch_updated_at();

DROP TRIGGER IF EXISTS trg_breakfast_partner_entries_updated ON public.breakfast_partner_daily_entries;
CREATE TRIGGER trg_breakfast_partner_entries_updated
  BEFORE UPDATE ON public.breakfast_partner_daily_entries
  FOR EACH ROW EXECUTE FUNCTION public.breakfast_partner_touch_updated_at();

DROP TRIGGER IF EXISTS trg_breakfast_partner_settings_updated ON public.breakfast_partner_settings;
CREATE TRIGGER trg_breakfast_partner_settings_updated
  BEFORE UPDATE ON public.breakfast_partner_settings
  FOR EACH ROW EXECUTE FUNCTION public.breakfast_partner_touch_updated_at();

-- ---------- Yetki yardımcıları ----------
CREATE OR REPLACE FUNCTION public.staff_can_manage_breakfast_partners(p_org_id uuid DEFAULT NULL)
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

CREATE OR REPLACE FUNCTION public.breakfast_partner_current_hotel_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.partner_hotel_id
  FROM public.breakfast_partner_users u
  JOIN public.breakfast_partner_hotels h ON h.id = u.partner_hotel_id
  WHERE u.auth_id = auth.uid()
    AND u.is_active = true
    AND h.status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.breakfast_partner_resolve_unit_price(p_hotel_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_hotel_price numeric;
  v_default numeric;
BEGIN
  SELECT h.organization_id, h.unit_price
  INTO v_org, v_hotel_price
  FROM public.breakfast_partner_hotels h
  WHERE h.id = p_hotel_id;

  IF v_org IS NULL THEN
    RETURN 0;
  END IF;

  IF v_hotel_price IS NOT NULL AND v_hotel_price > 0 THEN
    RETURN v_hotel_price;
  END IF;

  SELECT s.default_unit_price INTO v_default
  FROM public.breakfast_partner_settings s
  WHERE s.organization_id = v_org;

  RETURN COALESCE(v_default, 0);
END;
$$;

-- ---------- Partner günlük kayıt (cari alacak ile) ----------
CREATE OR REPLACE FUNCTION public.breakfast_partner_upsert_daily_entry(
  p_record_date date,
  p_guest_count integer,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_hotel_id uuid;
  v_hotel record;
  v_unit_price numeric;
  v_line_total numeric;
  v_entry_id uuid;
  v_agreement_id uuid;
  v_title text;
  v_today date;
BEGIN
  v_hotel_id := public.breakfast_partner_current_hotel_id();
  IF v_hotel_id IS NULL THEN
    RAISE EXCEPTION 'Partner otel hesabı bulunamadı veya askıda.';
  END IF;

  SELECT * INTO v_hotel FROM public.breakfast_partner_hotels h WHERE h.id = v_hotel_id;
  IF NOT FOUND OR v_hotel.status <> 'active' THEN
    RAISE EXCEPTION 'Partner otel aktif değil.';
  END IF;

  v_today := (timezone('Europe/Istanbul', now()))::date;
  IF p_record_date > v_today THEN
    RAISE EXCEPTION 'İleri tarih için kayıt girilemez.';
  END IF;
  IF p_record_date < v_today - 30 THEN
    RAISE EXCEPTION 'En fazla son 30 gün için kayıt girilebilir.';
  END IF;
  IF p_guest_count IS NULL OR p_guest_count < 0 THEN
    RAISE EXCEPTION 'Kişi sayısı geçersiz.';
  END IF;

  v_unit_price := public.breakfast_partner_resolve_unit_price(v_hotel_id);
  IF p_guest_count > 0 AND COALESCE(v_unit_price, 0) <= 0 THEN
    RAISE EXCEPTION 'Birim fiyat tanımlı değil. Yöneticinizle iletişime geçin.';
  END IF;

  v_line_total := round(p_guest_count * COALESCE(v_unit_price, 0), 2);
  v_title := 'Kahvaltı ' || to_char(p_record_date, 'DD.MM.YYYY') || ' — ' || p_guest_count::text || ' kişi';

  SELECT e.id, e.agreement_id
  INTO v_entry_id, v_agreement_id
  FROM public.breakfast_partner_daily_entries e
  WHERE e.partner_hotel_id = v_hotel_id AND e.record_date = p_record_date;

  IF v_entry_id IS NULL THEN
    INSERT INTO public.breakfast_partner_daily_entries (
      partner_hotel_id, organization_id, record_date, guest_count,
      unit_price_snapshot, line_total, note, created_by_auth_id, updated_by_auth_id
    )
    VALUES (
      v_hotel_id, v_hotel.organization_id, p_record_date, p_guest_count,
      COALESCE(v_unit_price, 0), v_line_total, NULLIF(trim(COALESCE(p_note, '')), ''),
      auth.uid(), auth.uid()
    )
    RETURNING id INTO v_entry_id;
  ELSE
    UPDATE public.breakfast_partner_daily_entries
    SET
      guest_count = p_guest_count,
      unit_price_snapshot = COALESCE(v_unit_price, 0),
      line_total = v_line_total,
      note = NULLIF(trim(COALESCE(p_note, '')), ''),
      updated_by_auth_id = auth.uid()
    WHERE id = v_entry_id;
  END IF;

  IF p_guest_count <= 0 OR v_line_total <= 0 THEN
    IF v_agreement_id IS NOT NULL THEN
      UPDATE public.finance_counterparty_agreements
      SET status = 'cancelled', is_active = false, updated_at = now()
      WHERE id = v_agreement_id;
      UPDATE public.breakfast_partner_daily_entries
      SET agreement_id = NULL WHERE id = v_entry_id;
    END IF;
    RETURN v_entry_id;
  END IF;

  IF v_agreement_id IS NULL THEN
    INSERT INTO public.finance_counterparty_agreements (
      organization_id, counterparty_id, title, target_amount,
      started_on, notes, movement_kind, is_active, status
    )
    VALUES (
      v_hotel.organization_id, v_hotel.counterparty_id, v_title, v_line_total,
      p_record_date, NULLIF(trim(COALESCE(p_note, '')), ''), 'income', true, 'open'
    )
    RETURNING id INTO v_agreement_id;

    UPDATE public.breakfast_partner_daily_entries
    SET agreement_id = v_agreement_id
    WHERE id = v_entry_id;
  ELSE
    UPDATE public.finance_counterparty_agreements
    SET
      title = v_title,
      target_amount = v_line_total,
      started_on = p_record_date,
      notes = NULLIF(trim(COALESCE(p_note, '')), ''),
      status = CASE WHEN status = 'cancelled' THEN 'open' ELSE status END,
      is_active = true,
      updated_at = now()
    WHERE id = v_agreement_id;

    PERFORM public.finance_agreement_recalc(v_agreement_id);
  END IF;

  RETURN v_entry_id;
END;
$$;

-- Partner otel + cari oluşturma (edge function sonrası veya admin RPC)
CREATE OR REPLACE FUNCTION public.breakfast_partner_register_hotel(
  p_organization_id uuid,
  p_auth_id uuid,
  p_name text,
  p_contact_name text,
  p_email text,
  p_phone text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_tax_id text DEFAULT NULL,
  p_unit_price numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_staff_id uuid;
  v_counterparty_id uuid;
  v_hotel_id uuid;
BEGIN
  IF NOT public.staff_can_manage_breakfast_partners(p_organization_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Otel adı gerekli';
  END IF;
  IF p_auth_id IS NULL THEN
    RAISE EXCEPTION 'auth_id gerekli';
  END IF;
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RAISE EXCEPTION 'E-posta gerekli';
  END IF;

  SELECT s.id INTO v_staff_id
  FROM public.staff s
  WHERE s.auth_id = auth.uid() AND s.role = 'admin' AND s.is_active = true
  LIMIT 1;

  INSERT INTO public.finance_counterparties (
    organization_id, name, party_type, party_type_label, phone, tax_id, notes, created_by_staff_id
  )
  VALUES (
    p_organization_id,
    trim(p_name),
    'customer',
    'Kahvaltı partner oteli',
    NULLIF(trim(COALESCE(p_phone, '')), ''),
    NULLIF(trim(COALESCE(p_tax_id, '')), ''),
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    v_staff_id
  )
  RETURNING id INTO v_counterparty_id;

  INSERT INTO public.breakfast_partner_hotels (
    organization_id, counterparty_id, name, contact_name, phone, email, address, tax_id,
    unit_price, notes, created_by_staff_id
  )
  VALUES (
    p_organization_id, v_counterparty_id, trim(p_name),
    NULLIF(trim(COALESCE(p_contact_name, '')), ''),
    NULLIF(trim(COALESCE(p_phone, '')), ''),
    lower(trim(p_email)),
    NULLIF(trim(COALESCE(p_address, '')), ''),
    NULLIF(trim(COALESCE(p_tax_id, '')), ''),
    CASE WHEN p_unit_price IS NOT NULL AND p_unit_price > 0 THEN p_unit_price ELSE NULL END,
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    v_staff_id
  )
  RETURNING id INTO v_hotel_id;

  INSERT INTO public.breakfast_partner_users (partner_hotel_id, auth_id, full_name, email)
  VALUES (
    v_hotel_id,
    p_auth_id,
    COALESCE(NULLIF(trim(COALESCE(p_contact_name, '')), ''), trim(p_name)),
    lower(trim(p_email))
  );

  RETURN v_hotel_id;
END;
$$;

REVOKE ALL ON FUNCTION public.breakfast_partner_register_hotel(uuid, uuid, text, text, text, text, text, text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.breakfast_partner_register_hotel(uuid, uuid, text, text, text, text, text, text, numeric, text) TO authenticated;

REVOKE ALL ON FUNCTION public.breakfast_partner_upsert_daily_entry(date, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.breakfast_partner_upsert_daily_entry(date, integer, text) TO authenticated;

-- ---------- RLS ----------
ALTER TABLE public.breakfast_partner_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.breakfast_partner_hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.breakfast_partner_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.breakfast_partner_daily_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "breakfast_partner_settings_admin" ON public.breakfast_partner_settings;
CREATE POLICY "breakfast_partner_settings_admin" ON public.breakfast_partner_settings
  FOR ALL TO authenticated
  USING (public.staff_can_manage_breakfast_partners(organization_id))
  WITH CHECK (public.staff_can_manage_breakfast_partners(organization_id));

DROP POLICY IF EXISTS "breakfast_partner_settings_partner_read" ON public.breakfast_partner_settings;
CREATE POLICY "breakfast_partner_settings_partner_read" ON public.breakfast_partner_settings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.breakfast_partner_hotels h
      WHERE h.organization_id = breakfast_partner_settings.organization_id
        AND h.id = public.breakfast_partner_current_hotel_id()
    )
  );

DROP POLICY IF EXISTS "breakfast_partner_hotels_admin" ON public.breakfast_partner_hotels;
CREATE POLICY "breakfast_partner_hotels_admin" ON public.breakfast_partner_hotels
  FOR ALL TO authenticated
  USING (public.staff_can_manage_breakfast_partners(organization_id))
  WITH CHECK (public.staff_can_manage_breakfast_partners(organization_id));

DROP POLICY IF EXISTS "breakfast_partner_hotels_partner_read" ON public.breakfast_partner_hotels;
CREATE POLICY "breakfast_partner_hotels_partner_read" ON public.breakfast_partner_hotels
  FOR SELECT TO authenticated
  USING (id = public.breakfast_partner_current_hotel_id());

DROP POLICY IF EXISTS "breakfast_partner_users_admin" ON public.breakfast_partner_users;
CREATE POLICY "breakfast_partner_users_admin" ON public.breakfast_partner_users
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.breakfast_partner_hotels h
      WHERE h.id = breakfast_partner_users.partner_hotel_id
        AND public.staff_can_manage_breakfast_partners(h.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.breakfast_partner_hotels h
      WHERE h.id = breakfast_partner_users.partner_hotel_id
        AND public.staff_can_manage_breakfast_partners(h.organization_id)
    )
  );

DROP POLICY IF EXISTS "breakfast_partner_users_self" ON public.breakfast_partner_users;
CREATE POLICY "breakfast_partner_users_self" ON public.breakfast_partner_users
  FOR SELECT TO authenticated
  USING (auth_id = auth.uid());

DROP POLICY IF EXISTS "breakfast_partner_entries_admin" ON public.breakfast_partner_daily_entries;
CREATE POLICY "breakfast_partner_entries_admin" ON public.breakfast_partner_daily_entries
  FOR ALL TO authenticated
  USING (public.staff_can_manage_breakfast_partners(organization_id))
  WITH CHECK (public.staff_can_manage_breakfast_partners(organization_id));

DROP POLICY IF EXISTS "breakfast_partner_entries_partner" ON public.breakfast_partner_daily_entries;
CREATE POLICY "breakfast_partner_entries_partner" ON public.breakfast_partner_daily_entries
  FOR SELECT TO authenticated
  USING (partner_hotel_id = public.breakfast_partner_current_hotel_id());

GRANT SELECT ON public.breakfast_partner_settings TO authenticated;
GRANT SELECT ON public.breakfast_partner_hotels TO authenticated;
GRANT SELECT ON public.breakfast_partner_users TO authenticated;
GRANT SELECT ON public.breakfast_partner_daily_entries TO authenticated;

COMMIT;
