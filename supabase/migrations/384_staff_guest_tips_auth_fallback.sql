-- Bahşiş RPC: app_token yanında auth.uid() ile misafir eşleştirme (523 / token uyumsuzluğu)

BEGIN;

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

  RETURN v_tip_id;
END;
$$;

COMMENT ON FUNCTION public.create_guest_staff_tip IS
  'Misafir app_token veya auth.uid() ile personele bahşiş kaydı oluşturur.';

COMMIT;
