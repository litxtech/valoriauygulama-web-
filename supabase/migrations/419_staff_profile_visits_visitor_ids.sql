-- list_my_staff_profile_visits: ziyaretçi profiline gitmek için kimlik alanları.

DROP FUNCTION IF EXISTS public.list_my_staff_profile_visits(integer);
CREATE OR REPLACE FUNCTION public.list_my_staff_profile_visits(p_limit integer DEFAULT 100)
RETURNS TABLE (
  id uuid,
  visited_at timestamptz,
  visitor_kind text,
  visitor_name text,
  visitor_photo text,
  visitor_about text,
  visitor_staff_id uuid,
  visitor_guest_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_owner uuid;
  v_lim integer;
BEGIN
  SELECT s.id INTO v_owner
  FROM public.staff s
  WHERE s.auth_id = auth.uid()
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_active, true)
  LIMIT 1;

  IF v_owner IS NULL THEN
    RETURN;
  END IF;

  v_lim := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);

  RETURN QUERY
  SELECT
    v.id,
    v.visited_at,
    (CASE WHEN v.visitor_staff_id IS NOT NULL THEN 'staff' ELSE 'guest' END)::text,
    COALESCE(s.full_name, g.full_name, '—')::text,
    COALESCE(s.profile_image, g.photo_url)::text,
    (CASE
      WHEN v.visitor_staff_id IS NOT NULL THEN
        NULLIF(BTRIM(COALESCE(s.bio, '')), '')
      ELSE
        NULL::text
    END)::text,
    v.visitor_staff_id,
    v.visitor_guest_id
  FROM public.staff_profile_visits v
  LEFT JOIN public.staff s ON s.id = v.visitor_staff_id AND s.deleted_at IS NULL
  LEFT JOIN public.guests g ON g.id = v.visitor_guest_id AND g.deleted_at IS NULL
  WHERE v.viewed_staff_id = v_owner
  ORDER BY v.visited_at DESC
  LIMIT v_lim;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_staff_profile_visits(integer) TO authenticated;
