-- Personel/admin sohbet listesi: istemcide ~9 ayrı sorgu + tüm mesajların indirilmesi
-- (okunmamış sayımı için) ekranı çok yavaşlatıyordu. Misafir/partner akışına paralel
-- olarak tek bir SECURITY DEFINER RPC ile sunucuda tek tur (round-trip) hesaplanıyor.

-- Okunmamış ve son mesaj sorguları için indeksler (357'deki guest indeksleriyle paralel)
CREATE INDEX IF NOT EXISTS idx_messages_conv_active_created
  ON public.messages (conversation_id, created_at)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_conv_participants_active_lookup
  ON public.conversation_participants (participant_id, participant_type, conversation_id)
  WHERE left_at IS NULL;

CREATE OR REPLACE FUNCTION public.messaging_list_conversations_staff(p_staff_id uuid DEFAULT NULL)
RETURNS TABLE(
  id UUID,
  type VARCHAR(20),
  name VARCHAR(255),
  avatar TEXT,
  group_theme_color TEXT,
  created_by UUID,
  created_by_type VARCHAR(20),
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  last_message_id UUID,
  last_message_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count BIGINT,
  is_pinned BOOLEAN,
  is_muted BOOLEAN,
  is_archived BOOLEAN,
  other_avatar TEXT,
  other_participant JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_staff_created_at timestamptz;
BEGIN
  -- Çağıranın kimliğini doğrula (admin/personel aynı authenticated client'ı kullanır).
  IF auth.uid() IS NOT NULL THEN
    SELECT s.id, COALESCE(s.created_at, '1970-01-01'::timestamptz)
    INTO v_staff_id, v_staff_created_at
    FROM public.staff s
    WHERE s.auth_id = auth.uid()
      AND s.deleted_at IS NULL
      AND s.is_active = true
    LIMIT 1;

    IF v_staff_id IS NULL THEN
      RETURN;
    END IF;
    IF p_staff_id IS NOT NULL AND p_staff_id IS DISTINCT FROM v_staff_id THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  ELSE
    -- service_role / sunucu bağlamı: açık p_staff_id ile
    IF p_staff_id IS NULL THEN
      RETURN;
    END IF;
    v_staff_id := p_staff_id;
    SELECT COALESCE(s.created_at, '1970-01-01'::timestamptz)
    INTO v_staff_created_at
    FROM public.staff s
    WHERE s.id = v_staff_id
    LIMIT 1;
    IF v_staff_created_at IS NULL THEN
      v_staff_created_at := '1970-01-01'::timestamptz;
    END IF;
  END IF;

  RETURN QUERY
  WITH my_parts AS (
    SELECT
      cp.conversation_id,
      cp.last_read_at,
      COALESCE(cp.is_pinned, false) AS is_pinned,
      COALESCE(cp.is_muted, false) AS is_muted
    FROM public.conversation_participants cp
    WHERE cp.participant_id = v_staff_id
      AND cp.participant_type IN ('staff', 'admin')
      AND cp.left_at IS NULL
      AND COALESCE(cp.is_archived, false) = false
  ),
  my_convs AS (
    SELECT
      c.id, c.type, c.name, c.avatar, c.group_theme_color,
      c.created_by, c.created_by_type, c.created_at, c.updated_at,
      c.last_message_id, c.last_message_at, c.closed_at,
      mp.last_read_at, mp.is_pinned, mp.is_muted
    FROM public.conversations c
    INNER JOIN my_parts mp ON mp.conversation_id = c.id
  ),
  other_p AS (
    SELECT DISTINCT ON (cp.conversation_id)
      cp.conversation_id,
      cp.participant_id,
      cp.participant_type
    FROM public.conversation_participants cp
    INNER JOIN my_convs mc ON mc.id = cp.conversation_id AND mc.type = 'direct'
    WHERE cp.participant_id <> v_staff_id
      AND cp.left_at IS NULL
    ORDER BY cp.conversation_id, cp.joined_at ASC NULLS LAST
  ),
  other_resolved AS (
    SELECT
      op.conversation_id,
      op.participant_id,
      op.participant_type,
      CASE
        WHEN op.participant_type = 'guest' THEN COALESCE(NULLIF(TRIM(g.full_name), ''), 'Misafir')
        WHEN op.participant_type = 'partner' THEN
          COALESCE(NULLIF(TRIM(pu.full_name), ''), 'Partner')
          || COALESCE(NULLIF(' · ' || NULLIF(TRIM(ph.name), ''), ' · '), '')
        ELSE COALESCE(NULLIF(TRIM(s.full_name), ''), 'Personel')
      END AS other_name,
      CASE
        WHEN op.participant_type = 'guest' THEN g.photo_url
        WHEN op.participant_type = 'partner' THEN NULL
        ELSE s.profile_image
      END AS other_avatar,
      CASE
        WHEN op.participant_type IN ('staff', 'admin') THEN COALESCE(s.is_online, false)
        ELSE NULL
      END AS other_online,
      (op.participant_type = 'guest' AND g.deleted_at IS NOT NULL) AS guest_deleted,
      (op.participant_type IN ('staff', 'admin') AND s.deleted_at IS NOT NULL) AS staff_deleted
    FROM other_p op
    LEFT JOIN public.guests g
      ON op.participant_type = 'guest' AND g.id = op.participant_id
    LEFT JOIN public.staff s
      ON op.participant_type IN ('staff', 'admin') AND s.id = op.participant_id
    LEFT JOIN public.breakfast_partner_users pu
      ON op.participant_type = 'partner' AND pu.id = op.participant_id
    LEFT JOIN public.breakfast_partner_hotels ph
      ON ph.id = pu.partner_hotel_id
  ),
  unread AS (
    SELECT
      m.conversation_id,
      COUNT(*)::bigint AS cnt
    FROM public.messages m
    INNER JOIN my_convs mc ON mc.id = m.conversation_id
    WHERE NOT m.is_deleted
      AND m.created_at >= v_staff_created_at
      AND NOT (m.sender_id = v_staff_id AND m.sender_type IN ('staff', 'admin'))
      AND (mc.last_read_at IS NULL OR m.created_at > mc.last_read_at)
    GROUP BY m.conversation_id
  )
  SELECT
    mc.id,
    mc.type,
    COALESCE(mc.name, orr.other_name, 'Sohbet')::varchar(255),
    CASE WHEN mc.type = 'direct' THEN orr.other_avatar ELSE mc.avatar END,
    mc.group_theme_color,
    mc.created_by,
    mc.created_by_type,
    mc.created_at,
    mc.updated_at,
    mc.last_message_id,
    mc.last_message_at,
    mc.closed_at,
    CASE
      WHEN lm.id IS NULL THEN NULL
      WHEN lm.message_type = 'text' THEN lm.content
      WHEN lm.message_type = 'image' THEN 'Fotoğraf'
      WHEN lm.message_type = 'voice' THEN 'Sesli mesaj'
      WHEN lm.message_type = 'video' THEN 'Video'
      WHEN lm.message_type = 'file' THEN COALESCE(NULLIF(TRIM(lm.file_name), ''), 'Dosya')
      WHEN lm.message_type = 'screenshot_notice' THEN
        COALESCE(NULLIF(TRIM(lm.sender_name), ''), 'Kullanıcı') || ' ekran görüntüsü aldı'
      ELSE COALESCE(lm.content, 'Mesaj')
    END,
    COALESCE(u.cnt, 0)::bigint,
    mc.is_pinned,
    mc.is_muted,
    false AS is_archived,
    CASE WHEN mc.type = 'direct' THEN orr.other_avatar ELSE NULL END,
    CASE
      WHEN mc.type = 'direct' AND orr.participant_id IS NOT NULL THEN
        jsonb_build_object(
          'id', orr.participant_id,
          'type', orr.participant_type,
          'name', orr.other_name,
          'avatar', orr.other_avatar,
          'is_online', orr.other_online
        )
      ELSE NULL
    END
  FROM my_convs mc
  LEFT JOIN other_resolved orr ON orr.conversation_id = mc.id
  LEFT JOIN public.messages lm
    ON lm.id = mc.last_message_id
    AND NOT lm.is_deleted
    AND lm.created_at >= v_staff_created_at
  LEFT JOIN unread u ON u.conversation_id = mc.id
  WHERE NOT (
    mc.type = 'direct'
    AND orr.conversation_id IS NOT NULL
    AND (COALESCE(orr.guest_deleted, false) OR COALESCE(orr.staff_deleted, false))
  )
  ORDER BY mc.last_message_at DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.messaging_list_conversations_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.messaging_list_conversations_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_list_conversations_staff(uuid) TO service_role;

COMMENT ON FUNCTION public.messaging_list_conversations_staff(uuid) IS
  'Personel/admin sohbet listesi; tek RPC ile (okunmamış sayımı sunucuda GROUP BY). 499 performans.';
