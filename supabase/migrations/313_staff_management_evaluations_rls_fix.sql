-- Yönetim değerlendirmesi INSERT: admin_auth_ids + tutarlı evaluator staff id (çoklu staff satırı).

BEGIN;

CREATE OR REPLACE FUNCTION public.auth_active_staff_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT s.id
  FROM public.staff s
  WHERE s.auth_id = auth.uid()
    AND COALESCE(s.is_active, true) = true
    AND s.deleted_at IS NULL
  ORDER BY (s.role = 'admin') DESC, s.updated_at DESC NULLS LAST
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.auth_active_staff_id() IS
  'Oturumdaki aktif staff id; aynı auth_id ile birden fazla satırda admin öncelikli.';

GRANT EXECUTE ON FUNCTION public.auth_active_staff_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_mgmt_eval_target_ok(p_staff_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff t
    WHERE t.id = p_staff_id
      AND t.deleted_at IS NULL
      AND t.organization_id = ANY (public.staff_org_ids_for_auth())
  );
$$;

COMMENT ON FUNCTION public.staff_mgmt_eval_target_ok(uuid) IS
  'Değerlendirilen personel, oturum sahibinin işletme(ler)inde ve silinmemiş olmalı.';

GRANT EXECUTE ON FUNCTION public.staff_mgmt_eval_target_ok(uuid) TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_management_evaluations TO authenticated;

DROP POLICY IF EXISTS "staff_mgmt_eval_select" ON public.staff_management_evaluations;
CREATE POLICY "staff_mgmt_eval_select" ON public.staff_management_evaluations
  FOR SELECT TO authenticated
  USING (
    staff_id IN (SELECT s.id FROM public.staff s WHERE s.auth_id = auth.uid())
    OR public.current_user_is_staff_admin()
  );

DROP POLICY IF EXISTS "staff_mgmt_eval_insert_admin" ON public.staff_management_evaluations;
CREATE POLICY "staff_mgmt_eval_insert_admin" ON public.staff_management_evaluations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_staff_admin()
    AND evaluator_staff_id = public.auth_active_staff_id()
    AND staff_id IS DISTINCT FROM evaluator_staff_id
    AND public.staff_mgmt_eval_target_ok(staff_id)
  );

DROP POLICY IF EXISTS "staff_mgmt_eval_update_admin" ON public.staff_management_evaluations;
CREATE POLICY "staff_mgmt_eval_update_admin" ON public.staff_management_evaluations
  FOR UPDATE TO authenticated
  USING (public.current_user_is_staff_admin())
  WITH CHECK (public.current_user_is_staff_admin());

DROP POLICY IF EXISTS "staff_mgmt_eval_delete_admin" ON public.staff_management_evaluations;
CREATE POLICY "staff_mgmt_eval_delete_admin" ON public.staff_management_evaluations
  FOR DELETE TO authenticated
  USING (public.current_user_is_staff_admin());

COMMIT;
