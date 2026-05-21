-- Sohbet @etiketleme (WhatsApp tarzı)

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS mentions JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.messages.mentions IS
  'Etiketlenen katılımcılar: [{participant_id, participant_type, display_name}]';

CREATE OR REPLACE FUNCTION public.messaging_list_mention_participants_staff(p_conversation_id UUID)
RETURNS TABLE(
  participant_id UUID,
  participant_type TEXT,
  display_name TEXT,
  avatar TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id UUID;
BEGIN
  SELECT s.id INTO v_staff_id
  FROM public.staff s
  WHERE s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL
  LIMIT 1;

  IF v_staff_id IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.participant_id = v_staff_id
      AND cp.participant_type IN ('staff', 'admin')
      AND cp.left_at IS NULL
  ) THEN
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
    END,
    CASE
      WHEN cp.participant_type = 'guest' THEN NULLIF(TRIM(g.photo_url), '')
      ELSE NULLIF(TRIM(s.profile_image), '')
    END
  FROM public.conversation_participants cp
  LEFT JOIN public.guests g ON g.id = cp.participant_id AND cp.participant_type = 'guest' AND g.deleted_at IS NULL
  LEFT JOIN public.staff s ON s.id = cp.participant_id AND cp.participant_type IN ('staff', 'admin') AND s.deleted_at IS NULL AND s.is_active = true
  WHERE cp.conversation_id = p_conversation_id
    AND cp.left_at IS NULL
    AND NOT (cp.participant_id = v_staff_id AND cp.participant_type IN ('staff', 'admin'))
    AND (
      (cp.participant_type = 'guest' AND g.id IS NOT NULL)
      OR (cp.participant_type IN ('staff', 'admin') AND s.id IS NOT NULL)
    )
  ORDER BY display_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_list_mention_participants_guest(
  p_app_token TEXT,
  p_conversation_id UUID
)
RETURNS TABLE(
  participant_id UUID,
  participant_type TEXT,
  display_name TEXT,
  avatar TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id UUID;
BEGIN
  SELECT g.id INTO v_guest_id FROM public.guests g WHERE g.app_token = p_app_token LIMIT 1;
  IF v_guest_id IS NULL THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = p_conversation_id AND c.type = 'group' AND c.name = 'Tüm Çalışanlar'
  ) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.participant_id = v_guest_id
      AND cp.participant_type = 'guest'
      AND cp.left_at IS NULL
  ) THEN
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
    END,
    CASE
      WHEN cp.participant_type = 'guest' THEN NULLIF(TRIM(g.photo_url), '')
      ELSE NULLIF(TRIM(s.profile_image), '')
    END
  FROM public.conversation_participants cp
  LEFT JOIN public.guests g ON g.id = cp.participant_id AND cp.participant_type = 'guest' AND g.deleted_at IS NULL
  LEFT JOIN public.staff s ON s.id = cp.participant_id AND cp.participant_type IN ('staff', 'admin') AND s.deleted_at IS NULL AND s.is_active = true
  WHERE cp.conversation_id = p_conversation_id
    AND cp.left_at IS NULL
    AND NOT (cp.participant_id = v_guest_id AND cp.participant_type = 'guest')
    AND (
      (cp.participant_type = 'guest' AND g.id IS NOT NULL)
      OR (cp.participant_type IN ('staff', 'admin') AND s.id IS NOT NULL)
    )
  ORDER BY display_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.messaging_list_mention_participants_staff(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_list_mention_participants_guest(TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.messaging_list_mention_participants_guest(TEXT, UUID) TO authenticated;

-- Misafir mesaj gönder: mentions
CREATE OR REPLACE FUNCTION public.messaging_send_message_guest(
  p_app_token TEXT,
  p_conversation_id UUID,
  p_content TEXT,
  p_message_type VARCHAR DEFAULT 'text',
  p_media_url TEXT DEFAULT NULL,
  p_media_thumbnail TEXT DEFAULT NULL,
  p_mentions JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id UUID;
  v_guest_name TEXT;
  v_guest_email TEXT;
  v_guest_photo TEXT;
  v_display_name TEXT;
  v_msg_id UUID;
BEGIN
  SELECT g.id, g.full_name, g.email, g.photo_url
  INTO v_guest_id, v_guest_name, v_guest_email, v_guest_photo
  FROM public.guests g
  WHERE g.app_token = p_app_token
  LIMIT 1;

  IF v_guest_id IS NULL THEN RETURN NULL; END IF;
  v_display_name := COALESCE(NULLIF(TRIM(v_guest_name), ''), NULLIF(TRIM(v_guest_email), ''), 'Misafir');

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id
      AND participant_id = v_guest_id
      AND participant_type = 'guest'
      AND left_at IS NULL
  ) THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    JOIN public.staff s
      ON s.id = cp.participant_id
     AND cp.participant_type IN ('staff', 'admin')
    WHERE cp.conversation_id = p_conversation_id
      AND cp.left_at IS NULL
      AND COALESCE((s.app_permissions->>'misafir_mesaj_alabilir')::boolean, true) = false
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.messages (
    conversation_id, sender_id, sender_type, sender_name, sender_avatar,
    message_type, content, media_url, media_thumbnail, mentions
  )
  VALUES (
    p_conversation_id,
    v_guest_id,
    'guest',
    v_display_name,
    NULLIF(TRIM(v_guest_photo), ''),
    COALESCE(NULLIF(p_message_type, ''), 'text'),
    p_content,
    NULLIF(p_media_url, ''),
    NULLIF(TRIM(p_media_thumbnail), ''),
    COALESCE(p_mentions, '[]'::jsonb)
  )
  RETURNING id INTO v_msg_id;

  UPDATE public.conversations
  SET last_message_id = v_msg_id, last_message_at = now(), updated_at = now()
  WHERE id = p_conversation_id;

  RETURN v_msg_id;
END;
$$;
