-- feed_post_views INSERT: EXISTS(feed_posts) alt sorgusu RLS yüzünden başarısız olabiliyordu.
-- Personel kaydı: SECURITY DEFINER RPC (istemci staff_id gönderir, doğrulanır).

DROP POLICY IF EXISTS "feed_views_staff_insert_self" ON public.feed_post_views;

CREATE POLICY "feed_views_staff_insert_self" ON public.feed_post_views
  FOR INSERT TO authenticated
  WITH CHECK (
    guest_id IS NULL
    AND staff_id IS NOT NULL
    AND staff_id IN (SELECT s.id FROM public.staff s WHERE s.auth_id = auth.uid())
  );

COMMENT ON POLICY "feed_views_staff_insert_self" ON public.feed_post_views IS
  'Personel görüntüleme: auth.uid ile bağlı staff_id; post_id FK ile doğrulanır.';

DROP FUNCTION IF EXISTS public.record_staff_feed_post_views(uuid[]);

CREATE OR REPLACE FUNCTION public.record_staff_feed_post_views(
  p_post_ids uuid[],
  p_staff_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_inserted integer;
BEGIN
  IF p_post_ids IS NULL OR cardinality(p_post_ids) = 0 THEN
    RETURN 0;
  END IF;

  v_staff_id := p_staff_id;

  IF v_staff_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = v_staff_id AND s.auth_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'staff_id does not belong to caller' USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT s.id INTO v_staff_id
    FROM public.staff s
    WHERE s.auth_id = auth.uid()
    ORDER BY COALESCE(s.updated_at, s.created_at) DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'not staff' USING ERRCODE = 'P0001';
  END IF;

  WITH ins AS (
    INSERT INTO public.feed_post_views (post_id, staff_id, guest_id)
    SELECT DISTINCT pid, v_staff_id, NULL::uuid
    FROM unnest(p_post_ids) AS pid
    WHERE EXISTS (SELECT 1 FROM public.feed_posts fp WHERE fp.id = pid)
    ON CONFLICT (post_id, staff_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_inserted FROM ins;

  RETURN COALESCE(v_inserted, 0);
END;
$$;

COMMENT ON FUNCTION public.record_staff_feed_post_views(uuid[], uuid) IS
  'Personel feed görüntüleme kaydı; RLS bypass. p_staff_id oturumdaki staff satırı olmalı.';

REVOKE ALL ON FUNCTION public.record_staff_feed_post_views(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_staff_feed_post_views(uuid[], uuid) TO authenticated;
