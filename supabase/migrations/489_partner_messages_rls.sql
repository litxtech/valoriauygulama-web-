-- Partner: sohbet mesajlarını okuma / medya alanlarını güncelleme (video küçük resim, mux URL).
DROP POLICY IF EXISTS "messages_partner" ON public.messages;
CREATE POLICY "messages_partner" ON public.messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversation_participants cp
      JOIN public.breakfast_partner_users u
        ON u.id = cp.participant_id
       AND cp.participant_type = 'partner'
      WHERE cp.conversation_id = messages.conversation_id
        AND u.auth_id = auth.uid()
        AND cp.left_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.conversation_participants cp
      JOIN public.breakfast_partner_users u
        ON u.id = cp.participant_id
       AND cp.participant_type = 'partner'
      WHERE cp.conversation_id = messages.conversation_id
        AND u.auth_id = auth.uid()
        AND cp.left_at IS NULL
    )
  );
