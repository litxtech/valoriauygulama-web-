-- Partner otel: kendi profilini oluşturma (pending onay) + profil güncelleme

BEGIN;

ALTER TABLE public.breakfast_partner_hotels
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS self_registered boolean NOT NULL DEFAULT false;

ALTER TABLE public.breakfast_partner_hotels DROP CONSTRAINT IF EXISTS breakfast_partner_hotels_status_check;
ALTER TABLE public.breakfast_partner_hotels
  ADD CONSTRAINT breakfast_partner_hotels_status_check
  CHECK (status IN ('pending', 'active', 'suspended'));

COMMENT ON COLUMN public.breakfast_partner_hotels.self_registered IS
  'true: partner kendi kaydetti; admin onayı bekleyebilir (pending).';

INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('breakfast_partner_provider_org_slug', '"valoria"'::jsonb, now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

CREATE OR REPLACE FUNCTION public.breakfast_partner_provider_org_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
  v_org uuid;
BEGIN
  SELECT trim(both '"' from value::text) INTO v_slug
  FROM public.app_settings
  WHERE key = 'breakfast_partner_provider_org_slug'
  LIMIT 1;

  v_slug := COALESCE(NULLIF(trim(v_slug), ''), 'valoria');

  SELECT o.id INTO v_org
  FROM public.organizations o
  WHERE o.slug = v_slug
    AND COALESCE(o.is_active, true) = true
  LIMIT 1;

  IF v_org IS NULL THEN
    SELECT o.id INTO v_org
    FROM public.organizations o
    WHERE COALESCE(o.is_active, true) = true
    ORDER BY o.created_at NULLS LAST
    LIMIT 1;
  END IF;

  RETURN v_org;
END;
$$;

-- Giriş yapmış partner (pending dahil)
CREATE OR REPLACE FUNCTION public.breakfast_partner_user_hotel_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.partner_hotel_id
  FROM public.breakfast_partner_users u
  WHERE u.auth_id = auth.uid()
    AND u.is_active = true
  LIMIT 1;
$$;

-- Operasyonlar: yalnızca aktif otel
CREATE OR REPLACE FUNCTION public.breakfast_partner_current_hotel_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.id
  FROM public.breakfast_partner_users u
  JOIN public.breakfast_partner_hotels h ON h.id = u.partner_hotel_id
  WHERE u.auth_id = auth.uid()
    AND u.is_active = true
    AND h.status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.breakfast_partner_self_register(
  p_name text,
  p_contact_name text,
  p_email text,
  p_phone text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_tax_id text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_org_id uuid;
  v_auth_id uuid;
  v_counterparty_id uuid;
  v_hotel_id uuid;
BEGIN
  v_auth_id := auth.uid();
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Oturum gerekli';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.breakfast_partner_users u WHERE u.auth_id = v_auth_id
  ) THEN
    RAISE EXCEPTION 'Bu hesapta zaten partner profili var';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Otel adı gerekli';
  END IF;
  IF p_contact_name IS NULL OR length(trim(p_contact_name)) = 0 THEN
    RAISE EXCEPTION 'Yetkili adı gerekli';
  END IF;
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RAISE EXCEPTION 'E-posta gerekli';
  END IF;

  v_org_id := public.breakfast_partner_provider_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'İşletme yapılandırması bulunamadı';
  END IF;

  INSERT INTO public.finance_counterparties (
    organization_id, name, party_type, party_type_label, phone, tax_id, notes
  )
  VALUES (
    v_org_id,
    trim(p_name),
    'customer',
    'Kahvaltı partner oteli',
    NULLIF(trim(COALESCE(p_phone, '')), ''),
    NULLIF(trim(COALESCE(p_tax_id, '')), ''),
    NULLIF(trim(COALESCE(p_notes, '')), '')
  )
  RETURNING id INTO v_counterparty_id;

  INSERT INTO public.breakfast_partner_hotels (
    organization_id, counterparty_id, name, contact_name, phone, email, city, address, tax_id,
    status, notes, self_registered
  )
  VALUES (
    v_org_id, v_counterparty_id, trim(p_name),
    NULLIF(trim(p_contact_name), ''),
    NULLIF(trim(COALESCE(p_phone, '')), ''),
    lower(trim(p_email)),
    NULLIF(trim(COALESCE(p_city, '')), ''),
    NULLIF(trim(COALESCE(p_address, '')), ''),
    NULLIF(trim(COALESCE(p_tax_id, '')), ''),
    'pending',
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    true
  )
  RETURNING id INTO v_hotel_id;

  INSERT INTO public.breakfast_partner_users (partner_hotel_id, auth_id, full_name, email)
  VALUES (v_hotel_id, v_auth_id, trim(p_contact_name), lower(trim(p_email)));

  RETURN v_hotel_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.breakfast_partner_update_profile(
  p_name text,
  p_contact_name text,
  p_phone text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_tax_id text DEFAULT NULL
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
BEGIN
  v_hotel_id := public.breakfast_partner_user_hotel_id();
  IF v_hotel_id IS NULL THEN
    RAISE EXCEPTION 'Partner profili bulunamadı';
  END IF;

  SELECT * INTO v_hotel FROM public.breakfast_partner_hotels WHERE id = v_hotel_id;
  IF v_hotel.status = 'suspended' THEN
    RAISE EXCEPTION 'Hesabınız askıda';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Otel adı gerekli';
  END IF;
  IF p_contact_name IS NULL OR length(trim(p_contact_name)) = 0 THEN
    RAISE EXCEPTION 'Yetkili adı gerekli';
  END IF;

  UPDATE public.breakfast_partner_hotels
  SET
    name = trim(p_name),
    contact_name = NULLIF(trim(p_contact_name), ''),
    phone = NULLIF(trim(COALESCE(p_phone, '')), ''),
    city = NULLIF(trim(COALESCE(p_city, '')), ''),
    address = NULLIF(trim(COALESCE(p_address, '')), ''),
    tax_id = NULLIF(trim(COALESCE(p_tax_id, '')), '')
  WHERE id = v_hotel_id;

  UPDATE public.finance_counterparties
  SET
    name = trim(p_name),
    phone = NULLIF(trim(COALESCE(p_phone, '')), ''),
    tax_id = NULLIF(trim(COALESCE(p_tax_id, '')), '')
  WHERE id = v_hotel.counterparty_id;

  UPDATE public.breakfast_partner_users
  SET full_name = trim(p_contact_name)
  WHERE partner_hotel_id = v_hotel_id AND auth_id = auth.uid();

  RETURN v_hotel_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.breakfast_partner_admin_set_status(
  p_hotel_id uuid,
  p_status text,
  p_unit_price numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.breakfast_partner_hotels WHERE id = p_hotel_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Partner otel bulunamadı';
  END IF;

  IF NOT public.staff_can_manage_breakfast_partners(v_org) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_status NOT IN ('pending', 'active', 'suspended') THEN
    RAISE EXCEPTION 'Geçersiz durum';
  END IF;

  UPDATE public.breakfast_partner_hotels
  SET
    status = p_status,
    unit_price = CASE
      WHEN p_unit_price IS NOT NULL AND p_unit_price > 0 THEN p_unit_price
      ELSE unit_price
    END
  WHERE id = p_hotel_id;
END;
$$;

REVOKE ALL ON FUNCTION public.breakfast_partner_self_register(text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.breakfast_partner_self_register(text, text, text, text, text, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.breakfast_partner_update_profile(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.breakfast_partner_update_profile(text, text, text, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.breakfast_partner_admin_set_status(uuid, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.breakfast_partner_admin_set_status(uuid, text, numeric) TO authenticated;

-- Partner kendi otelini pending iken de okuyabilsin
DROP POLICY IF EXISTS "breakfast_partner_hotels_partner_read" ON public.breakfast_partner_hotels;
CREATE POLICY "breakfast_partner_hotels_partner_read" ON public.breakfast_partner_hotels
  FOR SELECT TO authenticated
  USING (id = public.breakfast_partner_user_hotel_id());

COMMIT;
