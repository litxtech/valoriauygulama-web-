-- Direct sohbet "benden sil" sonrası: aynı kişiyle yeniden yazışma ve gelen mesajda listeye dönüş.
-- messaging_get_or_create_direct: left_at olsa bile mevcut direct odayı bulur ve katılımcıları geri alır.
-- Yeni mesaj (direct): alıcı left_at ile ayrılmışsa otomatik geri katılır.

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
  IF p_actor_type NOT IN ('guest', 'staff', 'admin')
     OR p_other_type NOT IN ('guest', 'staff', 'admin') THEN
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

CREATE OR REPLACE FUNCTION public.messaging_rejoin_direct_on_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT c.type FROM public.conversations c WHERE c.id = NEW.conversation_id) <> 'direct' THEN
    RETURN NEW;
  END IF;

  UPDATE public.conversation_participants cp
  SET left_at = NULL
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
CREATE TRIGGER trg_messages_rejoin_direct_participants
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.messaging_rejoin_direct_on_new_message();

COMMENT ON FUNCTION public.messaging_get_or_create_direct(UUID, VARCHAR, UUID, VARCHAR) IS
  'Direct sohbet: silinmiş (left_at) olsa bile aynı çift için mevcut odayı bulur ve katılımcıları geri alır (358).';
