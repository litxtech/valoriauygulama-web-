-- Personel/misafir uygulaması: okunmamış mesaj sayısı (tam sohbet listesi çekmeden).

CREATE OR REPLACE FUNCTION public.messaging_unread_count_staff_caller(p_staff_id uuid DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT s.id INTO v_staff_id
    FROM public.staff s
    WHERE s.auth_id = auth.uid()
      AND s.deleted_at IS NULL
      AND s.is_active = true
    LIMIT 1;
    IF v_staff_id IS NULL THEN
      RETURN 0;
    END IF;
    IF p_staff_id IS NOT NULL AND p_staff_id IS DISTINCT FROM v_staff_id THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    RETURN public.messaging_unread_count_staff(v_staff_id);
  END IF;

  IF p_staff_id IS NULL THEN
    RETURN 0;
  END IF;
  RETURN public.messaging_unread_count_staff(p_staff_id);
END;
$$;

REVOKE ALL ON FUNCTION public.messaging_unread_count_staff_caller(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.messaging_unread_count_staff_caller(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_unread_count_staff_caller(uuid) TO service_role;

COMMENT ON FUNCTION public.messaging_unread_count_staff_caller(uuid) IS
  'Çağıran personelin okunmamış mesaj sayısı; service_role isteğe bağlı p_staff_id ile.';
