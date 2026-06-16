-- Kahvaltı teyit: mutfak departmanları (mutfak, chef, vb.) — 350 staff_department_is_kitchen ile uyum

BEGIN;

CREATE OR REPLACE FUNCTION public.staff_department_allows_breakfast()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT public.staff_department_is_kitchen(s.department)
     FROM public.staff s
     WHERE s.auth_id = auth.uid()
       AND COALESCE(s.is_active, true) = true
       AND s.deleted_at IS NULL
     LIMIT 1),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.breakfast_confirmations_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  cfg record;
  n_photos int;
  t_ist time;
BEGIN
  SELECT * INTO cfg FROM public.breakfast_confirmation_settings b
  WHERE b.organization_id = NEW.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kahvaltı ayarları bulunamadı.';
  END IF;
  IF NOT cfg.feature_enabled THEN
    RAISE EXCEPTION 'Kahvaltı teyit özelliği bu işletme için kapalı.';
  END IF;

  SELECT * INTO s FROM public.staff st WHERE st.id = NEW.staff_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Personel bulunamadı.';
  END IF;
  IF s.organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'İşletme eşleşmesi geçersiz.';
  END IF;
  IF COALESCE(cfg.require_kitchen_department, true)
     AND s.department IS NOT NULL
     AND NOT public.staff_department_is_kitchen(s.department) THEN
    RAISE EXCEPTION 'Bu departman kahvaltı teyidi oluşturamaz.';
  END IF;

  n_photos := COALESCE(array_length(NEW.photo_urls, 1), 0);
  IF n_photos < cfg.min_photos OR n_photos > cfg.max_photos THEN
    RAISE EXCEPTION 'Fotoğraf sayısı % ile % arasında olmalı.', cfg.min_photos, cfg.max_photos;
  END IF;
  IF cfg.guest_count_required AND (NEW.guest_count IS NULL OR NEW.guest_count <= 0) THEN
    RAISE EXCEPTION 'Kişi sayısı zorunludur.';
  END IF;
  IF cfg.note_required AND (NEW.note IS NULL OR btrim(NEW.note) = '') THEN
    RAISE EXCEPTION 'Not zorunludur.';
  END IF;

  IF TG_OP = 'INSERT' AND cfg.submission_time_start IS NOT NULL AND cfg.submission_time_end IS NOT NULL THEN
    t_ist := (now() AT TIME ZONE 'Europe/Istanbul')::time;
    IF cfg.submission_time_start <= cfg.submission_time_end THEN
      IF t_ist < cfg.submission_time_start OR t_ist > cfg.submission_time_end THEN
        RAISE EXCEPTION 'Gönderim bu saat aralığı dışında: % - %', cfg.submission_time_start, cfg.submission_time_end;
      END IF;
    ELSE
      IF t_ist < cfg.submission_time_start AND t_ist > cfg.submission_time_end THEN
        RAISE EXCEPTION 'Gönderim bu saat aralığı dışında: % - % (gece sarkan aralık)', cfg.submission_time_start, cfg.submission_time_end;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.staff_id IS DISTINCT FROM OLD.staff_id
       OR NEW.record_date IS DISTINCT FROM OLD.record_date THEN
      RAISE EXCEPTION 'Kayıt kimliği değiştirilemez.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

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
              AND public.staff_department_is_kitchen(c.department)
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
              AND public.staff_department_is_kitchen(c.department)
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

COMMENT ON FUNCTION public.staff_department_allows_breakfast() IS
  'Kahvaltı teyit modülü: oturum açan personelin mutfak/restoran departmanında olması (staff_department_is_kitchen).';

COMMIT;
