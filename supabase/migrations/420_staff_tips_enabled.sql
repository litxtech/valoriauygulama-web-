-- Personel bazında misafir bahşişi aç/kapa (admin paneli).

BEGIN;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS tips_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.staff.tips_enabled IS
  'false ise misafirler bu personele bahşiş gönderemez; profilde bahşiş butonu gizlenir.';

-- Misafir bahşiş oluşturma
CREATE OR REPLACE FUNCTION public.create_guest_staff_tip(
  p_app_token text,
  p_staff_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id uuid;
  v_tip_id uuid;
  v_staff_active boolean;
  v_tips_enabled boolean;
BEGIN
  IF p_app_token IS NULL OR trim(p_app_token) = '' OR p_staff_id IS NULL THEN
    RAISE EXCEPTION 'Geçersiz istek';
  END IF;

  IF p_amount IS NULL OR p_amount < 10 OR p_amount > 50000 THEN
    RAISE EXCEPTION 'Bahşiş tutarı 10–50.000 TL arasında olmalı';
  END IF;

  IF p_payment_method NOT IN ('room_charge', 'card_at_desk', 'cash_at_desk') THEN
    RAISE EXCEPTION 'Geçersiz ödeme yöntemi';
  END IF;

  SELECT id INTO v_guest_id
  FROM public.guests
  WHERE app_token = p_app_token AND deleted_at IS NULL
  LIMIT 1;

  IF v_guest_id IS NULL THEN
    RAISE EXCEPTION 'Misafir oturumu bulunamadı';
  END IF;

  SELECT COALESCE(s.is_active, true), COALESCE(s.tips_enabled, true)
  INTO v_staff_active, v_tips_enabled
  FROM public.staff s
  WHERE s.id = p_staff_id AND s.deleted_at IS NULL
  LIMIT 1;

  IF v_staff_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Personel bulunamadı';
  END IF;

  IF v_tips_enabled IS NOT true THEN
    RAISE EXCEPTION 'Bu personele bahşiş gönderilemez';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_blocks ub
    WHERE ub.blocker_type = 'guest'
      AND ub.blocker_guest_id = v_guest_id
      AND ub.blocked_type = 'staff'
      AND ub.blocked_staff_id = p_staff_id
  ) THEN
    RAISE EXCEPTION 'Bu personele bahşiş gönderemezsiniz';
  END IF;

  INSERT INTO public.staff_tips (
    guest_id,
    staff_id,
    amount,
    payment_method,
    note
  ) VALUES (
    v_guest_id,
    p_staff_id,
    round(p_amount, 2),
    p_payment_method,
    NULLIF(trim(COALESCE(p_note, '')), '')
  )
  RETURNING id INTO v_tip_id;

  RETURN v_tip_id;
END;
$$;

-- Misafir profil RPC: tips_enabled
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
  profile_visit_restricted BOOLEAN,
  tips_enabled BOOLEAN
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
  v_tips_enabled boolean;
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

  v_tips_enabled := coalesce(r.tips_enabled, true) AND NOT v_restrict;

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
      true,
      false;
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
      false,
      v_tips_enabled;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_staff_public_profile(UUID) IS
  'Profil ziyareti; tips_enabled=false ise misafir bahşiş gönderemez.';

GRANT EXECUTE ON FUNCTION public.get_staff_public_profile(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_staff_public_profile(uuid) TO authenticated;

COMMIT;
