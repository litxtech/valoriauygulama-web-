-- Bahşiş izni: yalnızca tips_enabled = true ise true döner

CREATE OR REPLACE FUNCTION public.get_staff_tips_enabled(p_staff_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.id = p_staff_id
      AND s.deleted_at IS NULL
      AND COALESCE(s.is_active, true) = true
      AND COALESCE(s.tips_enabled, true) = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_tips_enabled(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_tips_enabled(uuid) TO anon;
