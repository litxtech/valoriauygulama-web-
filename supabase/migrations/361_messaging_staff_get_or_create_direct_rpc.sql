-- Personel yeni sohbet: auth.uid() ile doğrulanmış RPC + EXECUTE yetkisi.
-- Doğrudan messaging_get_or_create_direct çağrısı authenticated rolünde yetkisiz kalabiliyordu.

CREATE OR REPLACE FUNCTION public.messaging_staff_get_or_create_direct(
  p_other_id UUID,
  p_other_type VARCHAR(20)
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id UUID;
  v_actor_type VARCHAR(20);
  v_other_type VARCHAR(20);
BEGIN
  IF p_other_type NOT IN ('guest', 'staff', 'admin') THEN
    RETURN NULL;
  END IF;

  SELECT
    s.id,
    CASE WHEN s.role = 'admin' THEN 'admin' ELSE 'staff' END
  INTO v_staff_id, v_actor_type
  FROM public.staff s
  WHERE s.auth_id = auth.uid()
    AND s.is_active = true
    AND s.deleted_at IS NULL
  LIMIT 1;

  IF v_staff_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_other_id = v_staff_id THEN
    RETURN NULL;
  END IF;

  IF p_other_type = 'guest' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.guests g
      WHERE g.id = p_other_id
        AND g.deleted_at IS NULL
    ) THEN
      RETURN NULL;
    END IF;
    v_other_type := 'guest';
  ELSE
    SELECT CASE WHEN s.role = 'admin' THEN 'admin' ELSE 'staff' END
    INTO v_other_type
    FROM public.staff s
    WHERE s.id = p_other_id
      AND s.is_active = true
      AND s.deleted_at IS NULL
    LIMIT 1;

    IF v_other_type IS NULL THEN
      RETURN NULL;
    END IF;
  END IF;

  RETURN public.messaging_get_or_create_direct(
    v_staff_id,
    v_actor_type,
    p_other_id,
    v_other_type
  );
END;
$$;

COMMENT ON FUNCTION public.messaging_staff_get_or_create_direct(UUID, VARCHAR) IS
  'Personel/admin: oturum sahibi ile misafir veya personel arasında direct sohbet başlatır (359).';

REVOKE ALL ON FUNCTION public.messaging_staff_get_or_create_direct(UUID, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.messaging_staff_get_or_create_direct(UUID, VARCHAR) TO authenticated;

-- Misafir sarmalayıcı (app_token) — anon/authenticated
REVOKE ALL ON FUNCTION public.messaging_guest_get_or_create_with_staff(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.messaging_guest_get_or_create_with_staff(TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.messaging_guest_get_or_create_with_staff(TEXT, UUID) TO authenticated;
