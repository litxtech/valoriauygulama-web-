-- Misafir mesajlaşma: personel bazlı engeli kaldır.
-- misafir_mesaj_alabilir artık misafirin yazmasını engellemez (yalnızca personel tercihi olarak saklanabilir).

BEGIN;

CREATE OR REPLACE FUNCTION public.messaging_guest_get_or_create_with_staff(p_app_token TEXT, p_staff_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id UUID;
BEGIN
  SELECT g.id INTO v_guest_id FROM public.guests g WHERE g.app_token = p_app_token LIMIT 1;
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

DROP FUNCTION IF EXISTS public.messaging_list_staff_for_guest();

CREATE FUNCTION public.messaging_list_staff_for_guest()
RETURNS TABLE(
  id UUID,
  full_name TEXT,
  department TEXT,
  profile_image TEXT,
  is_online BOOLEAN,
  role TEXT,
  verification_badge TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    CASE
      WHEN coalesce(s.profile_hidden_by_admin, false)
      THEN public.mask_staff_display_name_for_privacy(s.full_name)
      ELSE s.full_name
    END,
    CASE
      WHEN coalesce(s.profile_hidden_by_admin, false) THEN NULL::text
      ELSE s.department
    END,
    s.profile_image,
    s.is_online,
    s.role,
    CASE
      WHEN coalesce(s.profile_hidden_by_admin, false) THEN NULL::text
      ELSE s.verification_badge::text
    END
  FROM public.staff s
  WHERE s.is_active = true
    AND s.deleted_at IS NULL
  ORDER BY s.full_name;
END;
$$;

COMMENT ON FUNCTION public.messaging_list_staff_for_guest() IS
  'Misafir yeni sohbet: aktif personel listesi (gizli profilde isim maskeli).';

GRANT EXECUTE ON FUNCTION public.messaging_list_staff_for_guest() TO anon;
GRANT EXECUTE ON FUNCTION public.messaging_list_staff_for_guest() TO authenticated;

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

COMMIT;
