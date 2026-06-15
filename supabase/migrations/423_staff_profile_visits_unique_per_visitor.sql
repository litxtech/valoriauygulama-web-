-- Profil ziyaret sayacı: aynı hesap (personel/misafir) bir profile yalnızca 1 kez sayılır.
-- Tekrar ziyarette yeni satır eklenmez; visited_at güncellenir (görüntüleyenler listesi aynı kalır).

-- Mevcut çift kayıtları temizle (en son ziyaret kalır)
WITH ranked AS (
  SELECT
    v.id,
    ROW_NUMBER() OVER (
      PARTITION BY v.viewed_staff_id, v.visitor_staff_id, v.visitor_guest_id
      ORDER BY v.visited_at DESC NULLS LAST, v.id DESC
    ) AS rn
  FROM public.staff_profile_visits v
)
DELETE FROM public.staff_profile_visits d
USING ranked r
WHERE d.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_profile_visits_unique_staff
  ON public.staff_profile_visits (viewed_staff_id, visitor_staff_id)
  WHERE visitor_staff_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_profile_visits_unique_guest
  ON public.staff_profile_visits (viewed_staff_id, visitor_guest_id)
  WHERE visitor_guest_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_staff_profile_visit(p_viewed_staff_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_my_staff uuid;
  v_my_guest uuid;
  v_updated integer;
BEGIN
  IF v_uid IS NULL OR p_viewed_staff_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staff
    WHERE id = p_viewed_staff_id
      AND deleted_at IS NULL
      AND COALESCE(is_active, true)
  ) THEN
    RETURN;
  END IF;

  SELECT s.id INTO v_my_staff
  FROM public.staff s
  WHERE s.auth_id = v_uid
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_active, true)
  LIMIT 1;

  IF v_my_staff IS NOT NULL THEN
    IF v_my_staff = p_viewed_staff_id THEN
      RETURN;
    END IF;

    UPDATE public.staff_profile_visits v
    SET visited_at = now()
    WHERE v.viewed_staff_id = p_viewed_staff_id
      AND v.visitor_staff_id = v_my_staff;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated > 0 THEN
      RETURN;
    END IF;

    INSERT INTO public.staff_profile_visits (viewed_staff_id, visitor_staff_id, visited_at)
    VALUES (p_viewed_staff_id, v_my_staff, now());
    RETURN;
  END IF;

  SELECT g.id INTO v_my_guest
  FROM public.guests g
  WHERE g.auth_user_id = v_uid
    AND g.deleted_at IS NULL
  LIMIT 1;

  IF v_my_guest IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.staff_profile_visits v
  SET visited_at = now()
  WHERE v.viewed_staff_id = p_viewed_staff_id
    AND v.visitor_guest_id = v_my_guest;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.staff_profile_visits (viewed_staff_id, visitor_guest_id, visited_at)
  VALUES (p_viewed_staff_id, v_my_guest, now());
END;
$$;

COMMENT ON FUNCTION public.record_staff_profile_visit(uuid) IS
  'Profil ziyareti kaydı: ziyaretçi başına tek satır; tekrar ziyarette yalnızca visited_at güncellenir.';

-- İstatistik: benzersiz ziyaretçi sayısı (= satır sayısı, çift kayıt sonrası)
CREATE OR REPLACE FUNCTION public.count_staff_profile_unique_visits(p_staff_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COUNT(*)::integer
  FROM public.staff_profile_visits v
  WHERE v.viewed_staff_id = p_staff_id;
$$;

GRANT EXECUTE ON FUNCTION public.count_staff_profile_unique_visits(uuid) TO authenticated;

COMMENT ON FUNCTION public.count_staff_profile_unique_visits(uuid) IS
  'Profil ziyaret sayacı: benzersiz ziyaretçi (hesap) adedi.';
