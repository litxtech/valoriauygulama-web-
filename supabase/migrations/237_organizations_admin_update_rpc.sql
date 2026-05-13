BEGIN;

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
  p_manager_staff_id uuid DEFAULT NULL
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
    manager_staff_id = p_manager_staff_id
  WHERE id = p_org_id;

  IF p_manager_staff_id IS NOT NULL THEN
    UPDATE public.staff
    SET organization_id = p_org_id
    WHERE id = p_manager_staff_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_organization_admin(
  uuid, text, text, text, text, text, text, text, text, boolean, uuid
) TO authenticated;

COMMIT;

