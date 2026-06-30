-- PGRST203: messaging_send_message_partner için tek imza; PostgREST önbelleğini yenile.

BEGIN;

DO $drop$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'messaging_send_message_partner'
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig::text || ' CASCADE';
  END LOOP;
END $drop$;

CREATE FUNCTION public.messaging_send_message_partner(
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
  v_partner_user_id UUID;
  v_display_name TEXT;
  v_hotel_name TEXT;
  v_msg_id UUID;
BEGIN
  v_partner_user_id := public.breakfast_partner_current_user_id();
  IF v_partner_user_id IS NULL THEN RETURN NULL; END IF;

  SELECT
    COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.email), ''), 'Partner'),
    h.name
  INTO v_display_name, v_hotel_name
  FROM public.breakfast_partner_users u
  JOIN public.breakfast_partner_hotels h ON h.id = u.partner_hotel_id
  WHERE u.id = v_partner_user_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id
      AND participant_id = v_partner_user_id
      AND participant_type = 'partner'
      AND left_at IS NULL
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.messages (
    conversation_id, sender_id, sender_type, sender_name, sender_avatar,
    message_type, content, media_url, media_thumbnail, mentions
  )
  VALUES (
    p_conversation_id,
    v_partner_user_id,
    'partner',
    v_display_name || ' · ' || COALESCE(v_hotel_name, 'Partner'),
    NULL,
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

GRANT EXECUTE ON FUNCTION public.messaging_send_message_partner(UUID, TEXT, VARCHAR, TEXT, TEXT, JSONB) TO authenticated;

COMMENT ON FUNCTION public.messaging_send_message_partner(UUID, TEXT, VARCHAR, TEXT, TEXT, JSONB) IS
  'Partner mesaj gönderir (tek imza; PGRST203 yok).';

NOTIFY pgrst, 'reload schema';

COMMIT;
