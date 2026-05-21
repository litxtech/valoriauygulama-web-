-- Sohbet ekran görüntüsü bildirimi (grup: herkese, birebir: karşı tarafa)

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN ('text', 'image', 'file', 'location', 'voice', 'video', 'screenshot_notice'));

CREATE OR REPLACE FUNCTION public.messaging_report_screenshot_staff(p_conversation_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id UUID;
  v_staff_name TEXT;
  v_staff_avatar TEXT;
  v_msg_id UUID;
BEGIN
  SELECT s.id, COALESCE(NULLIF(TRIM(s.full_name), ''), NULLIF(TRIM(s.email), ''), 'Personel'), s.profile_image
  INTO v_staff_id, v_staff_name, v_staff_avatar
  FROM public.staff s
  WHERE s.auth_id = auth.uid()
    AND s.is_active = true
    AND s.deleted_at IS NULL
  LIMIT 1;

  IF v_staff_id IS NULL THEN RETURN NULL; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.participant_id = v_staff_id
      AND cp.participant_type IN ('staff', 'admin')
      AND cp.left_at IS NULL
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.messages (
    conversation_id, sender_id, sender_type, sender_name, sender_avatar, message_type, content
  )
  VALUES (
    p_conversation_id,
    v_staff_id,
    'staff',
    v_staff_name,
    NULLIF(TRIM(v_staff_avatar), ''),
    'screenshot_notice',
    'screenshot'
  )
  RETURNING id INTO v_msg_id;

  UPDATE public.conversations
  SET last_message_id = v_msg_id, last_message_at = now(), updated_at = now()
  WHERE id = p_conversation_id;

  RETURN v_msg_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_report_screenshot_guest(
  p_app_token TEXT,
  p_conversation_id UUID
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
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.participant_id = v_guest_id
      AND cp.participant_type = 'guest'
      AND cp.left_at IS NULL
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.messages (
    conversation_id, sender_id, sender_type, sender_name, sender_avatar, message_type, content
  )
  VALUES (
    p_conversation_id,
    v_guest_id,
    'guest',
    v_display_name,
    NULLIF(TRIM(v_guest_photo), ''),
    'screenshot_notice',
    'screenshot'
  )
  RETURNING id INTO v_msg_id;

  UPDATE public.conversations
  SET last_message_id = v_msg_id, last_message_at = now(), updated_at = now()
  WHERE id = p_conversation_id;

  RETURN v_msg_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.messaging_report_screenshot_staff(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_report_screenshot_guest(TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.messaging_report_screenshot_guest(TEXT, UUID) TO authenticated;

-- Sohbet listesi önizlemesi
CREATE OR REPLACE FUNCTION public.messaging_list_conversations_guest(p_app_token TEXT)
RETURNS TABLE(
  id UUID,
  type VARCHAR(20),
  name VARCHAR(255),
  avatar TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id UUID;
  v_guest_created_at TIMESTAMPTZ;
BEGIN
  SELECT g.id, g.created_at INTO v_guest_id, v_guest_created_at
  FROM public.guests g WHERE g.app_token = p_app_token LIMIT 1;
  IF v_guest_id IS NULL THEN RETURN; END IF;
  IF v_guest_created_at IS NULL THEN
    v_guest_created_at := '1970-01-01'::timestamptz;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.type,
    CASE
      WHEN c.type = 'direct' THEN (
        SELECT COALESCE(NULLIF(TRIM(s.full_name), ''), 'Personel')
        FROM public.conversation_participants cp
        JOIN public.staff s ON s.id = cp.participant_id AND cp.participant_type IN ('staff', 'admin')
        WHERE cp.conversation_id = c.id AND cp.participant_id <> v_guest_id AND cp.left_at IS NULL
        LIMIT 1
      )
      ELSE c.name
    END,
    CASE
      WHEN c.type = 'direct' THEN (
        SELECT s.profile_image
        FROM public.conversation_participants cp
        JOIN public.staff s ON s.id = cp.participant_id AND cp.participant_type IN ('staff', 'admin')
        WHERE cp.conversation_id = c.id AND cp.participant_id <> v_guest_id AND cp.left_at IS NULL
        LIMIT 1
      )
      ELSE c.avatar
    END,
    c.last_message_at,
    (SELECT CASE
      WHEN m.message_type = 'text' THEN m.content
      WHEN m.message_type = 'image' THEN 'Fotoğraf'
      WHEN m.message_type = 'voice' THEN 'Sesli mesaj'
      WHEN m.message_type = 'video' THEN 'Video'
      WHEN m.message_type = 'screenshot_notice' THEN
        COALESCE(NULLIF(TRIM(m.sender_name), ''), 'Kullanıcı') || ' ekran görüntüsü aldı'
      ELSE COALESCE(m.content, 'Mesaj')
    END FROM public.messages m
     WHERE m.id = c.last_message_id AND NOT m.is_deleted
       AND m.created_at >= v_guest_created_at
     LIMIT 1),
    (SELECT COUNT(*)::BIGINT
     FROM public.messages m
     JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.participant_id = v_guest_id AND cp.participant_type = 'guest' AND cp.left_at IS NULL
     WHERE m.conversation_id = c.id AND m.sender_id <> v_guest_id AND m.sender_type <> 'guest'
       AND NOT m.is_deleted
       AND m.created_at >= v_guest_created_at
       AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at))
  FROM public.conversations c
  JOIN public.conversation_participants cp ON cp.conversation_id = c.id AND cp.participant_id = v_guest_id AND cp.participant_type = 'guest' AND cp.left_at IS NULL
  WHERE NOT (c.type = 'group' AND c.name = 'Tüm Çalışanlar')
  ORDER BY c.last_message_at DESC NULLS LAST;
END;
$$;
