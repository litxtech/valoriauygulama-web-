-- Partner portal: uygulama içi bildirimler + tahsilat geçmişi

BEGIN;

CREATE TABLE IF NOT EXISTS public.breakfast_partner_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_user_id uuid NOT NULL REFERENCES public.breakfast_partner_users(id) ON DELETE CASCADE,
  partner_hotel_id uuid NOT NULL REFERENCES public.breakfast_partner_hotels(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  title text NOT NULL,
  body text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_breakfast_partner_notif_user_created
  ON public.breakfast_partner_notifications (partner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_breakfast_partner_notif_user_unread
  ON public.breakfast_partner_notifications (partner_user_id)
  WHERE read_at IS NULL;

ALTER TABLE public.breakfast_partner_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS breakfast_partner_notifications_self ON public.breakfast_partner_notifications;
CREATE POLICY breakfast_partner_notifications_self ON public.breakfast_partner_notifications
  FOR SELECT TO authenticated
  USING (
    partner_user_id IN (
      SELECT u.id FROM public.breakfast_partner_users u
      WHERE u.auth_id = auth.uid() AND u.is_active = true
    )
  );

DROP POLICY IF EXISTS breakfast_partner_notifications_self_update ON public.breakfast_partner_notifications;
CREATE POLICY breakfast_partner_notifications_self_update ON public.breakfast_partner_notifications
  FOR UPDATE TO authenticated
  USING (
    partner_user_id IN (
      SELECT u.id FROM public.breakfast_partner_users u
      WHERE u.auth_id = auth.uid() AND u.is_active = true
    )
  )
  WITH CHECK (
    partner_user_id IN (
      SELECT u.id FROM public.breakfast_partner_users u
      WHERE u.auth_id = auth.uid() AND u.is_active = true
    )
  );

GRANT SELECT, UPDATE ON public.breakfast_partner_notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.breakfast_partner_current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public.breakfast_partner_users u
  WHERE u.auth_id = auth.uid() AND u.is_active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.breakfast_partner_current_user_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.breakfast_partner_insert_notifications(
  p_partner_hotel_id uuid,
  p_notification_type text,
  p_title text,
  p_body text DEFAULT NULL,
  p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
BEGIN
  INSERT INTO public.breakfast_partner_notifications (
    partner_user_id, partner_hotel_id, notification_type, title, body, data
  )
  SELECT u.id, p_partner_hotel_id, p_notification_type, p_title, p_body, coalesce(p_data, '{}'::jsonb)
  FROM public.breakfast_partner_users u
  WHERE u.partner_hotel_id = p_partner_hotel_id AND u.is_active = true;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.breakfast_partner_insert_notifications(uuid, text, text, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.breakfast_partner_unread_notification_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.breakfast_partner_notifications n
  WHERE n.partner_user_id = public.breakfast_partner_current_user_id()
    AND n.read_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.breakfast_partner_unread_notification_count() TO authenticated;

CREATE OR REPLACE FUNCTION public.breakfast_partner_mark_all_notifications_read()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_count int;
BEGIN
  v_user_id := public.breakfast_partner_current_user_id();
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.breakfast_partner_notifications
  SET read_at = now()
  WHERE partner_user_id = v_user_id AND read_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.breakfast_partner_mark_all_notifications_read() TO authenticated;

CREATE OR REPLACE FUNCTION public.breakfast_partner_payment_history(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hotel_id uuid;
  v_counterparty_id uuid;
  v_rows jsonb;
BEGIN
  v_hotel_id := public.breakfast_partner_user_hotel_id();
  IF v_hotel_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT h.counterparty_id INTO v_counterparty_id
  FROM public.breakfast_partner_hotels h
  WHERE h.id = v_hotel_id;

  IF v_counterparty_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(row_data ORDER BY movement_date DESC, created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'id', m.id,
      'amount', m.amount,
      'movementDate', m.movement_date,
      'description', m.description,
      'paymentMethod', m.payment_method,
      'createdAt', m.created_at
    ) AS row_data
    FROM public.finance_movements m
    WHERE m.counterparty_id = v_counterparty_id
      AND m.kind = 'income'
    ORDER BY m.movement_date DESC, m.created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 50), 100))
  ) sub;

  RETURN coalesce(v_rows, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.breakfast_partner_payment_history(integer) TO authenticated;

-- Tahsilat trigger: push + uygulama içi bildirim
CREATE OR REPLACE FUNCTION public.breakfast_partner_notify_payment_on_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hotel record;
  v_partner_ids uuid[];
  v_title text;
  v_body text;
  v_payload jsonb;
  v_push_url text := 'https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/send-expo-push';
BEGIN
  IF NEW.counterparty_id IS NULL OR NEW.kind <> 'income' THEN
    RETURN NEW;
  END IF;

  SELECT h.id, h.name
  INTO v_hotel
  FROM public.breakfast_partner_hotels h
  WHERE h.counterparty_id = NEW.counterparty_id
    AND h.status = 'active'
  LIMIT 1;

  IF v_hotel.id IS NULL THEN
    RETURN NEW;
  END IF;

  v_title := 'Tahsilat alındı';
  v_body := format(
    '%s tutarında tahsilat kaydedildi.',
    to_char(NEW.amount, 'FM999G999G990D00') || ' ₺'
  );
  v_payload := jsonb_build_object(
    'notificationType', 'breakfast_partner_payment',
    'screen', '/partner/(tabs)/account',
    'url', '/partner/(tabs)/account',
    'amount', NEW.amount,
    'hotelName', v_hotel.name,
    'movementId', NEW.id
  );

  PERFORM public.breakfast_partner_insert_notifications(
    v_hotel.id,
    'breakfast_partner_payment',
    v_title,
    v_body,
    v_payload
  );

  v_partner_ids := public.breakfast_partner_user_ids_for_hotel(v_hotel.id);
  IF v_partner_ids IS NOT NULL AND array_length(v_partner_ids, 1) > 0 THEN
    PERFORM net.http_post(
      url := v_push_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'partnerUserIds', to_jsonb(v_partner_ids),
        'title', v_title,
        'body', v_body,
        'data', v_payload
      ),
      timeout_milliseconds := 15000
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
