-- Misafir feed_post_views INSERT: WITH CHECK içindeki feed_posts EXISTS alt sorgusu RLS yüzünden
-- başarısız olabiliyordu (265'te personel için aynı sorun RPC ile çözülmüştü).

DROP POLICY IF EXISTS "feed_views_guest_insert" ON public.feed_post_views;

CREATE POLICY "feed_views_guest_insert" ON public.feed_post_views
  FOR INSERT TO authenticated
  WITH CHECK (
    guest_id IS NOT NULL
    AND staff_id IS NULL
    AND guest_id IN (
      SELECT g.id
      FROM public.guests g
      WHERE g.auth_user_id = auth.uid()
        AND g.deleted_at IS NULL
    )
  );

COMMENT ON POLICY "feed_views_guest_insert" ON public.feed_post_views IS
  'Misafir görüntüleme: oturumdaki auth_user_id ile eşleşen guest_id; post doğrulaması RPC/FK ile.';

DROP FUNCTION IF EXISTS public.record_guest_feed_post_views(uuid[], uuid);

CREATE OR REPLACE FUNCTION public.record_guest_feed_post_views(
  p_post_ids uuid[],
  p_guest_id uuid DEFAULT NULL
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

  v_guest_id := p_guest_id;

  IF v_guest_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.guests g
      WHERE g.id = v_guest_id
        AND g.auth_user_id = auth.uid()
        AND g.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'guest_id does not belong to caller' USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT g.id INTO v_guest_id
    FROM public.guests g
    WHERE g.auth_user_id = auth.uid()
      AND g.deleted_at IS NULL
    ORDER BY g.created_at DESC
    LIMIT 1;
  END IF;

  IF v_guest_id IS NULL THEN
    RAISE EXCEPTION 'not a guest' USING ERRCODE = 'P0001';
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

COMMENT ON FUNCTION public.record_guest_feed_post_views(uuid[], uuid) IS
  'Misafir feed görüntüleme kaydı; RLS bypass. p_guest_id oturumdaki guest satırı olmalı.';

REVOKE ALL ON FUNCTION public.record_guest_feed_post_views(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_guest_feed_post_views(uuid[], uuid) TO authenticated;
