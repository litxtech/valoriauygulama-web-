-- Misafir → personel bahşiş kayıtları (oda faturası / resepsiyon ödemesi)

BEGIN;

CREATE TABLE IF NOT EXISTS public.staff_tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0 AND amount <= 50000),
  currency text NOT NULL DEFAULT 'TRY',
  payment_method text NOT NULL CHECK (payment_method IN ('room_charge', 'card_at_desk', 'cash_at_desk')),
  note text,
  room_number text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  confirmed_at timestamptz,
  confirmed_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_tips_guest_idx ON public.staff_tips (guest_id, created_at DESC);
CREATE INDEX IF NOT EXISTS staff_tips_staff_idx ON public.staff_tips (staff_id, created_at DESC);
CREATE INDEX IF NOT EXISTS staff_tips_org_status_idx ON public.staff_tips (organization_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.staff_tips_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_tips_updated_at ON public.staff_tips;
CREATE TRIGGER trg_staff_tips_updated_at
  BEFORE UPDATE ON public.staff_tips
  FOR EACH ROW EXECUTE FUNCTION public.staff_tips_set_updated_at();

CREATE OR REPLACE FUNCTION public.staff_tips_set_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.guest_id IS NOT NULL THEN
    SELECT COALESCE(g.organization_id, public.current_guest_organization_id())
    INTO NEW.organization_id
    FROM public.guests g
    WHERE g.id = NEW.guest_id;
  END IF;
  IF NEW.room_number IS NULL AND NEW.guest_id IS NOT NULL THEN
    SELECT r.room_number
    INTO NEW.room_number
    FROM public.guests g
    LEFT JOIN public.rooms r ON r.id = g.room_id
    WHERE g.id = NEW.guest_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_tips_set_meta ON public.staff_tips;
CREATE TRIGGER trg_staff_tips_set_meta
  BEFORE INSERT OR UPDATE OF guest_id ON public.staff_tips
  FOR EACH ROW
  EXECUTE FUNCTION public.staff_tips_set_organization_id();

ALTER TABLE public.staff_tips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_tips_guest_select_own ON public.staff_tips;
CREATE POLICY staff_tips_guest_select_own ON public.staff_tips
  FOR SELECT TO authenticated
  USING (
    guest_id IN (
      SELECT g.id FROM public.guests g
      WHERE g.auth_user_id = auth.uid() AND g.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS staff_tips_staff_select ON public.staff_tips;
CREATE POLICY staff_tips_staff_select ON public.staff_tips
  FOR SELECT TO authenticated
  USING (
    staff_id IN (
      SELECT s.id FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.deleted_at IS NULL AND COALESCE(s.is_active, true) = true
    )
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.is_active = true
        AND s.deleted_at IS NULL
        AND (
          s.role = 'admin'
          OR s.organization_id IS NOT DISTINCT FROM staff_tips.organization_id
        )
    )
  );

DROP POLICY IF EXISTS staff_tips_staff_update ON public.staff_tips;
CREATE POLICY staff_tips_staff_update ON public.staff_tips
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.is_active = true
        AND s.deleted_at IS NULL
        AND (
          s.role = 'admin'
          OR s.id = staff_tips.staff_id
          OR s.organization_id IS NOT DISTINCT FROM staff_tips.organization_id
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL
    )
  );

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

  SELECT COALESCE(s.is_active, true) INTO v_staff_active
  FROM public.staff s
  WHERE s.id = p_staff_id AND s.deleted_at IS NULL
  LIMIT 1;

  IF v_staff_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Personel bulunamadı';
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

CREATE OR REPLACE FUNCTION public.confirm_staff_tip(
  p_tip_id uuid,
  p_status text DEFAULT 'confirmed'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
BEGIN
  IF p_status NOT IN ('confirmed', 'cancelled') THEN
    RAISE EXCEPTION 'Geçersiz durum';
  END IF;

  SELECT s.id INTO v_staff_id
  FROM public.staff s
  WHERE s.auth_id = auth.uid() AND s.deleted_at IS NULL AND COALESCE(s.is_active, true) = true
  LIMIT 1;

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Personel oturumu gerekli';
  END IF;

  UPDATE public.staff_tips t
  SET
    status = p_status,
    confirmed_at = CASE WHEN p_status = 'confirmed' THEN now() ELSE confirmed_at END,
    confirmed_by_staff_id = CASE WHEN p_status = 'confirmed' THEN v_staff_id ELSE confirmed_by_staff_id END
  WHERE t.id = p_tip_id
    AND t.status = 'pending'
    AND (
      t.staff_id = v_staff_id
      OR EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.id = v_staff_id
          AND (s.role = 'admin' OR s.organization_id IS NOT DISTINCT FROM t.organization_id)
      )
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bahşiş kaydı güncellenemedi';
  END IF;
END;
$$;

GRANT SELECT, UPDATE ON public.staff_tips TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_guest_staff_tip(text, uuid, numeric, text, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.confirm_staff_tip(uuid, text) TO authenticated;

COMMENT ON TABLE public.staff_tips IS 'Misafir bahşiş talepleri — oda faturası veya resepsiyon ödemesi ile tamamlanır.';
COMMENT ON FUNCTION public.create_guest_staff_tip IS 'Misafir app_token ile personele bahşiş kaydı oluşturur.';

COMMIT;
