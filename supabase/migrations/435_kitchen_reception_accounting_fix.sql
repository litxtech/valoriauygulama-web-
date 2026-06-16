-- Reception mutfak muhasebe: POS onay RPC, RLS düzeltmesi, resepsiyon rolü

BEGIN;

CREATE OR REPLACE FUNCTION public.staff_has_kitchen_reception_access()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.auth_id = auth.uid()
      AND s.is_active = true
      AND s.deleted_at IS NULL
      AND (
        public.current_user_is_staff_admin()
        OR s.role = 'admin'
        OR (s.app_permissions->>'gorev_ata')::boolean IS TRUE
        OR s.role IN ('reception_chief', 'receptionist')
        OR public.staff_has_app_permission('reception_mutfak_muhasebe')
        OR public.staff_has_app_permission('mutfak_operasyon_yonetim')
      )
  );
$$;

DROP POLICY IF EXISTS "kitchen_pos_update" ON public.kitchen_pos_transactions;
CREATE POLICY "kitchen_pos_update" ON public.kitchen_pos_transactions
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND (
      public.current_user_is_staff_admin()
      OR public.staff_has_kitchen_reception_access()
    )
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND (
      public.current_user_is_staff_admin()
      OR public.staff_has_kitchen_reception_access()
    )
  );

CREATE OR REPLACE FUNCTION public.kitchen_pos_advance_status(p_transaction_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_row public.kitchen_pos_transactions%ROWTYPE;
  v_next text;
  v_staff_id uuid;
BEGIN
  IF NOT public.staff_has_kitchen_reception_access() THEN
    RAISE EXCEPTION 'Reception mutfak muhasebe yetkisi gerekli';
  END IF;

  SELECT s.id INTO v_staff_id
  FROM public.staff s
  WHERE s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL
  LIMIT 1;

  SELECT * INTO v_row
  FROM public.kitchen_pos_transactions
  WHERE id = p_transaction_id
    AND organization_id = public.current_staff_organization_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS kaydı bulunamadı';
  END IF;

  v_next := CASE v_row.status
    WHEN 'pending' THEN 'approved'
    WHEN 'approved' THEN 'transferred'
    WHEN 'transferred' THEN 'commission_deducted'
    WHEN 'commission_deducted' THEN 'completed'
    ELSE NULL
  END;

  IF v_next IS NULL THEN
    RAISE EXCEPTION 'Bu kayıt için ilerletilecek durum yok';
  END IF;

  UPDATE public.kitchen_pos_transactions
  SET
    status = v_next,
    approved_by = v_staff_id,
    approved_at = now()
  WHERE id = p_transaction_id;

  INSERT INTO public.kitchen_audit_logs (
    organization_id, entity_type, entity_id, action, old_value, new_value, changed_by
  ) VALUES (
    v_row.organization_id,
    'kitchen_pos_transactions',
    p_transaction_id,
    'status_advance',
    jsonb_build_object('status', v_row.status),
    jsonb_build_object('status', v_next),
    v_staff_id
  );

  RETURN v_next;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kitchen_pos_advance_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.kitchen_day_closure_approve(p_closure_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_staff_id uuid;
BEGIN
  IF NOT public.staff_has_kitchen_reception_access() THEN
    RAISE EXCEPTION 'Reception mutfak muhasebe yetkisi gerekli';
  END IF;

  SELECT s.id INTO v_staff_id
  FROM public.staff s
  WHERE s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL
  LIMIT 1;

  UPDATE public.kitchen_day_closures
  SET
    status = 'approved',
    approved_by = v_staff_id,
    approved_at = now()
  WHERE id = p_closure_id
    AND organization_id = public.current_staff_organization_id()
    AND status IN ('submitted', 'draft');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onaylanacak gün sonu kaydı bulunamadı';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kitchen_day_closure_approve(uuid) TO authenticated;

COMMIT;
