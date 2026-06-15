-- Grup mesajı "görenler" (WhatsApp Mesaj bilgisi) — katılımcı last_read_at ile

CREATE OR REPLACE FUNCTION public.messaging_staff_get_message_readers(p_message_id UUID)
RETURNS TABLE(
  participant_id UUID,
  participant_type TEXT,
  display_name TEXT,
  avatar TEXT,
  verification_badge TEXT,
  read_at TIMESTAMPTZ,
  has_read BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id UUID;
  v_conv_id UUID;
  v_msg_created TIMESTAMPTZ;
  v_sender_id UUID;
  v_sender_type TEXT;
BEGIN
  SELECT s.id INTO v_staff_id
  FROM public.staff s
  WHERE s.auth_id = auth.uid()
    AND s.is_active = true
    AND s.deleted_at IS NULL
  LIMIT 1;

  IF v_staff_id IS NULL THEN
    RETURN;
  END IF;

  SELECT m.conversation_id, m.created_at, m.sender_id, m.sender_type::text
  INTO v_conv_id, v_msg_created, v_sender_id, v_sender_type
  FROM public.messages m
  WHERE m.id = p_message_id
    AND NOT m.is_deleted;

  IF v_conv_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = v_conv_id
      AND cp.participant_id = v_staff_id
      AND cp.participant_type IN ('staff', 'admin')
      AND cp.left_at IS NULL
  ) THEN
    RETURN;
  END IF;

  -- Sadece mesajı gönderen kişi okuyan listesini görebilir (WhatsApp)
  IF NOT (v_sender_id = v_staff_id AND v_sender_type IN ('staff', 'admin')) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    cp.participant_id,
    cp.participant_type::text,
    CASE
      WHEN cp.participant_type = 'guest' THEN
        COALESCE(NULLIF(TRIM(g.full_name), ''), NULLIF(TRIM(g.email), ''), 'Misafir')
      ELSE
        COALESCE(NULLIF(TRIM(s.full_name), ''), NULLIF(TRIM(s.email), ''), 'Personel')
    END AS display_name,
    CASE
      WHEN cp.participant_type = 'guest' THEN NULLIF(TRIM(g.photo_url), '')
      ELSE NULLIF(TRIM(s.profile_image), '')
    END AS avatar,
    CASE
      WHEN cp.participant_type IN ('staff', 'admin') THEN NULLIF(TRIM(s.verification_badge), '')
      ELSE NULL::text
    END AS verification_badge,
    cp.last_read_at AS read_at,
    (cp.last_read_at IS NOT NULL AND cp.last_read_at >= v_msg_created) AS has_read
  FROM public.conversation_participants cp
  LEFT JOIN public.guests g
    ON g.id = cp.participant_id
   AND cp.participant_type = 'guest'
   AND g.deleted_at IS NULL
  LEFT JOIN public.staff s
    ON s.id = cp.participant_id
   AND cp.participant_type IN ('staff', 'admin')
   AND s.deleted_at IS NULL
   AND s.is_active = true
  WHERE cp.conversation_id = v_conv_id
    AND cp.left_at IS NULL
    AND NOT (cp.participant_id = v_sender_id AND cp.participant_type::text = v_sender_type)
    AND (
      (cp.participant_type = 'guest' AND g.id IS NOT NULL)
      OR (cp.participant_type IN ('staff', 'admin') AND s.id IS NOT NULL)
    )
  ORDER BY has_read DESC, read_at DESC NULLS LAST, display_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.messaging_staff_get_message_readers(UUID) TO authenticated;

COMMENT ON FUNCTION public.messaging_staff_get_message_readers IS
  'Grup mesajı göndereni için: katılımcıların mesajı okuyup okumadığı (last_read_at >= mesaj zamanı).';
