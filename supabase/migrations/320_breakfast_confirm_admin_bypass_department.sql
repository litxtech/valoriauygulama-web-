-- Admin hesapları kahvaltı teyit oluştururken departman kontrolünden muaf tutulur.

BEGIN;

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
  v_is_admin boolean;
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

  v_is_admin := public.current_user_is_staff_admin();

  IF NOT v_is_admin
     AND COALESCE(cfg.require_kitchen_department, true)
     AND s.department IS NOT NULL
     AND s.department NOT IN ('kitchen', 'restaurant') THEN
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

COMMIT;
