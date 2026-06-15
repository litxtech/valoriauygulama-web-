-- Misafir mesajlaşma: app_token yanında auth.uid() ile misafir eşleştirme (token uyumsuzluğu düzeltmesi)

BEGIN;

CREATE OR REPLACE FUNCTION public.messaging_resolve_guest_id(p_app_token text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.id
  FROM public.guests g
  WHERE g.deleted_at IS NULL
    AND (
      (
        NULLIF(trim(COALESCE(p_app_token, '')), '') IS NOT NULL
        AND g.app_token = NULLIF(trim(p_app_token), '')
      )
      OR (auth.uid() IS NOT NULL AND g.auth_user_id = auth.uid())
    )
  ORDER BY
    CASE
      WHEN NULLIF(trim(COALESCE(p_app_token, '')), '') IS NOT NULL
        AND g.app_token = NULLIF(trim(p_app_token), '') THEN 0
      WHEN auth.uid() IS NOT NULL AND g.auth_user_id = auth.uid() THEN 1
      ELSE 2
    END,
    g.created_at DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.messaging_resolve_guest_id(text) IS
  'Mesajlaşma RPC: app_token veya auth.uid() ile misafir id çözümleme.';

GRANT EXECUTE ON FUNCTION public.messaging_resolve_guest_id(text) TO anon;
GRANT EXECUTE ON FUNCTION public.messaging_resolve_guest_id(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.messaging_guest_get_or_create_with_staff(p_app_token TEXT, p_staff_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id UUID;
BEGIN
  v_guest_id := public.messaging_resolve_guest_id(p_app_token);
  IF v_guest_id IS NULL THEN RETURN NULL; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = p_staff_id AND s.is_active = true AND s.deleted_at IS NULL
  ) THEN
    RETURN NULL;
  END IF;

  RETURN public.messaging_get_or_create_direct(v_guest_id, 'guest', p_staff_id, 'staff');
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_guest_resolve_direct_conversation(
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
  v_conv_type VARCHAR(20);
  v_other_id UUID;
  v_other_type VARCHAR(20);
BEGIN
  v_guest_id := public.messaging_resolve_guest_id(p_app_token);
  IF v_guest_id IS NULL THEN RETURN NULL; END IF;

  SELECT c.type
  INTO v_conv_type
  FROM public.conversations c
  WHERE c.id = p_conversation_id
  LIMIT 1;

  IF v_conv_type IS NULL THEN RETURN NULL; END IF;
  IF v_conv_type <> 'direct' THEN RETURN p_conversation_id; END IF;

  SELECT cp.participant_id, cp.participant_type
  INTO v_other_id, v_other_type
  FROM public.conversation_participants cp
  WHERE cp.conversation_id = p_conversation_id
    AND NOT (cp.participant_id = v_guest_id AND cp.participant_type = 'guest')
  LIMIT 1;

  IF v_other_id IS NULL OR v_other_type IS NULL THEN
    RETURN p_conversation_id;
  END IF;

  RETURN public.messaging_get_or_create_direct(v_guest_id, 'guest', v_other_id, v_other_type);
END;
$$;

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
  v_conv_id UUID;
BEGIN
  v_guest_id := public.messaging_resolve_guest_id(p_app_token);
  IF v_guest_id IS NULL THEN RETURN NULL; END IF;

  SELECT g.full_name, g.email, g.photo_url
  INTO v_guest_name, v_guest_email, v_guest_photo
  FROM public.guests g
  WHERE g.id = v_guest_id;

  v_display_name := COALESCE(NULLIF(TRIM(v_guest_name), ''), NULLIF(TRIM(v_guest_email), ''), 'Misafir');

  v_conv_id := public.messaging_guest_resolve_direct_conversation(p_app_token, p_conversation_id);
  IF v_conv_id IS NULL THEN RETURN NULL; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = v_conv_id
      AND participant_id = v_guest_id
      AND participant_type = 'guest'
      AND left_at IS NULL
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.messages (
    conversation_id, sender_id, sender_type, sender_name, sender_avatar,
    message_type, content, media_url, media_thumbnail, mentions
  )
  VALUES (
    v_conv_id,
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
  WHERE id = v_conv_id;

  RETURN v_msg_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.messaging_guest_get_or_create_with_staff(TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.messaging_guest_get_or_create_with_staff(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_guest_resolve_direct_conversation(TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.messaging_guest_resolve_direct_conversation(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_send_message_guest(TEXT, UUID, TEXT, VARCHAR, TEXT, TEXT, JSONB) TO anon;
GRANT EXECUTE ON FUNCTION public.messaging_send_message_guest(TEXT, UUID, TEXT, VARCHAR, TEXT, TEXT, JSONB) TO authenticated;

COMMIT;
