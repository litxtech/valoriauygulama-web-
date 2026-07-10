-- Partner otel misafirleri için kişiye özel kahvaltı QR biletleri.
-- Partner QR oluşturur; Valoria resepsiyon/mutfak okutunca misafir «kahvaltı yapabilir» olur.

BEGIN;

CREATE TABLE IF NOT EXISTS public.breakfast_guest_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_hotel_id uuid NOT NULL REFERENCES public.breakfast_partner_hotels(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  record_date date NOT NULL,
  guest_name text NOT NULL,
  room_number text,
  token text NOT NULL,
  created_by_auth_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz,
  redeemed_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  CONSTRAINT breakfast_guest_passes_name_not_blank CHECK (length(trim(guest_name)) > 0),
  CONSTRAINT breakfast_guest_passes_token_not_blank CHECK (length(trim(token)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_breakfast_guest_passes_token
  ON public.breakfast_guest_passes (token);

CREATE INDEX IF NOT EXISTS idx_breakfast_guest_passes_hotel_date
  ON public.breakfast_guest_passes (partner_hotel_id, record_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_breakfast_guest_passes_org_date
  ON public.breakfast_guest_passes (organization_id, record_date DESC, redeemed_at);

COMMENT ON TABLE public.breakfast_guest_passes IS
  'Partner otel misafirleri için kişisel kahvaltı QR biletleri — resepsiyon okutunca onaylanır.';

-- ---------- Yetki ----------
CREATE OR REPLACE FUNCTION public.staff_can_redeem_breakfast_guest_pass(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT
      s.role IN ('admin', 'reception_chief', 'receptionist')
      OR lower(coalesce(s.department, '')) IN (
        'reception', 'receptionist', 'reception_chief', 'resepsiyon', 'front_desk',
        'kitchen', 'kitchen_staff', 'mutfak', 'chef', 'head_chef', 'pastry', 'restaurant'
      )
      OR coalesce((s.app_permissions->>'mutfak_operasyon')::boolean, false)
      OR coalesce((s.app_permissions->>'yemek_listesi_mutfak_onay')::boolean, false)
      OR public.staff_can_view_breakfast_partner_board(p_org_id)
    FROM public.staff s
    WHERE s.auth_id = auth.uid()
      AND s.organization_id = p_org_id
      AND coalesce(s.is_active, true) = true
      AND s.deleted_at IS NULL
    LIMIT 1
  ), false);
$$;

GRANT EXECUTE ON FUNCTION public.staff_can_redeem_breakfast_guest_pass(uuid) TO authenticated;

-- ---------- JSON satır ----------
CREATE OR REPLACE FUNCTION public.breakfast_guest_pass_to_json(p_row public.breakfast_guest_passes)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', p_row.id,
    'partnerHotelId', p_row.partner_hotel_id,
    'organizationId', p_row.organization_id,
    'recordDate', p_row.record_date,
    'guestName', p_row.guest_name,
    'roomNumber', p_row.room_number,
    'token', p_row.token,
    'createdAt', p_row.created_at,
    'redeemedAt', p_row.redeemed_at,
    'redeemedByStaffId', p_row.redeemed_by_staff_id,
    'cancelledAt', p_row.cancelled_at,
    'status', CASE
      WHEN p_row.cancelled_at IS NOT NULL THEN 'cancelled'
      WHEN p_row.redeemed_at IS NOT NULL THEN 'redeemed'
      ELSE 'pending'
    END
  );
$$;

-- ---------- Partner: bilet oluştur ----------
CREATE OR REPLACE FUNCTION public.breakfast_guest_pass_create(
  p_guest_name text,
  p_room_number text DEFAULT NULL,
  p_record_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_hotel_id uuid;
  v_hotel record;
  v_date date;
  v_today date;
  v_row public.breakfast_guest_passes;
  v_token text;
BEGIN
  v_hotel_id := public.breakfast_partner_current_hotel_id();
  IF v_hotel_id IS NULL THEN
    RAISE EXCEPTION 'Partner otel hesabı bulunamadı veya askıda.';
  END IF;

  SELECT * INTO v_hotel FROM public.breakfast_partner_hotels h WHERE h.id = v_hotel_id;
  IF NOT FOUND OR v_hotel.status <> 'active' THEN
    RAISE EXCEPTION 'Partner otel aktif değil.';
  END IF;

  IF p_guest_name IS NULL OR length(trim(p_guest_name)) = 0 THEN
    RAISE EXCEPTION 'Misafir adı zorunludur.';
  END IF;

  v_today := (timezone('Europe/Istanbul', now()))::date;
  v_date := coalesce(p_record_date, v_today);

  IF v_date < v_today - 1 OR v_date > v_today + 1 THEN
    RAISE EXCEPTION 'Kahvaltı tarihi yalnızca dün, bugün veya yarın olabilir.';
  END IF;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  INSERT INTO public.breakfast_guest_passes (
    partner_hotel_id,
    organization_id,
    record_date,
    guest_name,
    room_number,
    token,
    created_by_auth_id
  )
  VALUES (
    v_hotel_id,
    v_hotel.organization_id,
    v_date,
    trim(p_guest_name),
    nullif(trim(coalesce(p_room_number, '')), ''),
    v_token,
    auth.uid()
  )
  RETURNING * INTO v_row;

  RETURN public.breakfast_guest_pass_to_json(v_row);
END;
$$;

GRANT EXECUTE ON FUNCTION public.breakfast_guest_pass_create(text, text, date) TO authenticated;

-- ---------- Partner: iptal ----------
CREATE OR REPLACE FUNCTION public.breakfast_guest_pass_cancel(p_pass_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_hotel_id uuid;
  v_row public.breakfast_guest_passes;
BEGIN
  v_hotel_id := public.breakfast_partner_current_hotel_id();
  IF v_hotel_id IS NULL THEN
    RAISE EXCEPTION 'Partner otel hesabı bulunamadı.';
  END IF;

  UPDATE public.breakfast_guest_passes p
  SET cancelled_at = now()
  WHERE p.id = p_pass_id
    AND p.partner_hotel_id = v_hotel_id
    AND p.redeemed_at IS NULL
    AND p.cancelled_at IS NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bilet bulunamadı, zaten kullanılmış veya iptal edilmiş.';
  END IF;

  RETURN public.breakfast_guest_pass_to_json(v_row);
END;
$$;

GRANT EXECUTE ON FUNCTION public.breakfast_guest_pass_cancel(uuid) TO authenticated;

-- ---------- Resepsiyon: QR okut / onayla ----------
CREATE OR REPLACE FUNCTION public.breakfast_guest_pass_redeem(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_org_id uuid;
  v_staff_id uuid;
  v_today date;
  v_row public.breakfast_guest_passes;
  v_hotel_name text;
  v_staff_name text;
BEGIN
  v_org_id := public.breakfast_partner_provider_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Kahvaltı partner işletmesi bulunamadı.';
  END IF;

  IF NOT public.staff_can_redeem_breakfast_guest_pass(v_org_id) THEN
    RAISE EXCEPTION 'Kahvaltı QR onaylama yetkiniz yok.';
  END IF;

  SELECT s.id INTO v_staff_id
  FROM public.staff s
  WHERE s.auth_id = auth.uid()
    AND s.organization_id = v_org_id
    AND coalesce(s.is_active, true) = true
    AND s.deleted_at IS NULL
  LIMIT 1;

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Personel kaydı bulunamadı.';
  END IF;

  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RAISE EXCEPTION 'Geçersiz QR kodu.';
  END IF;

  v_today := (timezone('Europe/Istanbul', now()))::date;

  SELECT p.* INTO v_row
  FROM public.breakfast_guest_passes p
  JOIN public.breakfast_partner_hotels h ON h.id = p.partner_hotel_id
  WHERE p.token = trim(p_token)
    AND p.organization_id = v_org_id
    AND h.status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'QR kodu bulunamadı veya geçersiz.';
  END IF;

  IF v_row.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Bu bilet iptal edilmiş.';
  END IF;

  IF v_row.redeemed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Bu bilet zaten kullanılmış (%).',
      to_char(v_row.redeemed_at AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI');
  END IF;

  IF v_row.record_date < v_today - 1 OR v_row.record_date > v_today + 1 THEN
    RAISE EXCEPTION 'Bu bilet kahvaltı tarihi için geçerli değil (%).',
      to_char(v_row.record_date, 'DD.MM.YYYY');
  END IF;

  UPDATE public.breakfast_guest_passes
  SET redeemed_at = now(), redeemed_by_staff_id = v_staff_id
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  SELECT h.name INTO v_hotel_name
  FROM public.breakfast_partner_hotels h
  WHERE h.id = v_row.partner_hotel_id;

  SELECT coalesce(s.full_name, s.email, 'Personel') INTO v_staff_name
  FROM public.staff s
  WHERE s.id = v_staff_id;

  RETURN public.breakfast_guest_pass_to_json(v_row)
    || jsonb_build_object(
      'partnerHotelName', coalesce(v_hotel_name, ''),
      'redeemedByStaffName', coalesce(v_staff_name, '')
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.breakfast_guest_pass_redeem(text) TO authenticated;

-- ---------- Partner: liste ----------
CREATE OR REPLACE FUNCTION public.breakfast_guest_pass_list_partner(
  p_record_date date DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hotel_id uuid;
  v_date date;
  v_rows jsonb;
BEGIN
  v_hotel_id := public.breakfast_partner_current_hotel_id();
  IF v_hotel_id IS NULL THEN
    RAISE EXCEPTION 'Partner otel hesabı bulunamadı.';
  END IF;

  v_date := coalesce(p_record_date, (timezone('Europe/Istanbul', now()))::date);

  SELECT coalesce(jsonb_agg(public.breakfast_guest_pass_to_json(p) ORDER BY p.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT *
    FROM public.breakfast_guest_passes p
    WHERE p.partner_hotel_id = v_hotel_id
      AND p.record_date = v_date
    ORDER BY p.created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 100), 200))
  ) p;

  RETURN jsonb_build_object('recordDate', v_date, 'passes', coalesce(v_rows, '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.breakfast_guest_pass_list_partner(date, integer) TO authenticated;

-- ---------- Personel: onaylı misafir listesi ----------
CREATE OR REPLACE FUNCTION public.breakfast_guest_pass_list_redeemed(
  p_record_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_date date;
  v_rows jsonb;
  v_summary jsonb;
BEGIN
  v_org_id := public.breakfast_partner_provider_org_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('recordDate', NULL, 'passes', '[]'::jsonb, 'summary', '{}'::jsonb);
  END IF;

  IF NOT public.staff_can_redeem_breakfast_guest_pass(v_org_id)
     AND NOT public.staff_can_manage_breakfast_partners(v_org_id) THEN
    RAISE EXCEPTION 'Kahvaltı misafir listesini görüntüleme yetkiniz yok.';
  END IF;

  v_date := coalesce(p_record_date, (timezone('Europe/Istanbul', now()))::date);

  SELECT coalesce(jsonb_agg(row_data ORDER BY redeemed_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'id', p.id,
      'partnerHotelId', p.partner_hotel_id,
      'partnerHotelName', h.name,
      'recordDate', p.record_date,
      'guestName', p.guest_name,
      'roomNumber', p.room_number,
      'redeemedAt', p.redeemed_at,
      'redeemedByStaffName', coalesce(s.full_name, s.email, ''),
      'status', 'redeemed'
    ) AS row_data,
    p.redeemed_at
    FROM public.breakfast_guest_passes p
    JOIN public.breakfast_partner_hotels h ON h.id = p.partner_hotel_id
    LEFT JOIN public.staff s ON s.id = p.redeemed_by_staff_id
    WHERE p.organization_id = v_org_id
      AND p.record_date = v_date
      AND p.redeemed_at IS NOT NULL
      AND p.cancelled_at IS NULL
  ) sub;

  SELECT jsonb_build_object(
    'totalRedeemed', count(*)::int,
    'totalPending', count(*) FILTER (
      WHERE p.redeemed_at IS NULL AND p.cancelled_at IS NULL
    )::int
  )
  INTO v_summary
  FROM public.breakfast_guest_passes p
  WHERE p.organization_id = v_org_id
    AND p.record_date = v_date
    AND p.cancelled_at IS NULL;

  RETURN jsonb_build_object(
    'recordDate', v_date,
    'passes', coalesce(v_rows, '[]'::jsonb),
    'summary', coalesce(v_summary, '{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.breakfast_guest_pass_list_redeemed(date) TO authenticated;

-- ---------- RLS ----------
ALTER TABLE public.breakfast_guest_passes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "breakfast_guest_passes_admin" ON public.breakfast_guest_passes;
CREATE POLICY "breakfast_guest_passes_admin" ON public.breakfast_guest_passes
  FOR ALL TO authenticated
  USING (public.staff_can_manage_breakfast_partners(organization_id))
  WITH CHECK (public.staff_can_manage_breakfast_partners(organization_id));

DROP POLICY IF EXISTS "breakfast_guest_passes_partner_read" ON public.breakfast_guest_passes;
CREATE POLICY "breakfast_guest_passes_partner_read" ON public.breakfast_guest_passes
  FOR SELECT TO authenticated
  USING (partner_hotel_id = public.breakfast_partner_current_hotel_id());

DROP POLICY IF EXISTS "breakfast_guest_passes_staff_read" ON public.breakfast_guest_passes;
CREATE POLICY "breakfast_guest_passes_staff_read" ON public.breakfast_guest_passes
  FOR SELECT TO authenticated
  USING (public.staff_can_redeem_breakfast_guest_pass(organization_id));

COMMIT;
