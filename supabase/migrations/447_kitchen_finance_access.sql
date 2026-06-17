-- Mutfak–Resepsiyon finans paneli: admin seçili personel erişimi (tüm mutfakçılar değil)

BEGIN;

ALTER TABLE public.kitchen_ops_settings
  ADD COLUMN IF NOT EXISTS kitchen_finance_staff_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.kitchen_ops_settings.kitchen_finance_staff_ids IS
  'Mutfak–resepsiyon finans paneline erişebilen personel. Boşsa yalnızca admin ve reception yetkilileri görür.';

CREATE OR REPLACE FUNCTION public.staff_has_kitchen_finance_access()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    LEFT JOIN public.kitchen_ops_settings kos ON kos.organization_id = s.organization_id
    WHERE s.auth_id = auth.uid()
      AND s.is_active = true
      AND s.deleted_at IS NULL
      AND (
        public.current_user_is_staff_admin()
        OR s.role = 'admin'
        OR (s.app_permissions->>'gorev_ata')::boolean IS TRUE
        OR public.staff_has_app_permission('mutfak_operasyon_yonetim')
        OR public.staff_has_kitchen_reception_access()
        OR s.id = ANY (coalesce(kos.kitchen_finance_staff_ids, ARRAY[]::uuid[]))
      )
  );
$$;

COMMENT ON FUNCTION public.staff_has_kitchen_finance_access() IS
  'Mutfak finans özeti, hasılat/gider listesi ve mutfak–resepsiyon köprü paneli erişimi.';

-- Özet RPC'leri finans yetkisine bağla
CREATE OR REPLACE FUNCTION public.kitchen_day_closure_summary(p_date DATE DEFAULT CURRENT_DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_rev NUMERIC; v_pos NUMERIC; v_cash NUMERIC; v_exp NUMERIC; v_per NUMERIC; v_debt NUMERIC;
  v_kitchen_owes NUMERIC; v_hotel_owes NUMERIC;
BEGIN
  IF NOT public.staff_has_kitchen_finance_access() THEN
    RAISE EXCEPTION 'Mutfak finans paneli yetkisi yok';
  END IF;

  v_org_id := public.current_staff_organization_id();
  SELECT coalesce(sum(amount), 0) INTO v_rev FROM public.kitchen_revenues
  WHERE organization_id = v_org_id AND entry_date = p_date;
  SELECT coalesce(sum(amount), 0) INTO v_pos FROM public.kitchen_pos_transactions
  WHERE organization_id = v_org_id AND entry_date = p_date;
  SELECT coalesce(sum(amount), 0) INTO v_cash FROM public.kitchen_revenues
  WHERE organization_id = v_org_id AND entry_date = p_date AND payment_type = 'nakit';
  SELECT coalesce(sum(amount), 0) INTO v_exp FROM public.kitchen_expenses
  WHERE organization_id = v_org_id AND entry_date = p_date;
  SELECT coalesce(sum(amount), 0) INTO v_per FROM public.kitchen_personnel_payments
  WHERE organization_id = v_org_id AND entry_date = p_date;
  SELECT coalesce(sum(amount - paid_amount), 0) INTO v_debt FROM public.kitchen_supplier_debts
  WHERE organization_id = v_org_id AND status IN ('pending', 'partial', 'overdue');
  SELECT coalesce(sum(amount), 0) INTO v_kitchen_owes FROM public.kitchen_cari_ledger
  WHERE organization_id = v_org_id AND direction = 'kitchen_owes_hotel';
  SELECT coalesce(sum(amount), 0) INTO v_hotel_owes FROM public.kitchen_cari_ledger
  WHERE organization_id = v_org_id AND direction = 'hotel_owes_kitchen';

  RETURN jsonb_build_object(
    'total_revenue', v_rev,
    'total_pos', v_pos,
    'total_cash', v_cash,
    'total_expenses', v_exp,
    'personnel_expenses', v_per,
    'supplier_debt', v_debt,
    'kitchen_owes_hotel', v_kitchen_owes,
    'hotel_owes_kitchen', v_hotel_owes,
    'cari_net', v_hotel_owes - v_kitchen_owes,
    'net_remaining', v_rev - v_exp - v_per
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.kitchen_cari_net_balance()
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.staff_has_kitchen_finance_access() THEN
    RAISE EXCEPTION 'Mutfak finans paneli yetkisi yok';
  END IF;
  RETURN coalesce(
    (SELECT sum(CASE WHEN direction = 'hotel_owes_kitchen' THEN amount ELSE -amount END)
     FROM public.kitchen_cari_ledger
     WHERE organization_id = public.current_staff_organization_id()),
    0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.kitchen_check_pos_mismatch(p_date DATE DEFAULT CURRENT_DATE)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.staff_has_kitchen_finance_access() THEN
    RETURN false;
  END IF;
  RETURN abs(
    coalesce((SELECT sum(amount) FROM public.kitchen_revenues
      WHERE organization_id = public.current_staff_organization_id()
        AND entry_date = p_date AND payment_type = 'otel_pos'), 0)
    -
    coalesce((SELECT sum(amount) FROM public.kitchen_pos_transactions
      WHERE organization_id = public.current_staff_organization_id()
        AND entry_date = p_date), 0)
  ) > 0.01;
END;
$$;

-- Finans tabloları: SELECT yalnızca finans yetkisi
DROP POLICY IF EXISTS "kitchen_revenues_select" ON public.kitchen_revenues;
CREATE POLICY "kitchen_revenues_select" ON public.kitchen_revenues FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin() OR public.staff_has_kitchen_finance_access());

DROP POLICY IF EXISTS "kitchen_revenues_insert" ON public.kitchen_revenues;
CREATE POLICY "kitchen_revenues_insert" ON public.kitchen_revenues FOR INSERT TO authenticated
  WITH CHECK (public.staff_has_kitchen_finance_access() AND organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS "kitchen_revenues_update" ON public.kitchen_revenues;
CREATE POLICY "kitchen_revenues_update" ON public.kitchen_revenues FOR UPDATE TO authenticated
  USING (public.current_user_is_staff_admin() OR (public.staff_has_kitchen_finance_access() AND organization_id = public.current_staff_organization_id()));

DROP POLICY IF EXISTS "kitchen_expenses_select" ON public.kitchen_expenses;
CREATE POLICY "kitchen_expenses_select" ON public.kitchen_expenses FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin() OR public.staff_has_kitchen_finance_access());

DROP POLICY IF EXISTS "kitchen_expenses_insert" ON public.kitchen_expenses;
CREATE POLICY "kitchen_expenses_insert" ON public.kitchen_expenses FOR INSERT TO authenticated
  WITH CHECK (
    (public.staff_has_kitchen_finance_access() OR public.staff_has_kitchen_reception_access())
    AND organization_id = public.current_staff_organization_id()
  );

DROP POLICY IF EXISTS "kitchen_personnel_select" ON public.kitchen_personnel_payments;
CREATE POLICY "kitchen_personnel_select" ON public.kitchen_personnel_payments FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin() OR public.staff_has_kitchen_finance_access());

DROP POLICY IF EXISTS "kitchen_personnel_insert" ON public.kitchen_personnel_payments;
CREATE POLICY "kitchen_personnel_insert" ON public.kitchen_personnel_payments FOR INSERT TO authenticated
  WITH CHECK (
    (public.staff_has_kitchen_finance_access() OR public.staff_has_kitchen_reception_access())
    AND organization_id = public.current_staff_organization_id()
  );

DROP POLICY IF EXISTS "kitchen_supplier_debts_select" ON public.kitchen_supplier_debts;
CREATE POLICY "kitchen_supplier_debts_select" ON public.kitchen_supplier_debts FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin() OR public.staff_has_kitchen_finance_access());

