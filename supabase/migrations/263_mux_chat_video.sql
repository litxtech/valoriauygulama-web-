-- Mux direct upload: mesajlaşmada video tipi + upload takibi

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN ('text', 'image', 'file', 'location', 'voice', 'video'));

CREATE TABLE IF NOT EXISTS public.message_mux_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  mux_upload_id TEXT NOT NULL UNIQUE,
  mux_asset_id TEXT,
  mux_playback_id TEXT,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'uploading', 'processing', 'ready', 'errored')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_mux_uploads_message ON public.message_mux_uploads(message_id);
CREATE INDEX IF NOT EXISTS idx_message_mux_uploads_asset ON public.message_mux_uploads(mux_asset_id);

ALTER TABLE public.message_mux_uploads ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.message_mux_uploads IS 'Mux direct upload durumu; güncelleme yalnızca service role / edge webhook.';

-- Sohbet listesi önizlemesi: video
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
