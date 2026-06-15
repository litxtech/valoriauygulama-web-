-- Sprint A: menü siparişi türü + talep durumu misafir bildirimi

BEGIN;

ALTER TABLE public.guest_service_requests
  DROP CONSTRAINT IF EXISTS guest_service_requests_request_type_check;

ALTER TABLE public.guest_service_requests
  ADD CONSTRAINT guest_service_requests_request_type_check
  CHECK (
    request_type IN (
      'room_cleaning',
      'towels',
      'maintenance',
      'late_checkout',
      'lost_item',
      'amenities',
      'kitchen_order',
      'other'
    )
  );

CREATE OR REPLACE FUNCTION public.guest_service_request_notify_guest_on_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
  v_body text;
  v_payload jsonb;
  v_base_url text;
BEGIN
  IF TG_OP <> 'UPDATE' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  v_title := CASE NEW.status
    WHEN 'in_progress' THEN 'Talebiniz işleme alındı'
    WHEN 'completed' THEN 'Talebiniz tamamlandı'
    WHEN 'cancelled' THEN 'Talebiniz iptal edildi'
    ELSE 'Talep güncellendi'
  END;

  v_body := COALESCE(
    NULLIF(trim(NEW.staff_note), ''),
    CASE NEW.status
      WHEN 'in_progress' THEN 'Ekibimiz talebiniz üzerinde çalışıyor.'
      WHEN 'completed' THEN 'İyi konaklamalar dileriz.'
      WHEN 'cancelled' THEN 'Detay için resepsiyonla iletişime geçebilirsiniz.'
      ELSE 'Talep durumunuz güncellendi.'
    END
  );

  v_payload := jsonb_build_object(
    'notificationType', 'guest_service_request_status',
    'url', '/customer/service-requests',
    'screen', 'customer_service_requests',
    'requestId', NEW.id::text,
    'status', NEW.status
  );

  INSERT INTO public.notifications (
    staff_id, guest_id, title, body, category, notification_type, data, sent_via, sent_at
  )
  VALUES (
    NULL, NEW.guest_id, v_title, v_body, 'guest', 'guest_service_request_status', v_payload, 'both', now()
  );

  BEGIN
    v_base_url := NULLIF(current_setting('app.settings.supabase_url', true), '');
    IF v_base_url IS NULL THEN
      v_base_url := 'https://sbydlcujsiqmifybqzsi.supabase.co';
    END IF;
    PERFORM net.http_post(
      url := v_base_url || '/functions/v1/send-expo-push',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'guestIds', jsonb_build_array(NEW.guest_id),
        'title', v_title,
        'body', v_body,
        'data', v_payload
      ),
      timeout_milliseconds := 10000
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guest_service_request_notify_guest ON public.guest_service_requests;
CREATE TRIGGER trg_guest_service_request_notify_guest
  AFTER UPDATE OF status ON public.guest_service_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.guest_service_request_notify_guest_on_status();

COMMIT;
