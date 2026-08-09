-- Online booking price negotiation (pazarlık)

ALTER TABLE public.online_bookings
  ADD COLUMN IF NOT EXISTS offer_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS offer_status TEXT,
  ADD COLUMN IF NOT EXISTS offer_note TEXT,
  ADD COLUMN IF NOT EXISTS offer_admin_note TEXT,
  ADD COLUMN IF NOT EXISTS offer_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS offer_decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS offer_decided_by UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'online_bookings_offer_status_check'
  ) THEN
    ALTER TABLE public.online_bookings
      ADD CONSTRAINT online_bookings_offer_status_check
      CHECK (
        offer_status IS NULL
        OR offer_status IN ('pending', 'approved', 'rejected')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_online_bookings_offer_pending
  ON public.online_bookings (organization_id, offer_status, created_at DESC)
  WHERE offer_status = 'pending';

-- Misafir teklif gönderir (ödeme yok)
CREATE OR REPLACE FUNCTION public.submit_online_booking_offer(
  p_booking_id UUID,
  p_offer_amount NUMERIC,
  p_offer_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.online_bookings%ROWTYPE;
  v_list NUMERIC;
BEGIN
  IF p_booking_id IS NULL THEN
    RAISE EXCEPTION 'invalid_booking';
  END IF;
  IF coalesce(p_offer_amount, 0) < 1 THEN
    RAISE EXCEPTION 'invalid_offer_amount';
  END IF;

  SELECT * INTO v_row FROM public.online_bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;
  IF v_row.status NOT IN ('pending') THEN
    RAISE EXCEPTION 'booking_not_open';
  END IF;
  IF v_row.paid_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_paid';
  END IF;
  IF v_row.offer_status = 'pending' THEN
    RAISE EXCEPTION 'offer_already_pending';
  END IF;
  IF v_row.offer_status = 'approved' THEN
    RAISE EXCEPTION 'offer_already_approved';
  END IF;

  v_list := coalesce(v_row.list_total, v_row.quoted_total, 0);
  IF v_list > 0 AND p_offer_amount >= v_list THEN
    RAISE EXCEPTION 'offer_not_below_list';
  END IF;
  -- Teklif liste/ödenecek tutarın %40'ının altına düşemesin (kötüye kullanım)
  IF v_list > 0 AND p_offer_amount < round(v_list * 0.40, 2) THEN
    RAISE EXCEPTION 'offer_too_low';
  END IF;

  UPDATE public.online_bookings
  SET
    offer_amount = round(p_offer_amount, 2),
    offer_status = 'pending',
    offer_note = nullif(trim(coalesce(p_offer_note, '')), ''),
    offer_submitted_at = now(),
    offer_admin_note = NULL,
    offer_decided_at = NULL,
    offer_decided_by = NULL,
    updated_at = now()
  WHERE id = p_booking_id;

  RETURN p_booking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_online_booking_offer(UUID, NUMERIC, TEXT) TO anon, authenticated;

-- Admin onay / red
CREATE OR REPLACE FUNCTION public.decide_online_booking_offer(
  p_booking_id UUID,
  p_approve BOOLEAN,
  p_admin_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff public.staff%ROWTYPE;
  v_row public.online_bookings%ROWTYPE;
  v_guest_id UUID;
BEGIN
  SELECT * INTO v_staff
  FROM public.staff s
  WHERE s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_staff';
  END IF;
  IF v_staff.role NOT IN ('admin', 'manager', 'reception') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_row FROM public.online_bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;
  IF v_row.offer_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'offer_not_pending';
  END IF;

  IF p_approve THEN
    IF coalesce(v_row.offer_amount, 0) < 1 THEN
      RAISE EXCEPTION 'invalid_offer_amount';
    END IF;
    UPDATE public.online_bookings
    SET
      offer_status = 'approved',
      offer_admin_note = nullif(trim(coalesce(p_admin_note, '')), ''),
      offer_decided_at = now(),
      offer_decided_by = v_staff.id,
      quoted_total = round(v_row.offer_amount, 2),
      discount_amount = greatest(
        0,
        round(coalesce(v_row.list_total, v_row.quoted_total, v_row.offer_amount) - v_row.offer_amount, 2)
      ),
      updated_at = now()
    WHERE id = p_booking_id;
  ELSE
    UPDATE public.online_bookings
    SET
      offer_status = 'rejected',
      offer_admin_note = nullif(trim(coalesce(p_admin_note, '')), ''),
      offer_decided_at = now(),
      offer_decided_by = v_staff.id,
      updated_at = now()
    WHERE id = p_booking_id;
  END IF;

  RETURN p_booking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decide_online_booking_offer(UUID, BOOLEAN, TEXT) TO authenticated;

COMMENT ON COLUMN public.online_bookings.offer_amount IS 'Misafir pazarlık teklifi (TRY)';
COMMENT ON COLUMN public.online_bookings.offer_status IS 'pending | approved | rejected';
