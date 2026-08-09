-- Tab mesaj rozeti, arşivlenmiş / silinmiş karşı taraflı sohbetleri saymasın.
-- Liste RPC (499) bunları gizler; unread count hâlâ sayıyordu → boş mesajlar + rozet.

CREATE OR REPLACE FUNCTION public.messaging_unread_count_staff(p_staff_id uuid)
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
      AND cp.participant_id = p_staff_id
      AND cp.participant_type IN ('staff', 'admin')
      AND cp.left_at IS NULL
      AND COALESCE(cp.is_archived, false) = false
    INNER JOIN public.conversations c
      ON c.id = m.conversation_id
    WHERE m.is_deleted = false
      AND m.created_at >= (
        SELECT COALESCE(s.created_at, '1970-01-01'::timestamptz)
        FROM public.staff s
        WHERE s.id = p_staff_id
      )
      AND NOT (m.sender_id = p_staff_id AND m.sender_type IN ('staff', 'admin'))
      AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
      AND NOT (
        c.type = 'direct'
        AND EXISTS (
          SELECT 1
          FROM public.conversation_participants op
          LEFT JOIN public.guests g
            ON op.participant_type = 'guest' AND g.id = op.participant_id
          LEFT JOIN public.staff os
            ON op.participant_type IN ('staff', 'admin') AND os.id = op.participant_id
          WHERE op.conversation_id = c.id
            AND op.participant_id <> p_staff_id
            AND op.left_at IS NULL
            AND (
              (op.participant_type = 'guest' AND g.deleted_at IS NOT NULL)
              OR (op.participant_type IN ('staff', 'admin') AND os.deleted_at IS NOT NULL)
            )
        )
      )
  ), 0);
$$;

COMMENT ON FUNCTION public.messaging_unread_count_staff(uuid) IS
  'Personel okunmamış mesaj sayısı; arşiv ve silinmiş karşı taraf direct sohbetler hariç (liste ile uyumlu).';
