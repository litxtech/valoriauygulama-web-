-- Online rezervasyon oda ödemesi (Stripe Checkout)

ALTER TABLE public.online_bookings
  ADD COLUMN IF NOT EXISTS payment_request_id UUID REFERENCES public.payment_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_online_bookings_payment_request
  ON public.online_bookings(payment_request_id)
  WHERE payment_request_id IS NOT NULL;

COMMENT ON COLUMN public.online_bookings.payment_request_id IS 'Stripe oda ödemesi payment_requests kaydı';
COMMENT ON COLUMN public.online_bookings.paid_at IS 'Oda ödemesi tahsil edildiğinde';
