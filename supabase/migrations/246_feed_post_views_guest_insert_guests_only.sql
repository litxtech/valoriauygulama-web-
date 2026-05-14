-- Misafir feed'de guests_only gönderiler de görünür (054/129) fakat 208'deki
-- feed_views_guest_insert yalnızca visibility = 'customers' kabul ediyordu;
-- bu yüzden misafir görüntülemeleri hiç yazılmıyor, personelde "Görenler" boş kalıyordu.

DROP POLICY IF EXISTS "feed_views_guest_insert" ON public.feed_post_views;

CREATE POLICY "feed_views_guest_insert" ON public.feed_post_views
  FOR INSERT TO authenticated
  WITH CHECK (
    guest_id IS NOT NULL
    AND staff_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.guests g
      WHERE g.id = guest_id AND g.auth_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.feed_posts fp
      WHERE fp.id = post_id AND fp.visibility IN ('customers', 'guests_only')
    )
  );

COMMENT ON POLICY "feed_views_guest_insert" ON public.feed_post_views IS
  'Misafir: customers veya guests_only görünürlüğündeki paylaşımlar için görüntüleme kaydı (misafirin gördüğü feed ile uyumlu).';
