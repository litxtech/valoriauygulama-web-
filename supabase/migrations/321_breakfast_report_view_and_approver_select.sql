-- Kahvaltı teyit: rapor yetkisi salt okunur; onaylayan tüm kayıtları görebilsin.

BEGIN;

DROP POLICY IF EXISTS "breakfast_confirm_select" ON public.breakfast_confirmations;
CREATE POLICY "breakfast_confirm_select"
  ON public.breakfast_confirmations FOR SELECT TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND (
      public.current_user_is_staff_admin()
      OR staff_id = public.current_staff_id()
      OR public.staff_has_app_permission('kahvalti_rapor')
      OR public.staff_has_app_permission('kahvalti_teyit_onayla')
      OR (
        public.staff_has_app_permission('kahvalti_teyit_departman')
        AND public.staff_department_allows_breakfast()
        AND EXISTS (
          SELECT 1 FROM public.staff c
          WHERE c.id = breakfast_confirmations.staff_id
            AND c.department IN ('kitchen', 'restaurant')
        )
      )
    )
  );

COMMENT ON COLUMN public.staff.app_permissions IS
  'JSONB yetkiler. kahvalti_rapor: tüm teyit geçmişi salt okunur (onay/puan yok). kahvalti_teyit_olustur: kendi kayıtları.';

COMMIT;
