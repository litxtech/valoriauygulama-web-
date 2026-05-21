-- feed_post_views: personel görüntüleme kaydı
-- Sorun: feed_views_staff_insert_self staff_id = (SELECT … LIMIT 1) kullanıyordu;
-- aynı auth_id ile birden fazla staff satırında istemcinin staff.id’si eşleşmeyebilir.
-- Çözüm: IN (tüm auth staff satırları) + SECURITY DEFINER upsert RPC.

DROP POLICY IF EXISTS "feed_views_staff_insert_self" ON public.feed_post_views;

CREATE POLICY "feed_views_staff_insert_self" ON public.feed_post_views
  FOR INSERT TO authenticated
  WITH CHECK (
    guest_id IS NULL
    AND staff_id IS NOT NULL
    AND staff_id IN (
      SELECT s.id
      FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND COALESCE(s.is_active, true)
        AND s.deleted_at IS NULL
    )
    AND EXISTS (
      SELECT 1
      FROM public.feed_posts fp
      WHERE fp.id = post_id
    )
  );

COMMENT ON POLICY "feed_views_staff_insert_self" ON public.feed_post_views IS
  'Personel: kendi auth_id ile bağlı herhangi bir staff_id için görüntüleme (çoklu staff satırı uyumlu).';

CREATE OR REPLACE FUNCTION public.record_staff_feed_post_views(p_post_ids uuid[])
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

  SELECT s.id INTO v_staff_id
  FROM public.staff s
  WHERE s.auth_id = auth.uid()
    AND COALESCE(s.is_active, true)
    AND s.deleted_at IS NULL
  LIMIT 1;

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'not staff' USING ERRCODE = 'P0001';
  END IF;

  WITH ins AS (
    INSERT INTO public.feed_post_views (post_id, staff_id)
    SELECT DISTINCT pid, v_staff_id
    FROM unnest(p_post_ids) AS pid
    WHERE EXISTS (SELECT 1 FROM public.feed_posts fp WHERE fp.id = pid)
    ON CONFLICT (post_id, staff_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_inserted FROM ins;

  RETURN COALESCE(v_inserted, 0);
END;
$$;

COMMENT ON FUNCTION public.record_staff_feed_post_views(uuid[]) IS
  'Personel feed: görüntülenen gönderileri kaydet (RLS bypass, ON CONFLICT DO NOTHING).';

GRANT EXECUTE ON FUNCTION public.record_staff_feed_post_views(uuid[]) TO authenticated;
