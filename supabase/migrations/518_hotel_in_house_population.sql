-- Otel nüfusu (içeride konaklayan misafir) + maskeli liste + odaya yeni kimlik gelince
-- önceki misafirlerin otomatik çıkışı. Kaynak: ops.stay_assignments (KBS kimlik çekimi).
-- Yazımlar ops.stay_assignments'ta istemciye kapalı (141_ops_hardening), bu yüzden
-- SECURITY DEFINER RPC'ler ile hotel_id auth.uid()'den çözülür.

BEGIN;

-- Çağıran personelin ops otel kimliği: önce ops.app_users, yoksa staff → organization slug → ops.hotels.code.
-- Tüm personel (KBS yetkisi olmayan dahil) nüfusu görebilsin diye slug köprüsü de var.
CREATE OR REPLACE FUNCTION public.hotel_current_ops_hotel_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_uid uuid;
  v_hotel_id uuid;
  v_slug text;
  v_code text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT au.hotel_id INTO v_hotel_id FROM ops.app_users au WHERE au.id = v_uid LIMIT 1;
  IF v_hotel_id IS NOT NULL THEN
    RETURN v_hotel_id;
  END IF;

  SELECT o.slug INTO v_slug
  FROM public.staff s
  JOIN public.organizations o ON o.id = s.organization_id
  WHERE s.auth_id = v_uid AND s.is_active = true AND s.deleted_at IS NULL
  LIMIT 1;

  IF v_slug IS NULL THEN
    RETURN NULL;
  END IF;

  v_code := CASE v_slug
    WHEN 'valoria' THEN 'valoria-ops'
    WHEN 'bavul-suite' THEN 'bavul-suite-ops'
    WHEN 'bavultur' THEN 'bavultur-ops'
    ELSE v_slug || '-ops'
  END;

  SELECT h.id INTO v_hotel_id FROM ops.hotels h WHERE h.code = v_code LIMIT 1;
  RETURN v_hotel_id;
END;
$$;

-- İçeride konaklayan misafir sayısı (aktif stay_assignments). Bir misafirin en fazla bir aktif
-- konaklaması olduğundan (unique index) satır sayısı = misafir sayısı.
CREATE OR REPLACE FUNCTION public.hotel_in_house_population()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_hotel_id uuid;
  v_count integer;
BEGIN
  v_hotel_id := public.hotel_current_ops_hotel_id();
  IF v_hotel_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT count(*)::int INTO v_count
  FROM ops.stay_assignments s
  WHERE s.hotel_id = v_hotel_id
    AND s.stay_status IN ('assigned', 'checked_in', 'checkout_pending');

  RETURN COALESCE(v_count, 0);
END;
$$;

-- İçeride konaklayan misafirlerin maskeli listesi (yalnız ad/soyad baş harfleri).
-- Tam isim DB dışına çıkmaz — mahremiyet için baş harfler SQL'de üretilir.
CREATE OR REPLACE FUNCTION public.hotel_in_house_guests()
RETURNS TABLE (
  room_number text,
  first_initial text,
  last_initial text,
  check_in_at timestamptz,
  stay_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_hotel_id uuid;
BEGIN
  v_hotel_id := public.hotel_current_ops_hotel_id();
  IF v_hotel_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    r.room_number::text,
    upper(left(COALESCE(NULLIF(btrim(g.first_name), ''), '?'), 1)) AS first_initial,
    upper(left(COALESCE(NULLIF(btrim(g.last_name), ''), ''), 1)) AS last_initial,
    s.check_in_at,
    s.stay_status
  FROM ops.stay_assignments s
  JOIN ops.rooms r ON r.id = s.room_id
  LEFT JOIN ops.guests g ON g.id = s.guest_id
  WHERE s.hotel_id = v_hotel_id
    AND s.stay_status IN ('assigned', 'checked_in', 'checkout_pending')
  ORDER BY r.room_number, s.check_in_at;
END;
$$;

-- Odaya yeni kimlik/pasaport gelince: aynı çekimdeki (p_keep_guest_ids) misafirler kalır,
-- odadaki ÖNCEKİ diğer aktif misafirler otomatik çıkış yapar.
CREATE OR REPLACE FUNCTION public.kbs_checkout_room_others(
  p_room_id uuid,
  p_keep_guest_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_hotel_id uuid;
  v_count integer;
BEGIN
  v_hotel_id := public.hotel_current_ops_hotel_id();
  IF v_hotel_id IS NULL OR p_room_id IS NULL THEN
    RETURN 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ops.rooms r WHERE r.id = p_room_id AND r.hotel_id = v_hotel_id
  ) THEN
    RETURN 0;
  END IF;

  WITH updated AS (
    UPDATE ops.stay_assignments s
    SET stay_status = 'checked_out',
        check_out_at = now(),
        updated_at = now()
    WHERE s.hotel_id = v_hotel_id
      AND s.room_id = p_room_id
      AND s.stay_status IN ('assigned', 'checked_in', 'checkout_pending')
      AND (
        p_keep_guest_ids IS NULL
        OR array_length(p_keep_guest_ids, 1) IS NULL
        OR NOT (s.guest_id = ANY (p_keep_guest_ids))
      )
    RETURNING 1
  )
  SELECT count(*)::int INTO v_count FROM updated;

  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.hotel_current_ops_hotel_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hotel_in_house_population() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hotel_in_house_guests() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kbs_checkout_room_others(uuid, uuid[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.hotel_current_ops_hotel_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hotel_in_house_population() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hotel_in_house_guests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.kbs_checkout_room_others(uuid, uuid[]) TO authenticated;

-- stay_assignments realtime: nüfus rozeti ve liste anlık güncellensin.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'ops' AND tablename = 'stay_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ops.stay_assignments;
  END IF;
END $$;

COMMIT;
