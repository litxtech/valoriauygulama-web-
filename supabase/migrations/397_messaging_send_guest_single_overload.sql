-- PostgREST PGRST203: messaging_send_message_guest için birden fazla imza vardı;
-- istemci kısmi parametre gönderince "Could not choose the best candidate" (HTTP 300) oluşuyordu.

BEGIN;

DROP FUNCTION IF EXISTS public.messaging_send_message_guest(TEXT, UUID, TEXT, VARCHAR);
DROP FUNCTION IF EXISTS public.messaging_send_message_guest(TEXT, UUID, TEXT, VARCHAR, TEXT);
DROP FUNCTION IF EXISTS public.messaging_send_message_guest(TEXT, UUID, TEXT, VARCHAR, TEXT, TEXT);

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

GRANT EXECUTE ON FUNCTION public.messaging_send_message_guest(TEXT, UUID, TEXT, VARCHAR, TEXT, TEXT, JSONB) TO anon;
GRANT EXECUTE ON FUNCTION public.messaging_send_message_guest(TEXT, UUID, TEXT, VARCHAR, TEXT, TEXT, JSONB) TO authenticated;

COMMENT ON FUNCTION public.messaging_send_message_guest(TEXT, UUID, TEXT, VARCHAR, TEXT, TEXT, JSONB) IS
  'Misafir mesaj gönderir; tek RPC imzası (PGRST203 önlenir).';

COMMIT;
