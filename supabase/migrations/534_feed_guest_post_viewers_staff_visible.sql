-- Misafir paylaşımları görüntülenince personel "Görüntüleyenler" listesinde görünsün.
-- 259 yalnızca staff yazarlı gönderiye izin veriyordu; 260 bunu düzeltmişti.
-- RLS (208) ise doğrudan SELECT ile misafir yazarlı postlarda satırları gizlediği için
-- RPC hata verince yedek yol da boş dönüyordu.

BEGIN;

DROP POLICY IF EXISTS "feed_views_staff_select_own_post" ON public.feed_post_views;

-- Personel: kendi paylaşımı VEYA misafir yazarlı paylaşımın görüntülemeleri
CREATE POLICY "feed_views_staff_select_own_post" ON public.feed_post_views
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.staff s
      JOIN public.feed_posts fp ON fp.id = feed_post_views.post_id
      WHERE s.auth_id = auth.uid()
        AND s.deleted_at IS NULL
        AND (
          fp.staff_id = s.id
          OR fp.guest_id IS NOT NULL
        )
    )
  );

COMMENT ON POLICY "feed_views_staff_select_own_post" ON public.feed_post_views IS
  'Personel: kendi staff paylaşımı veya misafir yazarlı paylaşım görüntülemelerini okuyabilir.';

CREATE OR REPLACE FUNCTION public.get_feed_post_viewers(p_post_id uuid)
RETURNS TABLE(
  id uuid,
  staff_id uuid,
  guest_id uuid,
  viewed_at timestamptz,
  viewer_name text,
  viewer_avatar text,
  verification_badge text,
  is_guest boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_is_admin boolean;
  v_post_staff_id uuid;
  v_post_guest_id uuid;
BEGIN
  SELECT s.id, (s.role = 'admin')
  INTO v_staff_id, v_is_admin
  FROM public.staff s
  WHERE s.auth_id = auth.uid()
    AND s.deleted_at IS NULL
  LIMIT 1;

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Only staff can list feed post viewers' USING ERRCODE = 'P0001';
  END IF;

  SELECT fp.staff_id, fp.guest_id
  INTO v_post_staff_id, v_post_guest_id
  FROM public.feed_posts fp
  WHERE fp.id = p_post_id;

  IF v_post_staff_id IS NULL AND v_post_guest_id IS NULL THEN
    RAISE EXCEPTION 'Post not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_post_staff_id IS NOT NULL THEN
    IF v_post_staff_id <> v_staff_id AND NOT v_is_admin THEN
      RAISE EXCEPTION 'Not allowed to list viewers for this post' USING ERRCODE = 'P0003';
    END IF;
  END IF;
  -- Misafir yazarlı paylaşım: tüm personel görüntüleyen listesini açabilir.

  RETURN QUERY
  SELECT
    v.id,
    v.staff_id,
    v.guest_id,
    v.viewed_at,
    CASE
      WHEN v.guest_id IS NOT NULL THEN coalesce(nullif(trim(g.full_name), ''), 'Misafir')
      ELSE coalesce(nullif(trim(s.full_name), ''), 'Personel')
    END AS viewer_name,
    CASE
      WHEN v.guest_id IS NOT NULL THEN nullif(trim(g.photo_url), '')
      ELSE nullif(trim(s.profile_image), '')
    END AS viewer_avatar,
    CASE WHEN v.staff_id IS NOT NULL THEN s.verification_badge::text ELSE NULL END AS verification_badge,
    (v.guest_id IS NOT NULL) AS is_guest
  FROM public.feed_post_views v
  LEFT JOIN public.staff s ON s.id = v.staff_id
  LEFT JOIN public.guests g ON g.id = v.guest_id
  WHERE v.post_id = p_post_id
    AND (
      (v.staff_id IS NOT NULL AND (s.id IS NULL OR s.deleted_at IS NULL))
      OR v.guest_id IS NOT NULL
    )
  ORDER BY v.viewed_at DESC;
END;
$$;

COMMENT ON FUNCTION public.get_feed_post_viewers(uuid) IS
  'Personel: kendi staff paylaşımı (veya admin) veya misafir paylaşımında tüm görüntüleyenler; misafir satırları profil silinse bile listelenir.';

GRANT EXECUTE ON FUNCTION public.get_feed_post_viewers(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
