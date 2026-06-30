-- Personel/admin ve misafir kendi metin mesajlarını düzenleyebilir.

CREATE OR REPLACE FUNCTION public.messaging_edit_message_staff(
  p_conversation_id UUID,
  p_message_id UUID,
  p_content TEXT,
  p_mentions JSONB DEFAULT '[]'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id UUID;
  v_content TEXT;
BEGIN
  SELECT s.id
  INTO v_staff_id
  FROM public.staff s
  WHERE s.auth_id = auth.uid()
  LIMIT 1;

  IF v_staff_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.participant_id = v_staff_id
      AND cp.participant_type IN ('staff', 'admin')
      AND cp.left_at IS NULL
  ) THEN
    RETURN FALSE;
  END IF;

  v_content := trim(COALESCE(p_content, ''));
  IF char_length(v_content) = 0 OR char_length(v_content) > 2000 THEN
    RETURN FALSE;
  END IF;

  UPDATE public.messages
  SET content = v_content,
      mentions = COALESCE(p_mentions, '[]'::jsonb),
      is_edited = true,
      edited_at = now()
  WHERE id = p_message_id
    AND conversation_id = p_conversation_id
    AND sender_id = v_staff_id
    AND sender_type IN ('staff', 'admin')
    AND message_type = 'text'
    AND NOT is_deleted;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_edit_message_guest(
  p_app_token TEXT,
  p_message_id UUID,
  p_content TEXT,
  p_mentions JSONB DEFAULT '[]'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id UUID;
  v_conv_id UUID;
  v_content TEXT;
BEGIN
  v_guest_id := public.messaging_resolve_guest_id(p_app_token);
  IF v_guest_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT m.conversation_id
  INTO v_conv_id
  FROM public.messages m
  WHERE m.id = p_message_id
    AND NOT m.is_deleted
  LIMIT 1;

  IF v_conv_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = v_conv_id
      AND cp.participant_id = v_guest_id
      AND cp.participant_type = 'guest'
      AND cp.left_at IS NULL
  ) THEN
    RETURN FALSE;
  END IF;

  v_content := trim(COALESCE(p_content, ''));
  IF char_length(v_content) = 0 OR char_length(v_content) > 2000 THEN
    RETURN FALSE;
  END IF;

  UPDATE public.messages
  SET content = v_content,
      mentions = COALESCE(p_mentions, '[]'::jsonb),
      is_edited = true,
      edited_at = now()
  WHERE id = p_message_id
    AND conversation_id = v_conv_id
    AND sender_id = v_guest_id
    AND sender_type = 'guest'
    AND message_type = 'text'
    AND NOT is_deleted;

  RETURN FOUND;
END;
$$;
