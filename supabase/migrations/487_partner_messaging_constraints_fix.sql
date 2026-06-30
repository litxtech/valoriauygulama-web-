-- Partner mesajlaşma: conversations / participants / messages CHECK kısıtları
-- 485 uygulanırken eski constraint adı farklı kaldıysa 'partner' insert'i reddedilir.

BEGIN;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'conversations'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%created_by_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.conversations DROP CONSTRAINT %I', r.conname);
  END LOOP;

  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'conversation_participants'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%participant_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.conversation_participants DROP CONSTRAINT %I', r.conname);
  END LOOP;

  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'messages'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%sender_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.messages DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_created_by_type_check
  CHECK (
    created_by_type IS NULL
    OR created_by_type IN ('guest', 'staff', 'admin', 'partner')
  );

ALTER TABLE public.conversation_participants
  ADD CONSTRAINT conversation_participants_participant_type_check
  CHECK (participant_type IN ('guest', 'staff', 'admin', 'partner'));

ALTER TABLE public.messages
  ADD CONSTRAINT messages_sender_type_check
  CHECK (sender_type IN ('guest', 'staff', 'admin', 'partner'));

-- messaging_get_or_create_direct partner desteği (idempotent)
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

COMMIT;
