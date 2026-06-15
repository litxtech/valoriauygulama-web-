-- Misafir feed görüntüleme RPC: anon oturum / app_token ile (401 / 42501 önlenir).

BEGIN;

DROP FUNCTION IF EXISTS public.record_guest_feed_post_views(uuid[], uuid);

CREATE OR REPLACE FUNCTION public.record_guest_feed_post_views(
  p_post_ids uuid[],
  p_guest_id uuid DEFAULT NULL,
  p_app_token text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id uuid;
  v_inserted integer;
BEGIN
  IF p_post_ids IS NULL OR cardinality(p_post_ids) = 0 THEN
    RETURN 0;
  END IF;

  v_guest_id := public.messaging_resolve_guest_id(p_app_token);

  IF v_guest_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT g.id INTO v_guest_id
    FROM public.guests g
    WHERE g.auth_user_id = auth.uid()
      AND g.deleted_at IS NULL
    ORDER BY g.created_at DESC
    LIMIT 1;
  END IF;

  IF v_guest_id IS NULL THEN
    RETURN 0;
  END IF;

  IF p_guest_id IS NOT NULL AND p_guest_id <> v_guest_id THEN
    RAISE EXCEPTION 'guest_id does not belong to caller' USING ERRCODE = '42501';
  END IF;

  WITH ins AS (
    INSERT INTO public.feed_post_views (post_id, guest_id, staff_id)
    SELECT DISTINCT pid, v_guest_id, NULL::uuid
    FROM unnest(p_post_ids) AS pid
    WHERE EXISTS (
      SELECT 1
      FROM public.feed_posts fp
      WHERE fp.id = pid
        AND fp.visibility IN ('customers', 'guests_only')
    )
    ON CONFLICT (post_id, guest_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_inserted FROM ins;

  RETURN COALESCE(v_inserted, 0);
END;
$$;

COMMENT ON FUNCTION public.record_guest_feed_post_views(uuid[], uuid, text) IS
  'Misafir feed görüntüleme; app_token veya auth.uid() ile misafir eşleştirme.';

REVOKE ALL ON FUNCTION public.record_guest_feed_post_views(uuid[], uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_guest_feed_post_views(uuid[], uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.record_guest_feed_post_views(uuid[], uuid, text) TO authenticated;

DROP FUNCTION IF EXISTS public.get_my_guest_feed_post_view_counts(uuid[]);

CREATE OR REPLACE FUNCTION public.get_my_guest_feed_post_view_counts(
  p_post_ids uuid[],
  p_app_token text DEFAULT NULL
)
RETURNS TABLE(post_id uuid, view_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id uuid;
BEGIN
  IF p_post_ids IS NULL OR cardinality(p_post_ids) = 0 THEN
    RETURN;
  END IF;

  v_guest_id := public.messaging_resolve_guest_id(p_app_token);

  IF v_guest_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT g.id INTO v_guest_id
    FROM public.guests g
    WHERE g.auth_user_id = auth.uid()
      AND g.deleted_at IS NULL
    ORDER BY g.created_at DESC
    LIMIT 1;
  END IF;

  IF v_guest_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT v.post_id, count(*)::bigint
  FROM public.feed_post_views v
  INNER JOIN public.feed_posts fp ON fp.id = v.post_id AND fp.guest_id = v_guest_id
  WHERE v.post_id = ANY(p_post_ids)
  GROUP BY v.post_id;
END;
$$;

COMMENT ON FUNCTION public.get_my_guest_feed_post_view_counts(uuid[], text) IS
  'Misafir: kendi paylaşımlarının görüntülenme sayısı; app_token veya auth.uid().';

REVOKE ALL ON FUNCTION public.get_my_guest_feed_post_view_counts(uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_guest_feed_post_view_counts(uuid[], text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_my_guest_feed_post_view_counts(uuid[], text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
