-- Grup/departman sohbetinde "benden sil" (left_at) sonrası yeni mesajda otomatik geri katılım.
-- last_read_at = leave anı → yalnızca silme sonrası mesajlar okunmamış (kalın) sayılır.
-- Direct için de aynı okunmamış damgası uygulanır.

CREATE OR REPLACE FUNCTION public.messaging_rejoin_on_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type TEXT;
BEGIN
  SELECT c.type INTO v_type
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id;

  IF v_type IS NULL OR v_type NOT IN ('direct', 'group', 'department') THEN
    RETURN NEW;
  END IF;

  UPDATE public.conversation_participants cp
  SET
    last_read_at = COALESCE(cp.left_at, cp.last_read_at),
    left_at = NULL
  WHERE cp.conversation_id = NEW.conversation_id
    AND cp.left_at IS NOT NULL
    AND NOT (
      cp.participant_id = NEW.sender_id
      AND public.messaging_participant_types_match(cp.participant_type, NEW.sender_type)
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_rejoin_direct_participants ON public.messages;
DROP TRIGGER IF EXISTS trg_messages_rejoin_participants ON public.messages;
DROP FUNCTION IF EXISTS public.messaging_rejoin_direct_on_new_message();

CREATE TRIGGER trg_messages_rejoin_participants
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.messaging_rejoin_on_new_message();

COMMENT ON FUNCTION public.messaging_rejoin_on_new_message() IS
  'Direct/group/department: left_at ile ayrılmış katılımcıları yeni mesajda geri alır; last_read_at leave anına çekilir (589).';
