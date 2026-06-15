-- Misafir kendi bekleyen (ödenmemiş) bahşiş kaydını iptal edebilir

BEGIN;

CREATE OR REPLACE FUNCTION public.cancel_guest_staff_tip(p_tip_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_tip_id IS NULL THEN
    RAISE EXCEPTION 'Geçersiz istek';
  END IF;

  UPDATE public.staff_tips t
  SET status = 'cancelled', updated_at = now()
  WHERE t.id = p_tip_id
    AND t.status = 'pending'
    AND t.guest_id IN (
      SELECT g.id FROM public.guests g
      WHERE g.auth_user_id = auth.uid() AND g.deleted_at IS NULL
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bahşiş iptal edilemedi';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_guest_staff_tip(uuid) TO authenticated;

COMMENT ON FUNCTION public.cancel_guest_staff_tip IS 'Misafir — ödeme tamamlanmamış bahşiş kaydını iptal eder';

COMMIT;
