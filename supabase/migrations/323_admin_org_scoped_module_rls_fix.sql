-- Admin (admin_auth_ids) hesapları organization_id boş/yanlış olsa bile modül kayıtlarını görebilsin.
-- UI işletme seçicisi ile filtreler; RLS yalnızca okuma/yazma engelini kaldırır.

BEGIN;

DROP POLICY IF EXISTS "breakfast_confirm_select" ON public.breakfast_confirmations;
CREATE POLICY "breakfast_confirm_select"
  ON public.breakfast_confirmations FOR SELECT TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR (
      organization_id = public.current_staff_organization_id()
      AND (
        staff_id = public.current_staff_id()
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
    )
  );

DROP POLICY IF EXISTS "breakfast_confirm_update" ON public.breakfast_confirmations;
CREATE POLICY "breakfast_confirm_update"
  ON public.breakfast_confirmations FOR UPDATE TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR (
      organization_id = public.current_staff_organization_id()
      AND (
        (
          staff_id = public.current_staff_id()
          AND public.staff_has_app_permission('kahvalti_teyit_olustur')
        )
        OR (
          public.staff_has_app_permission('kahvalti_teyit_departman')
          AND public.staff_department_allows_breakfast()
          AND EXISTS (
            SELECT 1 FROM public.staff c
            WHERE c.id = breakfast_confirmations.staff_id
              AND c.department IN ('kitchen', 'restaurant')
          )
        )
        OR public.staff_has_app_permission('kahvalti_teyit_onayla')
      )
    )
  )
  WITH CHECK (
    public.current_user_is_staff_admin()
    OR organization_id = public.current_staff_organization_id()
  );

DROP POLICY IF EXISTS "breakfast_settings_select_org" ON public.breakfast_confirmation_settings;
CREATE POLICY "breakfast_settings_select_org"
  ON public.breakfast_confirmation_settings FOR SELECT TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR organization_id = public.current_staff_organization_id()
  );

DROP POLICY IF EXISTS "dining_venues_select_staff" ON public.dining_venues;
CREATE POLICY "dining_venues_select_staff"
  ON public.dining_venues FOR SELECT TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.is_active = true
        AND s.deleted_at IS NULL
        AND s.organization_id = dining_venues.organization_id
    )
  );

DROP POLICY IF EXISTS "transfer_services_select_staff" ON public.transfer_services;
CREATE POLICY "transfer_services_select_staff"
  ON public.transfer_services FOR SELECT TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.is_active = true
        AND s.deleted_at IS NULL
        AND s.organization_id = transfer_services.organization_id
    )
  );

DROP POLICY IF EXISTS "transfer_requests_select_staff" ON public.transfer_service_requests;
CREATE POLICY "transfer_requests_select_staff"
  ON public.transfer_service_requests FOR SELECT TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.is_active = true
        AND s.deleted_at IS NULL
        AND s.organization_id = transfer_service_requests.organization_id
    )
  );

COMMIT;
