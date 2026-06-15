-- Misafir hesapları: mesajlaşma ve oturum tabanlı işlemlerde tam erişim.
-- 1) app_token + auth.uid() ile misafir eşleştirme tüm mesaj RPC'lerinde
-- 2) Personel "misafir_mesaj_alabilir" engeli yok (390 ile uyumlu, yeniden onay)
-- 3) current_guest_id() RLS için güçlendirildi

BEGIN;

-- RLS / doğrudan tablo erişimi: auth.uid() ile en güncel misafir satırı
CREATE OR REPLACE FUNCTION public.current_guest_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT g.id
  FROM public.guests g
  WHERE g.auth_user_id = auth.uid()
    AND g.deleted_at IS NULL
  ORDER BY g.created_at DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.current_guest_id() IS
  'Oturumdaki kullanıcının misafir kaydı (en yeni satır).';

CREATE OR REPLACE FUNCTION public.get_guest_messaging_identity(p_app_token TEXT)
RETURNS TABLE(guest_id UUID, full_name TEXT, room_number TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id UUID;
BEGIN
  v_guest_id := public.messaging_resolve_guest_id(p_app_token);
  IF v_guest_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT g.id, g.full_name, r.room_number
  FROM public.guests g
  LEFT JOIN public.rooms r ON r.id = g.room_id
  WHERE g.id = v_guest_id
  LIMIT 1;
END;
$$;

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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH guest_ctx AS (
    SELECT
      g.id AS guest_id,
      COALESCE(g.created_at, '1970-01-01'::timestamptz) AS guest_created_at
    FROM public.guests g
    WHERE g.id = public.messaging_resolve_guest_id(p_app_token)
    LIMIT 1
  ),
  my_convs AS (
    SELECT
      c.id,
      c.type,
      c.name,
      c.avatar,
      c.last_message_id,
      c.last_message_at,
      cp.last_read_at
    FROM public.conversations c
    INNER JOIN public.conversation_participants cp
      ON cp.conversation_id = c.id
      AND cp.participant_type = 'guest'
      AND cp.left_at IS NULL
    INNER JOIN guest_ctx gc ON gc.guest_id = cp.participant_id
    WHERE NOT (c.type = 'group' AND c.name = 'Tüm Çalışanlar')
      AND NOT (
        c.type = 'direct'
        AND EXISTS (
          SELECT 1
          FROM public.conversation_participants cp2
          INNER JOIN public.staff s2
            ON s2.id = cp2.participant_id
            AND cp2.participant_type IN ('staff', 'admin')
          CROSS JOIN guest_ctx gc2
          WHERE cp2.conversation_id = c.id
            AND cp2.participant_id <> gc2.guest_id
            AND cp2.left_at IS NULL
            AND s2.deleted_at IS NOT NULL
        )
      )
  ),
  direct_staff AS (
    SELECT DISTINCT ON (cp.conversation_id)
      cp.conversation_id,
      CASE
        WHEN coalesce(s.profile_hidden_by_admin, false)
        THEN public.mask_staff_display_name_for_privacy(s.full_name)
        ELSE COALESCE(NULLIF(TRIM(s.full_name), ''), 'Personel')
      END AS staff_name,
      s.profile_image AS staff_avatar
    FROM public.conversation_participants cp
    INNER JOIN public.staff s
      ON s.id = cp.participant_id
      AND cp.participant_type IN ('staff', 'admin')
      AND s.deleted_at IS NULL
    INNER JOIN my_convs mc
      ON mc.id = cp.conversation_id
      AND mc.type = 'direct'
    CROSS JOIN guest_ctx gc
    WHERE cp.participant_id <> gc.guest_id
      AND cp.left_at IS NULL
    ORDER BY cp.conversation_id, cp.joined_at ASC NULLS LAST
  ),
  unread AS (
    SELECT
      m.conversation_id,
      COUNT(*)::bigint AS cnt
    FROM public.messages m
    INNER JOIN my_convs mc ON mc.id = m.conversation_id
    CROSS JOIN guest_ctx gc
    WHERE NOT m.is_deleted
      AND m.created_at >= gc.guest_created_at
      AND m.sender_id <> gc.guest_id
      AND m.sender_type <> 'guest'
      AND (mc.last_read_at IS NULL OR m.created_at > mc.last_read_at)
    GROUP BY m.conversation_id
  )
  SELECT
    mc.id,
    mc.type,
    CASE
      WHEN mc.type = 'direct' THEN ds.staff_name
      ELSE mc.name
    END,
    CASE
      WHEN mc.type = 'direct' THEN ds.staff_avatar
      ELSE mc.avatar
    END,
    mc.last_message_at,
    CASE
      WHEN lm.id IS NULL THEN NULL
      WHEN lm.message_type = 'text' THEN lm.content
      WHEN lm.message_type = 'image' THEN 'Fotoğraf'
      WHEN lm.message_type = 'voice' THEN 'Sesli mesaj'
      WHEN lm.message_type = 'video' THEN 'Video'
      WHEN lm.message_type = 'screenshot_notice' THEN
        COALESCE(NULLIF(TRIM(lm.sender_name), ''), 'Kullanıcı') || ' ekran görüntüsü aldı'
      ELSE COALESCE(lm.content, 'Mesaj')
    END,
    COALESCE(u.cnt, 0)::bigint
  FROM my_convs mc
  LEFT JOIN direct_staff ds ON ds.conversation_id = mc.id
  LEFT JOIN public.messages lm
    ON lm.id = mc.last_message_id
    AND NOT lm.is_deleted
    AND lm.created_at >= (SELECT guest_created_at FROM guest_ctx)
  LEFT JOIN unread u ON u.conversation_id = mc.id
  ORDER BY mc.last_message_at DESC NULLS LAST;
$$;

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
  v_conv_id UUID;
BEGIN
  v_guest_id := public.messaging_resolve_guest_id(p_app_token);
  IF v_guest_id IS NULL THEN RETURN; END IF;

  SELECT g.created_at INTO v_guest_created_at FROM public.guests g WHERE g.id = v_guest_id;
  IF v_guest_created_at IS NULL THEN
    v_guest_created_at := '1970-01-01'::timestamptz;
  END IF;

  v_conv_id := public.messaging_guest_resolve_direct_conversation(p_app_token, p_conversation_id);
  IF v_conv_id IS NULL THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = v_conv_id AND c.type = 'group' AND c.name = 'Tüm Çalışanlar'
  ) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = v_conv_id
      AND participant_id = v_guest_id
      AND participant_type = 'guest'
      AND left_at IS NULL
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT m.* FROM public.messages m
  WHERE m.conversation_id = v_conv_id AND NOT m.is_deleted
    AND m.created_at >= v_guest_created_at
    AND (p_before_id IS NULL OR m.created_at < (SELECT created_at FROM public.messages WHERE id = p_before_id LIMIT 1))
    AND (p_after_created_at IS NULL OR m.created_at > p_after_created_at)
  ORDER BY m.created_at DESC
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_guest_mark_conversation_read(p_app_token TEXT, p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id UUID;
  v_conv_id UUID;
BEGIN
  v_guest_id := public.messaging_resolve_guest_id(p_app_token);
  IF v_guest_id IS NULL THEN RETURN false; END IF;

  v_conv_id := public.messaging_guest_resolve_direct_conversation(p_app_token, p_conversation_id);
  IF v_conv_id IS NULL THEN RETURN false; END IF;

  UPDATE public.conversation_participants
  SET last_read_at = now()
  WHERE conversation_id = v_conv_id
    AND participant_id = v_guest_id
    AND participant_type = 'guest'
    AND left_at IS NULL;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_delete_conversation_guest(
  p_app_token TEXT,
  p_conversation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id UUID;
  v_conv_id UUID;
BEGIN
  v_guest_id := public.messaging_resolve_guest_id(p_app_token);
  IF v_guest_id IS NULL THEN RETURN FALSE; END IF;

  v_conv_id := public.messaging_guest_resolve_direct_conversation(p_app_token, p_conversation_id);
  IF v_conv_id IS NULL THEN RETURN FALSE; END IF;

  UPDATE public.conversation_participants
  SET left_at = now()
  WHERE conversation_id = v_conv_id
    AND participant_id = v_guest_id
    AND participant_type = 'guest'
    AND left_at IS NULL;

  IF NOT FOUND THEN RETURN FALSE; END IF;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_delete_message_guest(p_app_token TEXT, p_message_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id UUID;
  v_conv_id UUID;
  v_last_id UUID;
  v_prev_id UUID;
  v_prev_at TIMESTAMPTZ;
BEGIN
  v_guest_id := public.messaging_resolve_guest_id(p_app_token);
  IF v_guest_id IS NULL THEN RETURN FALSE; END IF;

  SELECT m.conversation_id INTO v_conv_id
  FROM public.messages m
  WHERE m.id = p_message_id AND NOT m.is_deleted
  LIMIT 1;
  IF v_conv_id IS NULL THEN RETURN FALSE; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = v_conv_id AND participant_id = v_guest_id AND participant_type = 'guest' AND left_at IS NULL
  ) THEN
    RETURN FALSE;
  END IF;

  UPDATE public.messages
  SET is_deleted = true, deleted_at = now()
  WHERE id = p_message_id
    AND sender_id = v_guest_id AND sender_type = 'guest';
  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT c.last_message_id INTO v_last_id FROM public.conversations c WHERE c.id = v_conv_id;
  IF v_last_id = p_message_id THEN
    SELECT m.id, m.created_at INTO v_prev_id, v_prev_at
    FROM public.messages m
    WHERE m.conversation_id = v_conv_id AND NOT m.is_deleted
    ORDER BY m.created_at DESC
    LIMIT 1;
    UPDATE public.conversations
    SET last_message_id = v_prev_id, last_message_at = v_prev_at, updated_at = now()
    WHERE id = v_conv_id;
  END IF;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_get_conversation_header_guest(p_app_token TEXT, p_conversation_id UUID)
RETURNS TABLE(display_name TEXT, display_avatar TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id UUID;
  v_conv_id UUID;
  v_other_id UUID;
  v_other_type TEXT;
  v_conv_type VARCHAR(20);
  v_conv_name VARCHAR(255);
  v_conv_avatar TEXT;
BEGIN
  v_guest_id := public.messaging_resolve_guest_id(p_app_token);
  IF v_guest_id IS NULL THEN RETURN; END IF;

  v_conv_id := public.messaging_guest_resolve_direct_conversation(p_app_token, p_conversation_id);
  IF v_conv_id IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = v_conv_id AND participant_id = v_guest_id AND participant_type = 'guest' AND left_at IS NULL
  ) THEN
    RETURN;
  END IF;

  SELECT c.type, c.name, c.avatar INTO v_conv_type, v_conv_name, v_conv_avatar
  FROM public.conversations c WHERE c.id = v_conv_id;

  IF v_conv_type = 'group' THEN
    display_name := COALESCE(v_conv_name, 'Sohbet');
    display_avatar := v_conv_avatar;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT cp.participant_id, cp.participant_type INTO v_other_id, v_other_type
  FROM public.conversation_participants cp
  WHERE cp.conversation_id = v_conv_id AND cp.participant_id <> v_guest_id AND cp.left_at IS NULL
  LIMIT 1;

  IF v_other_type IN ('staff', 'admin') AND v_other_id IS NOT NULL THEN
    SELECT
      CASE
        WHEN coalesce(s.profile_hidden_by_admin, false)
        THEN public.mask_staff_display_name_for_privacy(s.full_name)
        ELSE COALESCE(s.full_name, 'Personel')
      END,
      s.profile_image
    INTO display_name, display_avatar
    FROM public.staff s WHERE s.id = v_other_id;
    RETURN NEXT;
    RETURN;
  END IF;

  display_name := COALESCE(v_conv_name, 'Sohbet');
  display_avatar := v_conv_avatar;
  RETURN NEXT;
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
  v_conv_id UUID;
BEGIN
  v_guest_id := public.messaging_resolve_guest_id(p_app_token);
  IF v_guest_id IS NULL THEN RETURN NULL; END IF;

  SELECT g.full_name, g.email, g.photo_url
  INTO v_guest_name, v_guest_email, v_guest_photo
  FROM public.guests g WHERE g.id = v_guest_id;

  v_display_name := COALESCE(NULLIF(TRIM(v_guest_name), ''), NULLIF(TRIM(v_guest_email), ''), 'Misafir');

  v_conv_id := public.messaging_guest_resolve_direct_conversation(p_app_token, p_conversation_id);
  IF v_conv_id IS NULL THEN RETURN NULL; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = v_conv_id
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
    v_conv_id,
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
  WHERE id = v_conv_id;

  RETURN v_msg_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_guest_push_token(p_app_token TEXT, p_token TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_guest_id UUID;
BEGIN
  IF p_app_token IS NULL OR p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN;
  END IF;
  v_guest_id := public.messaging_resolve_guest_id(p_app_token);
  IF v_guest_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.push_tokens (guest_id, staff_id, token, device_info)
  VALUES (v_guest_id, NULL, btrim(p_token), '{}'::jsonb)
  ON CONFLICT (token) DO UPDATE SET
    guest_id = EXCLUDED.guest_id,
    staff_id = NULL;
END;
$$;

-- Misafir → tüm aktif personele sohbet (personel misafir_mesaj_alabilir engeli yok)
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

GRANT EXECUTE ON FUNCTION public.messaging_list_staff_for_guest() TO anon;
GRANT EXECUTE ON FUNCTION public.messaging_list_staff_for_guest() TO authenticated;

-- Misafir talepleri: current_guest_id ile RLS
DROP POLICY IF EXISTS guest_service_requests_select_own ON public.guest_service_requests;
CREATE POLICY guest_service_requests_select_own ON public.guest_service_requests
  FOR SELECT TO authenticated
  USING (guest_id = public.current_guest_id());

DROP POLICY IF EXISTS guest_service_requests_insert_own ON public.guest_service_requests;
CREATE POLICY guest_service_requests_insert_own ON public.guest_service_requests
  FOR INSERT TO authenticated
  WITH CHECK (guest_id = public.current_guest_id());

COMMENT ON FUNCTION public.messaging_list_conversations_guest(TEXT) IS
  'Misafir sohbet listesi; app_token veya auth.uid() ile misafir eşleştirme (396).';

COMMIT;
