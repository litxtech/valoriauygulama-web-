-- Partner portal: otel kahvaltı teyitlerini görüntüleme + yükleme/onay bildirimleri

BEGIN;

CREATE OR REPLACE FUNCTION public.get_partner_breakfast_confirmations(p_limit int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 90);
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT h.organization_id
  INTO v_org
  FROM public.breakfast_partner_users u
  JOIN public.breakfast_partner_hotels h ON h.id = u.partner_hotel_id
  WHERE u.auth_id = auth.uid()
    AND u.is_active = true
    AND h.status = 'active'
  LIMIT 1;

  IF v_org IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', sub.id,
        'record_date', sub.record_date,
        'guest_count', sub.guest_count,
        'note', sub.note,
        'photo_urls', sub.photo_urls,
        'submitted_at', sub.submitted_at,
        'approved_at', sub.approved_at,
        'rejected_at', sub.rejected_at,
        'rejection_reason', sub.rejection_reason,
        'staff_name', sub.staff_name,
        'approver_name', sub.approver_name
      )
      ORDER BY sub.record_date DESC, sub.submitted_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      bc.id,
      bc.record_date,
      bc.guest_count,
      bc.note,
      COALESCE(bc.photo_urls, ARRAY[]::text[]) AS photo_urls,
      bc.submitted_at,
      bc.approved_at,
      bc.rejected_at,
      bc.rejection_reason,
      s.full_name AS staff_name,
      approver.full_name AS approver_name
    FROM public.breakfast_confirmations bc
    LEFT JOIN public.staff s ON s.id = bc.staff_id
    LEFT JOIN public.staff approver ON approver.id = bc.approved_by_staff_id
    WHERE bc.organization_id = v_org
    ORDER BY bc.record_date DESC, bc.submitted_at DESC
    LIMIT v_limit
  ) sub;

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.get_partner_breakfast_confirmations(int) IS
  'Partner portal — otelin kahvaltı teyit kayıtları (tüm durumlar).';

GRANT EXECUTE ON FUNCTION public.get_partner_breakfast_confirmations(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.breakfast_partner_notify_confirmation_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hotel record;
  v_title text;
  v_body text;
  v_type text;
  v_date text;
BEGIN
  v_date := to_char(NEW.record_date, 'DD.MM.YYYY');

  IF TG_OP = 'INSERT' THEN
    v_type := 'breakfast_confirmation_uploaded';
    v_title := 'Kahvaltı teyidi yüklendi';
    v_body := v_date || ' tarihli teyit mutfak tarafından yüklendi · onay bekliyor.';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.approved_at IS NOT NULL AND (OLD.approved_at IS NULL OR OLD.approved_at IS DISTINCT FROM NEW.approved_at) THEN
      v_type := 'breakfast_confirmation_approved';
      v_title := 'Kahvaltı teyidi onaylandı';
      v_body := v_date || ' tarihli kahvaltı teyidi onaylandı.';
    ELSIF NEW.rejected_at IS NOT NULL AND (OLD.rejected_at IS NULL OR OLD.rejected_at IS DISTINCT FROM NEW.rejected_at) THEN
      v_type := 'breakfast_confirmation_rejected';
      v_title := 'Kahvaltı teyidi reddedildi';
      v_body := v_date || ' tarihli teyit uygun bulunmadı.'
        || CASE WHEN coalesce(trim(NEW.rejection_reason), '') <> '' THEN ' ' || left(trim(NEW.rejection_reason), 120) ELSE '' END;
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  FOR v_hotel IN
    SELECT h.id
    FROM public.breakfast_partner_hotels h
    WHERE h.organization_id = NEW.organization_id
      AND h.status = 'active'
  LOOP
    PERFORM public.breakfast_partner_insert_notifications(
      v_hotel.id,
      v_type,
      v_title,
      v_body,
      jsonb_build_object(
        'confirmation_id', NEW.id,
        'record_date', NEW.record_date,
        'screen', 'breakfast_confirmations'
      )
    );
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'breakfast_partner_notify_confirmation_event: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_breakfast_confirm_partner_notify ON public.breakfast_confirmations;
CREATE TRIGGER trg_breakfast_confirm_partner_notify
  AFTER INSERT OR UPDATE ON public.breakfast_confirmations
  FOR EACH ROW
  EXECUTE FUNCTION public.breakfast_partner_notify_confirmation_event();

COMMIT;
