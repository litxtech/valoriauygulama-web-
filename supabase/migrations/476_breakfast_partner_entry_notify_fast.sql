-- 522 önleme: bildirim trigger'ını hafiflet — RPC yanıtını geciktirmesin.
-- Uygulama içi bildirim satırları edge function tarafında; trigger yalnızca pg_net kuyruğu.

BEGIN;

CREATE OR REPLACE FUNCTION public.breakfast_partner_notify_entry_after_save()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hotel record;
  v_kitchen_ids uuid[];
  v_filtered uuid[];
  v_title text;
  v_body text;
  v_date_label text;
  v_payload jsonb;
  v_push_url text := 'https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/send-expo-push';
  v_admin_url text := 'https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/notify-admins';
BEGIN
  IF NEW.guest_count IS NULL OR NEW.guest_count <= 0 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.guest_count = OLD.guest_count
     AND NEW.line_total IS NOT DISTINCT FROM OLD.line_total THEN
    RETURN NEW;
  END IF;

  SELECT h.id, h.name, h.organization_id
  INTO v_hotel
  FROM public.breakfast_partner_hotels h
  WHERE h.id = NEW.partner_hotel_id;

  IF v_hotel.id IS NULL THEN
    RETURN NEW;
  END IF;

  v_date_label := to_char(NEW.record_date, 'DD.MM.YYYY');
  v_title := '☕ Partner kahvaltı — ' || v_hotel.name;
  v_body := v_date_label || ': ' || NEW.guest_count::text || ' kişi';
  IF coalesce(NEW.line_total, 0) > 0 THEN
    v_body := v_body || ' · ' || to_char(NEW.line_total, 'FM999G999G990D00') || ' ₺';
  END IF;
  IF NEW.note IS NOT NULL AND length(trim(NEW.note)) > 0 THEN
    v_body := v_body || ' · ' || left(trim(NEW.note), 120);
  END IF;

  v_payload := jsonb_build_object(
    'notificationType', 'breakfast_partner_entry',
    'screen', '/staff/breakfast-partners',
    'url', '/staff/breakfast-partners',
    'adminUrl', '/admin/breakfast-partners/' || v_hotel.id::text,
    'recordDate', NEW.record_date::text,
    'guestCount', NEW.guest_count,
    'hotelName', v_hotel.name,
    'partnerHotelId', v_hotel.id::text,
    'organizationId', v_hotel.organization_id::text
  );

  v_kitchen_ids := public.breakfast_partner_kitchen_staff_ids(v_hotel.organization_id);

  IF v_kitchen_ids IS NOT NULL AND array_length(v_kitchen_ids, 1) > 0 THEN
    SELECT coalesce(array_agg(f.staff_id), ARRAY[]::uuid[])
    INTO v_filtered
    FROM public.filter_staff_notification_recipients(v_kitchen_ids, 'breakfast_partner_entry') f;

    IF v_filtered IS NOT NULL AND array_length(v_filtered, 1) > 0 THEN
      PERFORM net.http_post(
        url := v_push_url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'staffIds', to_jsonb(v_filtered),
          'title', v_title,
          'body', left(v_body, 240),
          'data', v_payload
        ),
        timeout_milliseconds := 15000
      );
    END IF;
  END IF;

  PERFORM net.http_post(
    url := v_admin_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'title', v_title,
      'body', left(v_body, 240),
      'data', v_payload
    ),
    timeout_milliseconds := 15000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'breakfast_partner_notify_entry_after_save: %', SQLERRM;
  RETURN NEW;
END;
$$;

COMMIT;
