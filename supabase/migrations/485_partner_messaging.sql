-- Partner portal: personel ile direct mesajlaşma (misafir akışına paralel)

BEGIN;

ALTER TABLE public.conversation_participants
  DROP CONSTRAINT IF EXISTS conversation_participants_participant_type_check;
ALTER TABLE public.conversation_participants
  ADD CONSTRAINT conversation_participants_participant_type_check
  CHECK (participant_type IN ('guest', 'staff', 'admin', 'partner'));

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_sender_type_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_sender_type_check
  CHECK (sender_type IN ('guest', 'staff', 'admin', 'partner'));

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_created_by_type_check;
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_created_by_type_check
  CHECK (created_by_type IN ('guest', 'staff', 'admin', 'partner'));

CREATE OR REPLACE FUNCTION public.messaging_participant_types_match(
  p_stored_type VARCHAR,
  p_query_type VARCHAR
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_stored_type = p_query_type
    OR (
      p_stored_type IN ('staff', 'admin')
      AND p_query_type IN ('staff', 'admin')
    )
    OR (
      p_stored_type = 'guest'
      AND p_query_type = 'guest'
    )
    OR (
      p_stored_type = 'partner'
      AND p_query_type = 'partner'
    );
$$;

CREATE OR REPLACE FUNCTION public.messaging_get_or_create_direct(
  p_actor_id UUID,
  p_actor_type VARCHAR(20),
  p_other_id UUID,
  p_other_type VARCHAR(20)
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id UUID;
BEGIN
  IF p_actor_type NOT IN ('guest', 'staff', 'admin', 'partner')
     OR p_other_type NOT IN ('guest', 'staff', 'admin', 'partner') THEN
    RETURN NULL;
  END IF;

  SELECT c.id
  INTO v_conv_id
  FROM public.conversations c
  WHERE c.type = 'direct'
    AND EXISTS (
      SELECT 1
      FROM public.conversation_participants cp
      WHERE cp.conversation_id = c.id
        AND cp.participant_id = p_actor_id
        AND public.messaging_participant_types_match(cp.participant_type, p_actor_type)
    )
    AND EXISTS (
      SELECT 1
      FROM public.conversation_participants cp
      WHERE cp.conversation_id = c.id
        AND cp.participant_id = p_other_id
        AND public.messaging_participant_types_match(cp.participant_type, p_other_type)
    )
  ORDER BY c.last_message_at DESC NULLS LAST, c.created_at ASC
  LIMIT 1;

  IF v_conv_id IS NOT NULL THEN
    UPDATE public.conversation_participants cp
    SET left_at = NULL
    WHERE cp.conversation_id = v_conv_id
      AND cp.left_at IS NOT NULL
      AND (
        (
          cp.participant_id = p_actor_id
          AND public.messaging_participant_types_match(cp.participant_type, p_actor_type)
        )
        OR (
          cp.participant_id = p_other_id
          AND public.messaging_participant_types_match(cp.participant_type, p_other_type)
        )
      );
    RETURN v_conv_id;
  END IF;

  INSERT INTO public.conversations (type, created_by, created_by_type)
  VALUES ('direct', p_actor_id, p_actor_type)
  RETURNING id INTO v_conv_id;

  INSERT INTO public.conversation_participants (conversation_id, participant_id, participant_type)
  VALUES (v_conv_id, p_actor_id, p_actor_type);

  INSERT INTO public.conversation_participants (conversation_id, participant_id, participant_type)
  VALUES (v_conv_id, p_other_id, p_other_type);

  RETURN v_conv_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.breakfast_partner_current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public.breakfast_partner_users u
  JOIN public.breakfast_partner_hotels h ON h.id = u.partner_hotel_id
  WHERE u.auth_id = auth.uid()
    AND u.is_active = true
    AND h.status = 'active'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.breakfast_partner_current_user_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.messaging_list_staff_for_partner()
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
DECLARE
  v_org_id uuid;
BEGIN
  SELECT h.organization_id INTO v_org_id
  FROM public.breakfast_partner_hotels h
  WHERE h.id = public.breakfast_partner_current_hotel_id();

  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

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
  WHERE s.organization_id = v_org_id
    AND s.is_active = true
    AND s.deleted_at IS NULL
  ORDER BY s.department NULLS LAST, s.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.messaging_list_staff_for_partner() TO authenticated;

CREATE OR REPLACE FUNCTION public.messaging_partner_get_or_create_with_staff(p_staff_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_user_id UUID;
BEGIN
  v_partner_user_id := public.breakfast_partner_current_user_id();
  IF v_partner_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = p_staff_id
      AND s.is_active = true
      AND s.deleted_at IS NULL
      AND s.organization_id = (
        SELECT h.organization_id
        FROM public.breakfast_partner_users u
        JOIN public.breakfast_partner_hotels h ON h.id = u.partner_hotel_id
        WHERE u.id = v_partner_user_id
      )
  ) THEN
    RETURN NULL;
  END IF;

  RETURN public.messaging_get_or_create_direct(v_partner_user_id, 'partner', p_staff_id, 'staff');
END;
$$;

GRANT EXECUTE ON FUNCTION public.messaging_partner_get_or_create_with_staff(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.messaging_list_conversations_partner()
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
  WITH partner_ctx AS (
    SELECT
      u.id AS partner_user_id,
      COALESCE(u.created_at, '1970-01-01'::timestamptz) AS partner_created_at
    FROM public.breakfast_partner_users u
    WHERE u.id = public.breakfast_partner_current_user_id()
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
      AND cp.participant_type = 'partner'
      AND cp.left_at IS NULL
    INNER JOIN partner_ctx pc ON pc.partner_user_id = cp.participant_id
    WHERE c.type = 'direct'
      AND NOT (
        EXISTS (
          SELECT 1
          FROM public.conversation_participants cp2
          INNER JOIN public.staff s2
            ON s2.id = cp2.participant_id
            AND cp2.participant_type IN ('staff', 'admin')
          CROSS JOIN partner_ctx pc2
          WHERE cp2.conversation_id = c.id
            AND cp2.participant_id <> pc2.partner_user_id
            AND cp2.left_at IS NULL
            AND s2.deleted_at IS NOT NULL
        )
      )
  ),
  direct_staff AS (
    SELECT DISTINCT ON (cp.conversation_id)
      cp.conversation_id,
      COALESCE(NULLIF(TRIM(s.full_name), ''), 'Personel') AS staff_name,
      s.profile_image AS staff_avatar
    FROM public.conversation_participants cp
    INNER JOIN public.staff s
      ON s.id = cp.participant_id
      AND cp.participant_type IN ('staff', 'admin')
      AND s.deleted_at IS NULL
    INNER JOIN my_convs mc ON mc.id = cp.conversation_id
    CROSS JOIN partner_ctx pc
    WHERE cp.participant_id <> pc.partner_user_id
      AND cp.left_at IS NULL
    ORDER BY cp.conversation_id, cp.joined_at ASC NULLS LAST
  ),
  unread AS (
    SELECT
      m.conversation_id,
      COUNT(*)::bigint AS cnt
    FROM public.messages m
    INNER JOIN my_convs mc ON mc.id = m.conversation_id
    CROSS JOIN partner_ctx pc
    WHERE NOT m.is_deleted
      AND m.created_at >= pc.partner_created_at
      AND NOT (m.sender_id = pc.partner_user_id AND m.sender_type = 'partner')
      AND (mc.last_read_at IS NULL OR m.created_at > mc.last_read_at)
    GROUP BY m.conversation_id
  )
  SELECT
    mc.id,
    mc.type,
    ds.staff_name,
    ds.staff_avatar,
    mc.last_message_at,
    CASE
      WHEN lm.id IS NULL THEN NULL
      WHEN lm.message_type = 'text' THEN lm.content
      WHEN lm.message_type = 'image' THEN 'Fotoğraf'
      WHEN lm.message_type = 'voice' THEN 'Sesli mesaj'
      WHEN lm.message_type = 'video' THEN 'Video'
      ELSE COALESCE(lm.content, 'Mesaj')
    END,
    COALESCE(u.cnt, 0)::bigint
  FROM my_convs mc
  LEFT JOIN direct_staff ds ON ds.conversation_id = mc.id
  LEFT JOIN public.messages lm
    ON lm.id = mc.last_message_id
    AND NOT lm.is_deleted
    AND lm.created_at >= (SELECT partner_created_at FROM partner_ctx)
  LEFT JOIN unread u ON u.conversation_id = mc.id
  ORDER BY mc.last_message_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.messaging_list_conversations_partner() TO authenticated;

CREATE OR REPLACE FUNCTION public.messaging_unread_count_partner()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(COUNT(*), 0)::bigint
  FROM public.messages m
  INNER JOIN public.conversation_participants cp
    ON cp.conversation_id = m.conversation_id
    AND cp.participant_id = public.breakfast_partner_current_user_id()
    AND cp.participant_type = 'partner'
    AND cp.left_at IS NULL
  INNER JOIN public.breakfast_partner_users u ON u.id = cp.participant_id
  WHERE NOT m.is_deleted
    AND m.created_at >= COALESCE(u.created_at, '1970-01-01'::timestamptz)
    AND NOT (m.sender_id = u.id AND m.sender_type = 'partner')
    AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at);
$$;

GRANT EXECUTE ON FUNCTION public.messaging_unread_count_partner() TO authenticated;

CREATE OR REPLACE FUNCTION public.messaging_get_messages_partner(
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
  v_partner_user_id UUID;
  v_partner_created_at TIMESTAMPTZ;
BEGIN
  v_partner_user_id := public.breakfast_partner_current_user_id();
  IF v_partner_user_id IS NULL THEN RETURN; END IF;

  SELECT u.created_at INTO v_partner_created_at
  FROM public.breakfast_partner_users u
  WHERE u.id = v_partner_user_id;
  IF v_partner_created_at IS NULL THEN
    v_partner_created_at := '1970-01-01'::timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id
      AND participant_id = v_partner_user_id
      AND participant_type = 'partner'
      AND left_at IS NULL
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT m.* FROM public.messages m
  WHERE m.conversation_id = p_conversation_id
    AND NOT m.is_deleted
    AND m.created_at >= v_partner_created_at
    AND (p_before_id IS NULL OR m.created_at < (SELECT created_at FROM public.messages WHERE id = p_before_id LIMIT 1))
    AND (p_after_created_at IS NULL OR m.created_at > p_after_created_at)
  ORDER BY m.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.messaging_get_messages_partner(UUID, INT, UUID, TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.messaging_send_message_partner(
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

CREATE OR REPLACE FUNCTION public.messaging_partner_mark_conversation_read(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_user_id UUID;
BEGIN
  v_partner_user_id := public.breakfast_partner_current_user_id();
  IF v_partner_user_id IS NULL THEN RETURN false; END IF;

  UPDATE public.conversation_participants
  SET last_read_at = now()
  WHERE conversation_id = p_conversation_id
    AND participant_id = v_partner_user_id
    AND participant_type = 'partner'
    AND left_at IS NULL;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.messaging_partner_mark_conversation_read(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.messaging_get_conversation_header_partner(p_conversation_id UUID)
RETURNS TABLE(display_name TEXT, display_avatar TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_user_id UUID;
BEGIN
  v_partner_user_id := public.breakfast_partner_current_user_id();
  IF v_partner_user_id IS NULL THEN
    RETURN QUERY SELECT 'Sohbet'::text, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(NULLIF(TRIM(s.full_name), ''), 'Personel')::text,
    s.profile_image::text
  FROM public.conversation_participants cp
  INNER JOIN public.staff s
    ON s.id = cp.participant_id
    AND cp.participant_type IN ('staff', 'admin')
    AND s.deleted_at IS NULL
  WHERE cp.conversation_id = p_conversation_id
    AND cp.participant_id <> v_partner_user_id
    AND cp.left_at IS NULL
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.messaging_get_conversation_header_partner(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.messaging_delete_conversation_partner(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_user_id UUID;
BEGIN
  v_partner_user_id := public.breakfast_partner_current_user_id();
  IF v_partner_user_id IS NULL THEN RETURN FALSE; END IF;

  UPDATE public.conversation_participants
  SET left_at = now()
  WHERE conversation_id = p_conversation_id
    AND participant_id = v_partner_user_id
    AND participant_type = 'partner'
    AND left_at IS NULL;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.messaging_delete_conversation_partner(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.messaging_staff_get_or_create_direct(
  p_other_id UUID,
  p_other_type VARCHAR(20)
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id UUID;
  v_actor_type VARCHAR(20);
  v_other_type VARCHAR(20);
BEGIN
  IF p_other_type NOT IN ('guest', 'staff', 'admin', 'partner') THEN
    RETURN NULL;
  END IF;

  SELECT
    s.id,
    CASE WHEN s.role = 'admin' THEN 'admin' ELSE 'staff' END
  INTO v_staff_id, v_actor_type
  FROM public.staff s
  WHERE s.auth_id = auth.uid()
    AND s.is_active = true
    AND s.deleted_at IS NULL
  LIMIT 1;

  IF v_staff_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_other_id = v_staff_id THEN
    RETURN NULL;
  END IF;

  IF p_other_type = 'guest' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.guests g
      WHERE g.id = p_other_id AND g.deleted_at IS NULL
    ) THEN
      RETURN NULL;
    END IF;
    v_other_type := 'guest';
  ELSIF p_other_type = 'partner' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.breakfast_partner_users u
      JOIN public.breakfast_partner_hotels h ON h.id = u.partner_hotel_id
      WHERE u.id = p_other_id
        AND u.is_active = true
        AND h.status = 'active'
        AND h.organization_id = (
          SELECT s2.organization_id FROM public.staff s2 WHERE s2.id = v_staff_id
        )
    ) THEN
      RETURN NULL;
    END IF;
    v_other_type := 'partner';
  ELSE
    SELECT CASE WHEN s.role = 'admin' THEN 'admin' ELSE 'staff' END
    INTO v_other_type
    FROM public.staff s
    WHERE s.id = p_other_id
      AND s.is_active = true
      AND s.deleted_at IS NULL
    LIMIT 1;

    IF v_other_type IS NULL THEN
      RETURN NULL;
    END IF;
  END IF;

  RETURN public.messaging_get_or_create_direct(
    v_staff_id,
    v_actor_type,
    p_other_id,
    v_other_type
  );
END;
$$;

COMMIT;
