-- Misafir mesaj listesi: önbellekten girişte sadece yeni mesajları çekmek için p_after_created_at
CREATE OR REPLACE FUNCTION public.messaging_get_messages_guest(
  p_app_token TEXT,
  p_conversation_id UUID,
  p_limit INT DEFAULT 50,
  p_before_id UUID DEFAULT NULL,
  p_after_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF public.messages
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

  IF EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = p_conversation_id AND c.type = 'group' AND c.name = 'Tüm Çalışanlar') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id
      AND participant_id = v_guest_id
      AND participant_type = 'guest'
      AND left_at IS NULL
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT m.* FROM public.messages m
  WHERE m.conversation_id = p_conversation_id AND NOT m.is_deleted
    AND m.created_at >= v_guest_created_at
    AND (p_before_id IS NULL OR m.created_at < (SELECT created_at FROM public.messages WHERE id = p_before_id LIMIT 1))
    AND (p_after_created_at IS NULL OR m.created_at > p_after_created_at)
  ORDER BY m.created_at DESC
  LIMIT p_limit;
END;
$$;
