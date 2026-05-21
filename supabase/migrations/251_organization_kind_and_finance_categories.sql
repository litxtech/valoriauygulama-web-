-- İşletme türü (inşaat, ofis…) + işletmeye özel gelir/gider kategorileri

BEGIN;

-- create_organization: kind parametresi
CREATE OR REPLACE FUNCTION public.create_organization_with_defaults(
  p_name text,
  p_slug text,
  p_city text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_logo_url text DEFAULT NULL,
  p_currency_code text DEFAULT 'TRY',
  p_manager_staff_id uuid DEFAULT NULL,
  p_kind text DEFAULT 'hotel'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_kind text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.auth_id = auth.uid() AND s.role = 'admin' AND s.is_active = true AND s.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'organization name required';
  END IF;
  IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RAISE EXCEPTION 'organization slug required';
  END IF;

  v_kind := COALESCE(NULLIF(trim(p_kind), ''), 'hotel');
  IF v_kind NOT IN ('hotel', 'tour_office', 'construction', 'office', 'general') THEN
    RAISE EXCEPTION 'invalid organization kind';
  END IF;

  INSERT INTO public.organizations (
    name, slug, kind, city, address, phone, email, logo_url, currency_code, manager_staff_id
  )
  VALUES (
    trim(p_name), lower(trim(p_slug)), v_kind,
    NULLIF(trim(COALESCE(p_city, '')), ''), NULLIF(trim(COALESCE(p_address, '')), ''),
    NULLIF(trim(COALESCE(p_phone, '')), ''), NULLIF(trim(COALESCE(p_email, '')), ''),
    NULLIF(trim(COALESCE(p_logo_url, '')), ''),
    COALESCE(NULLIF(trim(COALESCE(p_currency_code, '')), ''), 'TRY'), p_manager_staff_id
  )
  RETURNING id INTO v_org_id;

  IF p_manager_staff_id IS NOT NULL THEN
    UPDATE public.staff SET organization_id = v_org_id WHERE id = p_manager_staff_id;
  END IF;

  PERFORM public.seed_finance_categories_for_org(v_org_id, v_kind);

  RETURN v_org_id;
END;
$$;

-- update_organization: kind
CREATE OR REPLACE FUNCTION public.update_organization_admin(
  p_org_id uuid,
  p_name text,
  p_slug text,
  p_city text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_logo_url text DEFAULT NULL,
  p_currency_code text DEFAULT 'TRY',
  p_is_active boolean DEFAULT true,
  p_manager_staff_id uuid DEFAULT NULL,
  p_kind text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.auth_id = auth.uid() AND s.role = 'admin' AND s.is_active = true AND s.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.organizations
  SET
    name = trim(p_name),
    slug = lower(trim(p_slug)),
    city = NULLIF(trim(COALESCE(p_city, '')), ''),
    address = NULLIF(trim(COALESCE(p_address, '')), ''),
    phone = NULLIF(trim(COALESCE(p_phone, '')), ''),
    email = NULLIF(trim(COALESCE(p_email, '')), ''),
    logo_url = NULLIF(trim(COALESCE(p_logo_url, '')), ''),
    currency_code = COALESCE(NULLIF(trim(COALESCE(p_currency_code, '')), ''), 'TRY'),
    is_active = COALESCE(p_is_active, true),
    manager_staff_id = p_manager_staff_id,
    kind = COALESCE(NULLIF(trim(COALESCE(p_kind, '')), ''), kind)
  WHERE id = p_org_id;

  IF p_manager_staff_id IS NOT NULL THEN
    UPDATE public.staff SET organization_id = p_org_id WHERE id = p_manager_staff_id;
  END IF;
END;
$$;

-- ---------- Kategoriler ----------
CREATE TABLE IF NOT EXISTS public.finance_movement_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  applies_to text NOT NULL DEFAULT 'both'
    CHECK (applies_to IN ('income', 'expense', 'both')),
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_movement_categories_code_not_blank CHECK (length(trim(code)) > 0),
  CONSTRAINT finance_movement_categories_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT finance_movement_categories_org_code_uidx UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_finance_movement_categories_org
  ON public.finance_movement_categories (organization_id, sort_order);

ALTER TABLE public.finance_movement_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_movement_categories_select" ON public.finance_movement_categories;
CREATE POLICY "finance_movement_categories_select" ON public.finance_movement_categories
  FOR SELECT TO authenticated USING (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_movement_categories_insert" ON public.finance_movement_categories;
CREATE POLICY "finance_movement_categories_insert" ON public.finance_movement_categories
  FOR INSERT TO authenticated WITH CHECK (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_movement_categories_update" ON public.finance_movement_categories;
CREATE POLICY "finance_movement_categories_update" ON public.finance_movement_categories
  FOR UPDATE TO authenticated USING (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  )
  WITH CHECK (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_movement_categories_delete" ON public.finance_movement_categories;
CREATE POLICY "finance_movement_categories_delete" ON public.finance_movement_categories
  FOR DELETE TO authenticated USING (public.staff_is_admin_active());

-- Varsayılan kategori tohumları
CREATE OR REPLACE FUNCTION public.seed_finance_categories_for_org(p_org_id uuid, p_kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.finance_movement_categories WHERE organization_id = p_org_id LIMIT 1) THEN
    RETURN;
  END IF;

  IF p_kind = 'construction' THEN
    INSERT INTO public.finance_movement_categories (organization_id, code, name, applies_to, sort_order) VALUES
      (p_org_id, 'sales', 'Hakediş / Tahsilat', 'income', 1),
      (p_org_id, 'advance', 'Avans', 'income', 2),
      (p_org_id, 'material', 'Malzeme', 'expense', 10),
      (p_org_id, 'subcontract', 'Taşeron', 'expense', 11),
      (p_org_id, 'labor', 'İşçilik', 'expense', 12),
      (p_org_id, 'equipment', 'İş makinesi / Ekipman', 'expense', 13),
      (p_org_id, 'fuel', 'Yakıt', 'expense', 14),
      (p_org_id, 'other', 'Diğer', 'both', 99);
  ELSIF p_kind = 'office' OR p_kind = 'general' THEN
    INSERT INTO public.finance_movement_categories (organization_id, code, name, applies_to, sort_order) VALUES
      (p_org_id, 'sales', 'Gelir / Tahsilat', 'income', 1),
      (p_org_id, 'advance', 'Avans', 'income', 2),
      (p_org_id, 'rent', 'Kira', 'expense', 10),
      (p_org_id, 'utility', 'Fatura', 'expense', 11),
      (p_org_id, 'office', 'Ofis gideri', 'expense', 12),
      (p_org_id, 'salary', 'Personel / Maaş', 'expense', 13),
      (p_org_id, 'other', 'Diğer', 'both', 99);
  ELSE
    INSERT INTO public.finance_movement_categories (organization_id, code, name, applies_to, sort_order) VALUES
      (p_org_id, 'sales', 'Satış / Tahsilat', 'income', 1),
      (p_org_id, 'advance', 'Avans', 'income', 2),
      (p_org_id, 'material', 'Malzeme', 'expense', 10),
      (p_org_id, 'food', 'Yemek / İkram', 'expense', 11),
      (p_org_id, 'utility', 'Fatura', 'expense', 12),
      (p_org_id, 'salary', 'Personel', 'expense', 13),
      (p_org_id, 'other', 'Diğer', 'both', 99);
  END IF;
END;
$$;

-- Mevcut işletmelere kategori (yoksa)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, kind FROM public.organizations LOOP
    PERFORM public.seed_finance_categories_for_org(r.id, COALESCE(r.kind, 'hotel'));
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_finance_categories_for_org(uuid, text) TO authenticated;

COMMIT;
