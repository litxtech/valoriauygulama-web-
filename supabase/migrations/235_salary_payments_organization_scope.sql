BEGIN;

ALTER TABLE public.salary_payments
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;

UPDATE public.salary_payments sp
SET organization_id = s.organization_id
FROM public.staff s
WHERE sp.staff_id = s.id
  AND (sp.organization_id IS NULL OR sp.organization_id IS DISTINCT FROM s.organization_id);

ALTER TABLE public.salary_payments
  ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_salary_payments_org
  ON public.salary_payments (organization_id, payment_date DESC);

CREATE OR REPLACE FUNCTION public.sync_salary_payment_organization_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  SELECT s.organization_id INTO STRICT NEW.organization_id
  FROM public.staff s
  WHERE s.id = NEW.staff_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_salary_payments_organization ON public.salary_payments;
CREATE TRIGGER trg_salary_payments_organization
  BEFORE INSERT OR UPDATE OF staff_id ON public.salary_payments
  FOR EACH ROW EXECUTE PROCEDURE public.sync_salary_payment_organization_id();

DROP POLICY IF EXISTS "salary_payments_staff_own" ON public.salary_payments;
DROP POLICY IF EXISTS "salary_payments_admin_all" ON public.salary_payments;
DROP POLICY IF EXISTS "salary_payments_admin_insert" ON public.salary_payments;
DROP POLICY IF EXISTS "salary_payments_admin_org_select" ON public.salary_payments;
DROP POLICY IF EXISTS "salary_payments_admin_org_insert" ON public.salary_payments;
DROP POLICY IF EXISTS "salary_payments_admin_org_update" ON public.salary_payments;
DROP POLICY IF EXISTS "salary_payments_admin_org_delete" ON public.salary_payments;

CREATE POLICY "salary_payments_staff_own" ON public.salary_payments
  FOR SELECT TO authenticated
  USING (
    staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
  );

CREATE POLICY "salary_payments_admin_org_select" ON public.salary_payments
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.role = 'admin' AND s.is_active = true AND s.deleted_at IS NULL
    )
  );

CREATE POLICY "salary_payments_admin_org_insert" ON public.salary_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.role = 'admin' AND s.is_active = true AND s.deleted_at IS NULL
    )
  );

CREATE POLICY "salary_payments_admin_org_update" ON public.salary_payments
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.role = 'admin' AND s.is_active = true AND s.deleted_at IS NULL
    )
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.role = 'admin' AND s.is_active = true AND s.deleted_at IS NULL
    )
  );

CREATE POLICY "salary_payments_admin_org_delete" ON public.salary_payments
  FOR DELETE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.role = 'admin' AND s.is_active = true AND s.deleted_at IS NULL
    )
  );

COMMIT;

