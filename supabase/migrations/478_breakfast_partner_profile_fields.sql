-- Partner profil: otel logosu, fatura alanları, genişletilmiş profil güncelleme

BEGIN;

ALTER TABLE public.breakfast_partner_hotels
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS tax_office text,
  ADD COLUMN IF NOT EXISTS iban text;

COMMENT ON COLUMN public.breakfast_partner_hotels.logo_url IS 'Partner otel logosu (public storage URL)';
COMMENT ON COLUMN public.breakfast_partner_hotels.tax_office IS 'Vergi dairesi';
COMMENT ON COLUMN public.breakfast_partner_hotels.iban IS 'Tahsilat IBAN';

CREATE OR REPLACE FUNCTION public.breakfast_partner_update_profile(
  p_name text,
  p_contact_name text,
  p_phone text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_tax_id text DEFAULT NULL,
  p_tax_office text DEFAULT NULL,
  p_iban text DEFAULT NULL
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
  v_iban text;
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

  v_iban := NULLIF(upper(replace(trim(COALESCE(p_iban, '')), ' ', '')), '');

  UPDATE public.breakfast_partner_hotels
  SET
    name = trim(p_name),
    contact_name = NULLIF(trim(p_contact_name), ''),
    phone = NULLIF(trim(COALESCE(p_phone, '')), ''),
    city = NULLIF(trim(COALESCE(p_city, '')), ''),
    address = NULLIF(trim(COALESCE(p_address, '')), ''),
    tax_id = NULLIF(trim(COALESCE(p_tax_id, '')), ''),
    tax_office = NULLIF(trim(COALESCE(p_tax_office, '')), ''),
    iban = v_iban
  WHERE id = v_hotel_id;

  UPDATE public.finance_counterparties
  SET
    name = trim(p_name),
    phone = NULLIF(trim(COALESCE(p_phone, '')), ''),
    tax_id = NULLIF(trim(COALESCE(p_tax_id, '')), ''),
    address = NULLIF(trim(COALESCE(p_address, '')), ''),
    tax_office = NULLIF(trim(COALESCE(p_tax_office, '')), ''),
    extra_info = CASE
      WHEN v_iban IS NOT NULL THEN 'IBAN: ' || v_iban
      ELSE NULL
    END
  WHERE id = v_hotel.counterparty_id;

  UPDATE public.breakfast_partner_users
  SET full_name = trim(p_contact_name)
  WHERE partner_hotel_id = v_hotel_id AND auth_id = auth.uid();

  RETURN v_hotel_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.breakfast_partner_update_logo(p_logo_url text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_hotel_id uuid;
  v_status text;
BEGIN
  v_hotel_id := public.breakfast_partner_user_hotel_id();
  IF v_hotel_id IS NULL THEN
    RAISE EXCEPTION 'Partner profili bulunamadı';
  END IF;

  SELECT status INTO v_status FROM public.breakfast_partner_hotels WHERE id = v_hotel_id;
  IF v_status = 'suspended' THEN
    RAISE EXCEPTION 'Hesabınız askıda';
  END IF;

  UPDATE public.breakfast_partner_hotels
  SET logo_url = NULLIF(trim(COALESCE(p_logo_url, '')), '')
  WHERE id = v_hotel_id;

  RETURN v_hotel_id;
END;
$$;

REVOKE ALL ON FUNCTION public.breakfast_partner_update_profile(text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.breakfast_partner_update_profile(text, text, text, text, text, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.breakfast_partner_update_logo(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.breakfast_partner_update_logo(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.breakfast_partner_register_hotel(
  p_organization_id uuid,
  p_auth_id uuid,
  p_name text,
  p_contact_name text,
  p_email text,
  p_phone text DEFAULT NULL,
  p_city text DEFAULT NULL,
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
    organization_id, counterparty_id, name, contact_name, phone, email, city, address, tax_id,
    unit_price, notes, created_by_staff_id
  )
  VALUES (
    p_organization_id, v_counterparty_id, trim(p_name),
    NULLIF(trim(COALESCE(p_contact_name, '')), ''),
    NULLIF(trim(COALESCE(p_phone, '')), ''),
    lower(trim(p_email)),
    NULLIF(trim(COALESCE(p_city, '')), ''),
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

COMMIT;
