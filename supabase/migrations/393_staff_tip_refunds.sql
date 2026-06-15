-- Bahşiş iade: Stripe refund + refunded durumu

BEGIN;

ALTER TABLE public.staff_tips DROP CONSTRAINT IF EXISTS staff_tips_status_check;
ALTER TABLE public.staff_tips ADD CONSTRAINT staff_tips_status_check
  CHECK (status IN ('pending', 'confirmed', 'cancelled', 'refunded'));

ALTER TABLE public.staff_tips
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stripe_refund_id text;

CREATE INDEX IF NOT EXISTS staff_tips_stripe_refund_idx
  ON public.staff_tips (stripe_refund_id)
  WHERE stripe_refund_id IS NOT NULL;

ALTER TABLE public.payment_requests DROP CONSTRAINT IF EXISTS payment_requests_status_check;
ALTER TABLE public.payment_requests ADD CONSTRAINT payment_requests_status_check
  CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded'));

ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS provider_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_refund_id text;

CREATE INDEX IF NOT EXISTS payment_requests_payment_intent_idx
  ON public.payment_requests (provider_payment_intent_id)
  WHERE provider_payment_intent_id IS NOT NULL;

COMMENT ON COLUMN public.staff_tips.stripe_refund_id IS 'Stripe refund id (re_...) — kart bahşiş iadesi';
COMMENT ON COLUMN public.payment_requests.provider_payment_intent_id IS 'Stripe PaymentIntent id — iade için';

COMMIT;
