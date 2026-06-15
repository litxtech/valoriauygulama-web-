-- Bahşiş: bildirimler sunucuda (push hatası RPC'yi düşürmez), tek istemci çağrısı

BEGIN;

CREATE OR REPLACE FUNCTION public.notify_staff_tip_created(
  p_tip_id uuid,
  p_guest_id uuid,
  p_staff_id uuid,
  p_amount numeric,
  p_payment_method text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_name text;
  v_room text;
  v_staff_name text;
  v_title_staff text := 'Bahşiş aldınız';
  v_title_admin text := 'Misafir bahşiş talebi';
  v_body_staff text;
  v_body_admin text;
  v_payload jsonb;
  v_admin_ids uuid[];
  v_pay_label text;
  v_amount_label text;
BEGIN
  SELECT
    g.full_name,
    coalesce(nullif(trim(g.room_number), ''), nullif(trim(r.room_number), ''))
  INTO v_guest_name, v_room
  FROM public.guests g
  LEFT JOIN public.rooms r ON r.id = g.room_id
  WHERE g.id = p_guest_id;

  SELECT s.full_name INTO v_staff_name FROM public.staff s WHERE s.id = p_staff_id;

  v_pay_label := CASE p_payment_method
    WHEN 'room_charge' THEN 'Oda faturasına ekle'
    WHEN 'card_at_desk' THEN 'Resepsiyonda kart'
    WHEN 'cash_at_desk' THEN 'Nakit teslim'
    ELSE p_payment_method
  END;

  v_amount_label := round(p_amount, 0)::text || ' ₺';

  v_body_staff := coalesce(nullif(trim(v_guest_name), ''), 'Misafir')
    || CASE WHEN v_room IS NOT NULL THEN ' · Oda ' || v_room ELSE '' END
    || ' — ' || v_amount_label || ' bahşiş talebi';

  v_body_admin := coalesce(nullif(trim(v_guest_name), ''), 'Misafir')
    || CASE WHEN v_room IS NOT NULL THEN ' · Oda ' || v_room ELSE '' END
    || ' → ' || coalesce(nullif(trim(v_staff_name), ''), 'Personel') || ': '
    || v_amount_label || ' (' || v_pay_label || ')';

  v_payload := jsonb_build_object(
    'tipId', p_tip_id::text,
    'url', '/staff/profile',
    'screen', 'staff_profile',
    'notificationType', 'staff_tip'
  );

  INSERT INTO public.notifications (
    staff_id, guest_id, title, body, category, notification_type, data, sent_via, sent_at
  ) VALUES (
    p_staff_id, p_guest_id, v_title_staff, v_body_staff, 'staff', 'staff_tip', v_payload, 'both', now()
  );

  SELECT array_agg(s.id) INTO v_admin_ids
  FROM public.staff s
  WHERE s.is_active = true AND s.deleted_at IS NULL AND s.role = 'admin';

  IF v_admin_ids IS NOT NULL THEN
    INSERT INTO public.notifications (
      staff_id, guest_id, title, body, category, notification_type, data, sent_via, sent_at
    )
    SELECT
      aid,
      p_guest_id,
      v_title_admin,
      v_body_admin,
      'admin',
      'staff_tip',
      jsonb_build_object('tipId', p_tip_id::text, 'url', '/admin', 'screen', 'admin'),
      'both',
      now()
    FROM unnest(v_admin_ids) AS aid;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := 'https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/send-expo-push',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'staffIds', jsonb_build_array(p_staff_id),
        'title', v_title_staff,
        'body', left(v_body_staff, 240),
        'data', v_payload
      ),
      timeout_milliseconds := 8000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'staff_tip staff push skipped: %', SQLERRM;
  END;

  IF v_admin_ids IS NOT NULL THEN
    BEGIN
      PERFORM net.http_post(
        url := 'https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/send-expo-push',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'staffIds', to_jsonb(v_admin_ids),
          'title', v_title_admin,
          'body', left(v_body_admin, 240),
          'data', jsonb_build_object('tipId', p_tip_id::text, 'url', '/admin', 'screen', 'admin')
        ),
        timeout_milliseconds := 8000
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'staff_tip admin push skipped: %', SQLERRM;
    END;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_guest_staff_tip(
  p_app_token text,
  p_staff_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id uuid;
  v_tip_id uuid;
  v_staff_active boolean;
  v_token text;
BEGIN
  IF p_staff_id IS NULL THEN
    RAISE EXCEPTION 'Geçersiz istek';
  END IF;

  v_token := NULLIF(trim(COALESCE(p_app_token, '')), '');

  IF v_token IS NULL AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Misafir oturumu bulunamadı';
  END IF;

  IF p_amount IS NULL OR p_amount < 10 OR p_amount > 50000 THEN
    RAISE EXCEPTION 'Bahşiş tutarı 10–50.000 TL arasında olmalı';
  END IF;

  IF p_payment_method NOT IN ('room_charge', 'card_at_desk', 'cash_at_desk') THEN
    RAISE EXCEPTION 'Geçersiz ödeme yöntemi';
  END IF;

  SELECT g.id
  INTO v_guest_id
  FROM public.guests g
  WHERE g.deleted_at IS NULL
    AND (
      (v_token IS NOT NULL AND g.app_token = v_token)
      OR (auth.uid() IS NOT NULL AND g.auth_user_id = auth.uid())
    )
  ORDER BY
    CASE
      WHEN v_token IS NOT NULL AND g.app_token = v_token THEN 0
      WHEN auth.uid() IS NOT NULL AND g.auth_user_id = auth.uid() THEN 1
      ELSE 2
    END,
    g.created_at DESC
  LIMIT 1;

  IF v_guest_id IS NULL THEN
    RAISE EXCEPTION 'Misafir oturumu bulunamadı';
  END IF;

  SELECT COALESCE(s.is_active, true) INTO v_staff_active
  FROM public.staff s
  WHERE s.id = p_staff_id AND s.deleted_at IS NULL
  LIMIT 1;

  IF v_staff_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Personel bulunamadı';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_blocks ub
    WHERE ub.blocker_type = 'guest'
      AND ub.blocker_guest_id = v_guest_id
      AND ub.blocked_type = 'staff'
      AND ub.blocked_staff_id = p_staff_id
  ) THEN
    RAISE EXCEPTION 'Bu personele bahşiş gönderemezsiniz';
  END IF;

  INSERT INTO public.staff_tips (
    guest_id,
    staff_id,
    amount,
    payment_method,
    note
  ) VALUES (
    v_guest_id,
    p_staff_id,
    round(p_amount, 2),
    p_payment_method,
    NULLIF(trim(COALESCE(p_note, '')), '')
  )
  RETURNING id INTO v_tip_id;

  BEGIN
    PERFORM public.notify_staff_tip_created(
      v_tip_id,
      v_guest_id,
      p_staff_id,
      round(p_amount, 2),
      p_payment_method
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'staff_tip notify failed: %', SQLERRM;
  END;

  RETURN v_tip_id;
END;
$$;

COMMENT ON FUNCTION public.notify_staff_tip_created IS
  'Bahşiş kaydı sonrası personel/admin bildirimi + push (hata RPC''yi düşürmez).';

COMMIT;
