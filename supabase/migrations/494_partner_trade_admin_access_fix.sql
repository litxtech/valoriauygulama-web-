-- Partner Ticaret: admin rolü org eşleşmesi olmadan yönetebilsin (valoria provider org).

BEGIN;

CREATE OR REPLACE FUNCTION public.staff_can_manage_partner_trade(p_org_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT
        s.role = 'admin'
        OR public.staff_has_app_permission('super_admin')
      FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND COALESCE(s.is_active, true) = true
        AND s.deleted_at IS NULL
        AND (
          p_org_id IS NULL
          OR s.organization_id = p_org_id
          OR s.role = 'admin'
          OR public.staff_has_app_permission('super_admin')
        )
      LIMIT 1
    ),
    false
  );
$$;

-- Provider org: valoria yoksa tek işletmeyi veya ilk aktif org'u kullan
CREATE OR REPLACE FUNCTION public.partner_trade_provider_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT o.id FROM public.organizations o WHERE o.slug = 'valoria' LIMIT 1),
    (SELECT o.id FROM public.organizations o ORDER BY o.created_at NULLS LAST LIMIT 1)
  );
$$;

COMMIT;
