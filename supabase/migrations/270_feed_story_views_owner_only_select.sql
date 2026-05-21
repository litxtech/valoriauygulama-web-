-- Story goruntuleyen listesi yalnizca story sahibi (ve kendi view satiri) tarafindan okunabilir.

DROP POLICY IF EXISTS "feed_story_views_staff_select" ON public.feed_story_views;
CREATE POLICY "feed_story_views_staff_select"
  ON public.feed_story_views
  FOR SELECT
  TO authenticated
  USING (
    staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.feed_stories fs
      WHERE fs.id = story_id
        AND fs.staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
    )
  );