DROP POLICY IF EXISTS "kitchen_supplier_debts_write" ON public.kitchen_supplier_debts;
CREATE POLICY "kitchen_supplier_debts_write" ON public.kitchen_supplier_debts FOR ALL TO authenticated
  USING (public.staff_has_kitchen_finance_access() OR public.current_user_is_staff_admin())
  WITH CHECK (public.staff_has_kitchen_finance_access() OR public.current_user_is_staff_admin());

DROP POLICY IF EXISTS "kitchen_cari_select" ON public.kitchen_cari_ledger;
CREATE POLICY "kitchen_cari_select" ON public.kitchen_cari_ledger FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin() OR public.staff_has_kitchen_finance_access());

DROP POLICY IF EXISTS "kitchen_cari_insert" ON public.kitchen_cari_ledger;
CREATE POLICY "kitchen_cari_insert" ON public.kitchen_cari_ledger FOR INSERT TO authenticated
  WITH CHECK (public.staff_has_kitchen_finance_access() AND organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS "kitchen_pos_select" ON public.kitchen_pos_transactions;
CREATE POLICY "kitchen_pos_select" ON public.kitchen_pos_transactions FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin() OR public.staff_has_kitchen_finance_access());

DROP POLICY IF EXISTS "kitchen_pos_insert" ON public.kitchen_pos_transactions;
CREATE POLICY "kitchen_pos_insert" ON public.kitchen_pos_transactions FOR INSERT TO authenticated
  WITH CHECK (public.staff_has_kitchen_finance_access() AND organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS "kitchen_settlements_select" ON public.kitchen_settlements;
CREATE POLICY "kitchen_settlements_select" ON public.kitchen_settlements FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin() OR public.staff_has_kitchen_finance_access());

DROP POLICY IF EXISTS "kitchen_settlements_write" ON public.kitchen_settlements;
CREATE POLICY "kitchen_settlements_write" ON public.kitchen_settlements FOR ALL TO authenticated
  USING (public.staff_has_kitchen_finance_access() OR public.current_user_is_staff_admin() OR public.staff_has_kitchen_reception_access())
  WITH CHECK (public.staff_has_kitchen_finance_access() OR public.current_user_is_staff_admin() OR public.staff_has_kitchen_reception_access());

DROP POLICY IF EXISTS "kitchen_day_closures_select" ON public.kitchen_day_closures;
CREATE POLICY "kitchen_day_closures_select" ON public.kitchen_day_closures FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin() OR public.staff_has_kitchen_finance_access());

DROP POLICY IF EXISTS "kitchen_day_closures_write" ON public.kitchen_day_closures;
CREATE POLICY "kitchen_day_closures_write" ON public.kitchen_day_closures FOR ALL TO authenticated
  USING (public.staff_has_kitchen_finance_access() OR public.current_user_is_staff_admin() OR public.staff_has_kitchen_reception_access())
  WITH CHECK (public.staff_has_kitchen_finance_access() OR public.current_user_is_staff_admin() OR public.staff_has_kitchen_reception_access());

COMMIT;
