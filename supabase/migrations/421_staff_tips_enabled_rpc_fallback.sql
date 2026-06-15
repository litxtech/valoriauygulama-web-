-- Misafir profili: tips_enabled (get_staff_public_profile güncel değilse bile çalışsın)

CREATE OR REPLACE FUNCTION public.get_staff_tips_enabled(p_staff_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT s.tips_enabled
      FROM public.staff s
      WHERE s.id = p_staff_id
        AND s.deleted_at IS NULL
        AND COALESCE(s.is_active, true) = true
      LIMIT 1
    ),
    true
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_tips_enabled(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_tips_enabled(uuid) TO anon;

COMMENT ON FUNCTION public.get_staff_tips_enabled(uuid) IS
  'Misafir/personel profili: personele bahşiş gönderilebilir mi?';
