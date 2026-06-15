-- Phase 3: message reactions realtime, hide-for-me, conversation archive

-- 1) Benden sil (mesajı sadece kullanıcı için gizle)
CREATE TABLE IF NOT EXISTS public.message_hidden_for_user (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('guest', 'staff', 'admin')),
  hidden_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, user_type)
);

CREATE INDEX IF NOT EXISTS idx_message_hidden_user ON public.message_hidden_for_user(user_id, user_type);
CREATE INDEX IF NOT EXISTS idx_message_hidden_message ON public.message_hidden_for_user(message_id);

ALTER TABLE public.message_hidden_for_user ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "message_hidden_staff" ON public.message_hidden_for_user;
CREATE POLICY "message_hidden_staff" ON public.message_hidden_for_user
  FOR ALL TO authenticated
  USING (
    user_type IN ('staff', 'admin')
    AND user_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
  )
  WITH CHECK (
    user_type IN ('staff', 'admin')
    AND user_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.messaging_hide_message_staff(
  p_conversation_id UUID,
  p_message_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id UUID;
BEGIN
  SELECT s.id INTO v_staff_id FROM public.staff s WHERE s.auth_id = auth.uid() LIMIT 1;
  IF v_staff_id IS NULL THEN RETURN FALSE; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.participant_id = v_staff_id
      AND cp.participant_type IN ('staff', 'admin')
      AND cp.left_at IS NULL
  ) THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = p_message_id AND m.conversation_id = p_conversation_id
  ) THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.message_hidden_for_user (message_id, user_id, user_type)
  VALUES (p_message_id, v_staff_id, 'staff')
  ON CONFLICT (message_id, user_id, user_type) DO NOTHING;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.messaging_hide_message_staff(UUID, UUID) TO authenticated;

-- 2) Sohbet arşivi (katılımcı bazlı)
ALTER TABLE public.conversation_participants
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_conv_participants_archived
  ON public.conversation_participants(participant_id, participant_type, is_archived)
  WHERE left_at IS NULL;

-- 3) Reaksiyon toggle (tek reaksiyon / kullanıcı)
CREATE OR REPLACE FUNCTION public.messaging_toggle_reaction_staff(
  p_conversation_id UUID,
  p_message_id UUID,
  p_reaction VARCHAR(10)
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id UUID;
  v_existing VARCHAR(10);
BEGIN
  SELECT s.id INTO v_staff_id FROM public.staff s WHERE s.auth_id = auth.uid() LIMIT 1;
  IF v_staff_id IS NULL THEN RETURN FALSE; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
    WHERE m.id = p_message_id
      AND m.conversation_id = p_conversation_id
      AND cp.participant_id = v_staff_id
      AND cp.participant_type IN ('staff', 'admin')
      AND cp.left_at IS NULL
  ) THEN
    RETURN FALSE;
  END IF;

  SELECT r.reaction INTO v_existing
  FROM public.message_reactions r
  WHERE r.message_id = p_message_id
    AND r.user_id = v_staff_id
    AND r.user_type = 'staff'
  LIMIT 1;

  IF v_existing = p_reaction THEN
    DELETE FROM public.message_reactions
    WHERE message_id = p_message_id AND user_id = v_staff_id AND user_type = 'staff';
  ELSIF v_existing IS NOT NULL THEN
    UPDATE public.message_reactions
    SET reaction = p_reaction, created_at = now()
    WHERE message_id = p_message_id AND user_id = v_staff_id AND user_type = 'staff';
  ELSE
    INSERT INTO public.message_reactions (message_id, user_id, user_type, reaction)
    VALUES (p_message_id, v_staff_id, 'staff', p_reaction);
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.messaging_toggle_reaction_staff(UUID, UUID, VARCHAR) TO authenticated;

-- 4) Realtime: reactions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
  END IF;
END $$;
