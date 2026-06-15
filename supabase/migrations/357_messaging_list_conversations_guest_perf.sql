-- messaging_list_conversations_guest: konu başına COUNT alt sorguları statement timeout'a yol açıyordu.
-- Okunmamış sayısı tek GROUP BY ile; direct isim/avatar ve son mesaj önizlemesi JOIN ile.

CREATE INDEX IF NOT EXISTS idx_messages_conv_active_created
  ON public.messages (conversation_id, created_at)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_conv_participants_guest_active
  ON public.conversation_participants (participant_id, participant_type, conversation_id)
  WHERE left_at IS NULL;

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
    WHERE g.app_token = p_app_token
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
      COALESCE(NULLIF(TRIM(s.full_name), ''), 'Personel') AS staff_name,
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

-- Rozet RPC: aynı N+1 döngüsü
CREATE OR REPLACE FUNCTION public.messaging_unread_count_guest(p_guest_id uuid)
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
    AND cp.participant_id = p_guest_id
    AND cp.participant_type = 'guest'
    AND cp.left_at IS NULL
  INNER JOIN public.guests g ON g.id = p_guest_id
  WHERE NOT m.is_deleted
    AND m.created_at >= COALESCE(g.created_at, '1970-01-01'::timestamptz)
    AND m.sender_id <> p_guest_id
    AND m.sender_type <> 'guest'
    AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at);
$$;

COMMENT ON FUNCTION public.messaging_list_conversations_guest(TEXT) IS
  'Misafir sohbet listesi; okunmamış sayısı tek GROUP BY ile (357 performans).';
