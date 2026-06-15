-- Misafir mesajlaşma: app_token + auth.uid() çözümlemesi (391/396 ile uyumlu, prod drift onarımı).

BEGIN;

CREATE OR REPLACE FUNCTION public.messaging_guest_get_or_create_with_staff(p_app_token TEXT, p_staff_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id UUID;
BEGIN
  v_guest_id := public.messaging_resolve_guest_id(p_app_token);
  IF v_guest_id IS NULL THEN RETURN NULL; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = p_staff_id AND s.is_active = true AND s.deleted_at IS NULL
  ) THEN
    RETURN NULL;
  END IF;

  RETURN public.messaging_get_or_create_direct(v_guest_id, 'guest', p_staff_id, 'staff');
END;
$$;

GRANT EXECUTE ON FUNCTION public.messaging_guest_get_or_create_with_staff(TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.messaging_guest_get_or_create_with_staff(TEXT, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
