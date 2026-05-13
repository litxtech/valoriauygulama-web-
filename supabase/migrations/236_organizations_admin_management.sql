BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'TRY',
  ADD COLUMN IF NOT EXISTS manager_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.touch_organizations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE PROCEDURE public.touch_organizations_updated_at();

CREATE OR REPLACE FUNCTION public.create_organization_with_defaults(
  p_name text,
  p_slug text,
  p_city text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_logo_url text DEFAULT NULL,
  p_currency_code text DEFAULT 'TRY',
  p_manager_staff_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
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

  INSERT INTO public.organizations (
    name, slug, city, address, phone, email, logo_url, currency_code, manager_staff_id
  )
  VALUES (
    trim(p_name), lower(trim(p_slug)), NULLIF(trim(p_city), ''), NULLIF(trim(p_address), ''),
    NULLIF(trim(p_phone), ''), NULLIF(trim(p_email), ''), NULLIF(trim(p_logo_url), ''),
    COALESCE(NULLIF(trim(p_currency_code), ''), 'TRY'), p_manager_staff_id
  )
  RETURNING id INTO v_org_id;

  IF p_manager_staff_id IS NOT NULL THEN
    UPDATE public.staff
    SET organization_id = v_org_id
    WHERE id = p_manager_staff_id;
  END IF;

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_organization_with_defaults(
  text, text, text, text, text, text, text, text, uuid
) TO authenticated;

COMMIT;

