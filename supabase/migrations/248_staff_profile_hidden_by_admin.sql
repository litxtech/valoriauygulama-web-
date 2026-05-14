-- Yönetici: personeli "gizli profil"e alır; misafir ve diğer personel tam profili göremez,
-- yalnızca resmi profil fotoğrafı + maskeli isim görür. get_staff_public_profile ve misafir personel listesi buna uyumlu.

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS profile_hidden_by_admin BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.staff.profile_hidden_by_admin IS
  'true ise misafir ve personel (admin hariç) bu çalışanın profilini tam göremez; yalnızca profil fotoğrafı ve maskeli isim.';

CREATE OR REPLACE FUNCTION public.mask_staff_display_name_for_privacy(p_full_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_full_name IS NULL OR btrim(p_full_name) = '' THEN '***'
    ELSE (
      SELECT coalesce(
        string_agg(
          CASE
            WHEN length(part) <= 1 THEN part || '***'
            ELSE left(part, 1) || '***'
          END,
          ' '
          ORDER BY ord
        ),
        '***'
      )
      FROM (
        SELECT trim(t.word) AS part, t.ord
        FROM regexp_split_to_table(btrim(p_full_name), '\s+') WITH ORDINALITY AS t(word, ord)
      ) x
      WHERE part <> ''
    )
  END;
$$;

COMMENT ON FUNCTION public.mask_staff_display_name_for_privacy(TEXT) IS
  'Örn. Ahmet Yılmaz -> A*** Y*** (gizli profil listeleri için).';

-- Misafir "yeni sohbet" listesi: gizli profilde isim maskeli, departman gösterilmez.
-- RETURN TABLE sütunları 220 ile aynı kalmalı; aksi halde CREATE OR REPLACE dönüş tipi hatası verir.
DROP FUNCTION IF EXISTS public.messaging_list_staff_for_guest();

CREATE FUNCTION public.messaging_list_staff_for_guest()
RETURNS TABLE(
  id UUID,
  full_name TEXT,
  department TEXT,
  profile_image TEXT,
  is_online BOOLEAN,
  role TEXT,
  verification_badge TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    CASE
      WHEN coalesce(s.profile_hidden_by_admin, false)
      THEN public.mask_staff_display_name_for_privacy(s.full_name)
      ELSE s.full_name
    END,
    CASE
      WHEN coalesce(s.profile_hidden_by_admin, false) THEN NULL::text
      ELSE s.department
    END,
    s.profile_image,
    s.is_online,
    s.role,
    CASE
      WHEN coalesce(s.profile_hidden_by_admin, false) THEN NULL::text
      ELSE s.verification_badge::text
    END
  FROM public.staff s
  WHERE s.is_active = true
    AND s.deleted_at IS NULL
    AND coalesce((s.app_permissions->>'misafir_mesaj_alabilir')::boolean, true) = true
  ORDER BY s.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.messaging_list_staff_for_guest() TO anon;
GRANT EXECUTE ON FUNCTION public.messaging_list_staff_for_guest() TO authenticated;

-- Profil ziyareti: admin veya kendi kaydı tam veri; aksi halde gizli profilde kısıtlı satır.
DROP FUNCTION IF EXISTS public.get_staff_public_profile(uuid);

CREATE OR REPLACE FUNCTION public.get_staff_public_profile(p_staff_id UUID)
RETURNS TABLE(
  id UUID,
  full_name TEXT,
  department TEXT,
  "position" TEXT,
  profile_image TEXT,
  cover_image TEXT,
  bio TEXT,
  is_online BOOLEAN,
  hire_date DATE,
  average_rating NUMERIC,
  total_reviews INTEGER,
  specialties TEXT[],
  languages TEXT[],
  office_location TEXT,
  achievements TEXT[],
  show_phone_to_guest BOOLEAN,
  show_email_to_guest BOOLEAN,
  show_whatsapp_to_guest BOOLEAN,
  phone TEXT,
  email TEXT,
  whatsapp TEXT,
  verification_badge TEXT,
  shift_id UUID,
  profile_hidden_by_admin BOOLEAN,
  profile_visit_restricted BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_viewer_staff_id uuid;
  v_viewer_role text;
  r record;
  v_restrict boolean;
BEGIN
  SELECT s.id, s.role
  INTO v_viewer_staff_id, v_viewer_role
  FROM public.staff s
  WHERE s.auth_id = auth.uid()
    AND s.deleted_at IS NULL
    AND s.is_active = true
  LIMIT 1;

  SELECT *
  INTO r
  FROM public.staff s
  WHERE s.id = p_staff_id
    AND s.is_active = true
    AND s.deleted_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_restrict := coalesce(r.profile_hidden_by_admin, false)
    AND NOT (
      v_viewer_role = 'admin'
      OR (v_viewer_staff_id IS NOT NULL AND v_viewer_staff_id = r.id)
    );

  IF v_restrict THEN
    RETURN QUERY SELECT
      r.id,
      public.mask_staff_display_name_for_privacy(r.full_name),
      NULL::text,
      NULL::text,
      r.profile_image,
      NULL::text,
      NULL::text,
      r.is_online,
      NULL::date,
      NULL::numeric,
      NULL::integer,
      NULL::text[],
      NULL::text[],
      NULL::text,
      NULL::text[],
      false,
      false,
      false,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::uuid,
      true,
      true;
  ELSE
    RETURN QUERY SELECT
      r.id,
      r.full_name,
      r.department,
      r.position,
      r.profile_image,
      r.cover_image,
      r.bio,
      r.is_online,
      r.hire_date::date,
      r.average_rating,
      r.total_reviews,
      r.specialties,
      r.languages,
      r.office_location,
      r.achievements,
      r.show_phone_to_guest,
      r.show_email_to_guest,
      r.show_whatsapp_to_guest,
      r.phone,
      r.email,
      r.whatsapp,
      r.verification_badge::text,
      r.shift_id,
      coalesce(r.profile_hidden_by_admin, false),
      false;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_staff_public_profile(UUID) IS
  'Profil ziyareti: admin veya ilgili personel tam veri; profile_hidden_by_admin ise diğerleri için maskeli/kısıtlı profil.';

GRANT EXECUTE ON FUNCTION public.get_staff_public_profile(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_staff_public_profile(uuid) TO authenticated;
