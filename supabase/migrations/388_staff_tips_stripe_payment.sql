-- Bahşiş: Stripe kart ödemesi (misafir → personel)

BEGIN;

ALTER TABLE public.staff_tips
  ADD COLUMN IF NOT EXISTS payment_request_id uuid REFERENCES public.payment_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS staff_tips_payment_request_idx
  ON public.staff_tips (payment_request_id)
  WHERE payment_request_id IS NOT NULL;

ALTER TABLE public.staff_tips DROP CONSTRAINT IF EXISTS staff_tips_payment_method_check;
ALTER TABLE public.staff_tips ADD CONSTRAINT staff_tips_payment_method_check
  CHECK (payment_method IN ('room_charge', 'card_at_desk', 'cash_at_desk', 'stripe_card'));

ALTER TABLE public.payment_requests DROP CONSTRAINT IF EXISTS payment_requests_service_kind_check;
ALTER TABLE public.payment_requests ADD CONSTRAINT payment_requests_service_kind_check
  CHECK (service_kind IN (
    'food', 'amenity', 'room_service', 'transfer', 'dining', 'generic', 'other', 'staff_tip'
  ));

CREATE OR REPLACE FUNCTION public.staff_tips_after_insert_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Stripe bahşiş: ödeme tamamlanana kadar bildirim gönderme (webhook onaylar)
  IF NEW.payment_method = 'stripe_card' AND NEW.status = 'pending' THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM public.notify_staff_tip_created(
      NEW.id,
      NEW.guest_id,
      NEW.staff_id,
      NEW.amount,
      NEW.payment_method
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'staff_tips_after_insert_notify skipped: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS staff_tips_guest_insert ON public.staff_tips;
CREATE POLICY staff_tips_guest_insert ON public.staff_tips
  FOR INSERT TO authenticated
  WITH CHECK (
    guest_id IN (
      SELECT g.id FROM public.guests g
      WHERE g.auth_user_id = auth.uid() AND g.deleted_at IS NULL
    )
    AND amount >= 10
    AND amount <= 50000
    AND payment_method IN ('room_charge', 'card_at_desk', 'cash_at_desk', 'stripe_card')
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_id AND s.deleted_at IS NULL AND COALESCE(s.is_active, true) = true
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_blocks ub
      WHERE ub.blocker_type = 'guest'
        AND ub.blocker_guest_id = guest_id
        AND ub.blocked_type = 'staff'
        AND ub.blocked_staff_id = staff_id
    )
  );

COMMIT;
