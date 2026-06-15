-- Misafir mesaj gönderimi: tek, yeni RPC adı (PostgREST önbellek / PGRST203 riski yok).

BEGIN;

CREATE OR REPLACE FUNCTION public.guest_send_chat_message(
  p_app_token TEXT,
  p_conversation_id UUID,
  p_content TEXT,
  p_message_type VARCHAR DEFAULT 'text',
  p_media_url TEXT DEFAULT NULL,
  p_media_thumbnail TEXT DEFAULT NULL,
  p_mentions JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.messaging_send_message_guest(
    p_app_token,
    p_conversation_id,
    p_content,
    p_message_type,
    p_media_url,
    p_media_thumbnail,
    p_mentions
  );
$$;

GRANT EXECUTE ON FUNCTION public.guest_send_chat_message(TEXT, UUID, TEXT, VARCHAR, TEXT, TEXT, JSONB) TO anon;
GRANT EXECUTE ON FUNCTION public.guest_send_chat_message(TEXT, UUID, TEXT, VARCHAR, TEXT, TEXT, JSONB) TO authenticated;

COMMENT ON FUNCTION public.guest_send_chat_message IS
  'Misafir sohbet mesajı — messaging_send_message_guest sarmalayıcısı (tek imza).';

NOTIFY pgrst, 'reload schema';

COMMIT;
