-- Bahşiş: personeel teşekkür mesajı + misafir bildirimi

BEGIN;

ALTER TABLE public.staff_tips
  ADD COLUMN IF NOT EXISTS thank_you_message text,
  ADD COLUMN IF NOT EXISTS thank_you_at timestamptz;

COMMENT ON COLUMN public.staff_tips.thank_you_message IS 'Personelin misafire gönderdiği teşekkür metni';
COMMENT ON COLUMN public.staff_tips.thank_you_at IS 'Teşekkür gönderim zamanı';

CREATE OR REPLACE FUNCTION public.send_staff_tip_thank_you(
  p_tip_id uuid,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tip record;
  v_staff_name text;
  v_msg text;
  v_lang text;
  v_title text;
  v_body text;
BEGIN
  v_msg := nullif(trim(p_message), '');
  IF v_msg IS NULL OR length(v_msg) > 500 THEN
    RAISE EXCEPTION 'INVALID_MESSAGE';
  END IF;

  SELECT t.id, t.staff_id, t.guest_id, t.status, t.thank_you_at
  INTO v_tip
  FROM public.staff_tips t
  WHERE t.id = p_tip_id;

  IF v_tip.id IS NULL OR v_tip.status <> 'confirmed' THEN
    RAISE EXCEPTION 'TIP_NOT_FOUND';
  END IF;

  IF v_tip.thank_you_at IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_THANKED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = v_tip.staff_id AND s.auth_id = auth.uid()
      AND s.deleted_at IS NULL AND COALESCE(s.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  UPDATE public.staff_tips
  SET thank_you_message = v_msg, thank_you_at = now(), updated_at = now()
  WHERE id = p_tip_id;

  SELECT s.full_name INTO v_staff_name FROM public.staff s WHERE s.id = v_tip.staff_id;

  SELECT coalesce(nullif(lower(trim(g.contract_lang)), ''), 'tr')
  INTO v_lang
  FROM public.guests g WHERE g.id = v_tip.guest_id;

  v_title := CASE v_lang
    WHEN 'en' THEN 'Thank you from the team'
    WHEN 'ar' THEN 'شكر من الفريق'
    WHEN 'de' THEN 'Dank vom Team'
    WHEN 'fr' THEN 'Merci de l''équipe'
    WHEN 'ru' THEN 'Благодарность от команды'
    WHEN 'es' THEN 'Gracias del equipo'
    ELSE 'Personelden teşekkür'
  END;

  v_body := coalesce(nullif(trim(v_staff_name), ''), CASE v_lang
    WHEN 'en' THEN 'Staff'
    WHEN 'ar' THEN 'موظف'
    WHEN 'de' THEN 'Personal'
    WHEN 'fr' THEN 'Personnel'
    WHEN 'ru' THEN 'Сотрудник'
    WHEN 'es' THEN 'Personal'
    ELSE 'Personel'
  END) || ': ' || v_msg;

  INSERT INTO public.notifications (
    guest_id, staff_id, title, body, category, notification_type, data, sent_via, sent_at
  ) VALUES (
    v_tip.guest_id,
    v_tip.staff_id,
    v_title,
    v_body,
    'guest',
    'staff_tip_thank_you',
    jsonb_build_object(
      'tipId', p_tip_id::text,
      'url', '/customer/tips',
      'screen', 'guest_tips',
      'notificationType', 'staff_tip_thank_you'
    ),
    'in_app',
    now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_staff_tip_thank_you(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.send_staff_tip_thank_you IS
  'Bahşiş alan personel misafire tek seferlik teşekkür mesajı gönderir; misafire in-app bildirim düşer.';

COMMIT;
