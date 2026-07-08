-- Maaş ödemesi: RLS düzeltmesi (maas_yonetimi yetkisi + org), entry_kind, güvenli RPC

BEGIN;

ALTER TABLE public.salary_payments
  ADD COLUMN IF NOT EXISTS entry_kind text NOT NULL DEFAULT 'regular';

ALTER TABLE public.salary_payments
  DROP CONSTRAINT IF EXISTS salary_payments_entry_kind_check;

ALTER TABLE public.salary_payments
  ADD CONSTRAINT salary_payments_entry_kind_check
  CHECK (entry_kind IN ('regular', 'bonus', 'early_partial'));

CREATE OR REPLACE FUNCTION public.staff_can_manage_salary_payments()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.current_user_is_staff_admin()
    OR public.staff_has_app_permission('maas_yonetimi')
    OR public.staff_has_app_permission('super_admin');
$$;

CREATE OR REPLACE FUNCTION public.staff_can_access_salary_org(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_org_id IS NOT NULL
    AND (
      public.staff_has_app_permission('super_admin')
      OR p_org_id = public.current_staff_organization_id()
      OR EXISTS (
        SELECT 1
        FROM public.staff s
        WHERE s.auth_id = auth.uid()
          AND s.is_active = true
          AND s.deleted_at IS NULL
          AND s.organization_id = p_org_id
      )
    );
$$;

DROP POLICY IF EXISTS "salary_payments_admin_org_select" ON public.salary_payments;
DROP POLICY IF EXISTS "salary_payments_admin_org_insert" ON public.salary_payments;
DROP POLICY IF EXISTS "salary_payments_admin_org_update" ON public.salary_payments;
DROP POLICY IF EXISTS "salary_payments_admin_org_delete" ON public.salary_payments;
DROP POLICY IF EXISTS "salary_payments_staff_own_update" ON public.salary_payments;

CREATE POLICY "salary_payments_admin_org_select" ON public.salary_payments
  FOR SELECT TO authenticated
  USING (
    public.staff_can_manage_salary_payments()
    AND public.staff_can_access_salary_org(organization_id)
  );

CREATE POLICY "salary_payments_admin_org_insert" ON public.salary_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.staff_can_manage_salary_payments()
    AND public.staff_can_access_salary_org(organization_id)
    AND EXISTS (
      SELECT 1
      FROM public.staff target
      WHERE target.id = staff_id
        AND target.organization_id = organization_id
        AND target.is_active = true
        AND target.deleted_at IS NULL
    )
  );

CREATE POLICY "salary_payments_admin_org_update" ON public.salary_payments
  FOR UPDATE TO authenticated
  USING (
    public.staff_can_manage_salary_payments()
    AND public.staff_can_access_salary_org(organization_id)
  )
  WITH CHECK (
    public.staff_can_manage_salary_payments()
    AND public.staff_can_access_salary_org(organization_id)
  );

CREATE POLICY "salary_payments_admin_org_delete" ON public.salary_payments
  FOR DELETE TO authenticated
  USING (
    public.staff_can_manage_salary_payments()
    AND public.staff_can_access_salary_org(organization_id)
  );

CREATE POLICY "salary_payments_staff_own_update" ON public.salary_payments
  FOR UPDATE TO authenticated
  USING (
    staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
    AND status = 'pending_approval'
  )
  WITH CHECK (
    staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.admin_create_salary_payment(
  p_staff_id uuid,
  p_period_month integer,
  p_period_year integer,
  p_amount numeric,
  p_payment_date date,
  p_payment_time time DEFAULT NULL,
  p_payment_type text DEFAULT 'transfer',
  p_bank_or_reference text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_entry_kind text DEFAULT 'regular'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_creator uuid;
  v_id uuid;
BEGIN
  IF NOT public.staff_can_manage_salary_payments() THEN
    RAISE EXCEPTION 'Maaş ödeme yetkiniz yok';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Geçerli tutar girin';
  END IF;

  IF p_entry_kind NOT IN ('regular', 'bonus', 'early_partial') THEN
    RAISE EXCEPTION 'Geçersiz ödeme türü';
  END IF;

  IF p_payment_type NOT IN ('transfer', 'cash', 'credit_card') THEN
    RAISE EXCEPTION 'Geçersiz ödeme yöntemi';
  END IF;

  SELECT organization_id
  INTO STRICT v_org_id
  FROM public.staff
  WHERE id = p_staff_id
    AND is_active = true
    AND deleted_at IS NULL;

  IF NOT public.staff_can_access_salary_org(v_org_id) THEN
    RAISE EXCEPTION 'Bu işletme için maaş ödeme yetkiniz yok';
  END IF;

  v_creator := public.current_staff_id();

  INSERT INTO public.salary_payments (
    staff_id,
    organization_id,
    period_month,
    period_year,
    amount,
    payment_date,
    payment_time,
    payment_type,
    bank_or_reference,
    description,
    entry_kind,
    status,
    created_by
  )
  VALUES (
    p_staff_id,
    v_org_id,
    p_period_month,
    p_period_year,
    p_amount,
    p_payment_date,
    p_payment_time,
    p_payment_type,
    NULLIF(trim(p_bank_or_reference), ''),
    NULLIF(trim(p_description), ''),
    p_entry_kind,
    'pending_approval',
    v_creator
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_salary_payment(
  uuid, integer, integer, numeric, date, time, text, text, text, text
) TO authenticated;

COMMIT;
