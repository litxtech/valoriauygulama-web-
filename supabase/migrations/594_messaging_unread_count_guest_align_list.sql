-- Misafir okunmamış sayısı, sohbet listesiyle aynı kapsamda olsun
-- (Tüm Çalışanlar grubu + silinmiş personel direct hariç).

CREATE OR REPLACE FUNCTION public.messaging_unread_count_guest(p_guest_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT COUNT(*)::bigint
    FROM public.messages m
    INNER JOIN public.conversation_participants cp
      ON cp.conversation_id = m.conversation_id
      AND cp.participant_id = p_guest_id
      AND cp.participant_type = 'guest'
      AND cp.left_at IS NULL
    INNER JOIN public.conversations c
      ON c.id = m.conversation_id
    INNER JOIN public.guests g ON g.id = p_guest_id
    WHERE NOT m.is_deleted
      AND m.created_at >= COALESCE(g.created_at, '1970-01-01'::timestamptz)
      AND m.sender_id <> p_guest_id
      AND m.sender_type <> 'guest'
      AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
      AND NOT (c.type = 'group' AND c.name = 'Tüm Çalışanlar')
      AND NOT (
        c.type = 'direct'
        AND EXISTS (
          SELECT 1
          FROM public.conversation_participants op
          INNER JOIN public.staff s
            ON s.id = op.participant_id
            AND op.participant_type IN ('staff', 'admin')
          WHERE op.conversation_id = c.id
            AND op.participant_id <> p_guest_id
            AND op.left_at IS NULL
            AND s.deleted_at IS NOT NULL
        )
      )
  ), 0);
$$;

COMMENT ON FUNCTION public.messaging_unread_count_guest(uuid) IS
  'Misafir okunmamış mesaj sayısı; liste ile uyumlu (Tüm Çalışanlar / silinmiş personel hariç).';
