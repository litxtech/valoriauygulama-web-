-- Evrensel ödeme talepleri (Stripe Checkout + QR)

BEGIN;

CREATE TABLE IF NOT EXISTS public.payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(12), 'hex'),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'try',
  title text NOT NULL,
  description text,
  service_kind text NOT NULL DEFAULT 'generic' CHECK (
    service_kind IN ('food', 'amenity', 'room_service', 'transfer', 'dining', 'generic', 'other')
  ),
  reference_type text,
  reference_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'paid', 'failed', 'expired', 'cancelled')
  ),
  provider text NOT NULL DEFAULT 'stripe' CHECK (provider IN ('stripe', 'iyzico')),
  provider_session_id text,
  pay_url text,
  receipt_url text,
  guest_id uuid REFERENCES public.guests(id) ON DELETE SET NULL,
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  paid_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_requests_org_idx ON public.payment_requests (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_requests_status_idx ON public.payment_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_requests_staff_idx ON public.payment_requests (created_by_staff_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_requests_public_token_idx ON public.payment_requests (public_token);
CREATE INDEX IF NOT EXISTS payment_requests_provider_session_idx ON public.payment_requests (provider_session_id) WHERE provider_session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.payment_requests_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_requests_updated_at ON public.payment_requests;
CREATE TRIGGER trg_payment_requests_updated_at
  BEFORE UPDATE ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.payment_requests_set_updated_at();

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_requests_staff_select ON public.payment_requests;
CREATE POLICY payment_requests_staff_select ON public.payment_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.deleted_at IS NULL
        AND COALESCE(s.is_active, true) = true
        AND (
          s.role = 'admin'
          OR s.organization_id = payment_requests.organization_id
        )
    )
  );

DROP POLICY IF EXISTS payment_requests_guest_select_own ON public.payment_requests;
CREATE POLICY payment_requests_guest_select_own ON public.payment_requests
  FOR SELECT TO authenticated
  USING (
    guest_id IS NOT NULL
    AND guest_id IN (
      SELECT g.id FROM public.guests g
      WHERE g.auth_user_id = auth.uid() AND g.deleted_at IS NULL
    )
  );

-- İsteğe bağlı sipariş bağlantıları
ALTER TABLE public.guest_service_requests
  ADD COLUMN IF NOT EXISTS payment_request_id uuid REFERENCES public.payment_requests(id) ON DELETE SET NULL;

ALTER TABLE public.room_service_orders
  ADD COLUMN IF NOT EXISTS payment_request_id uuid REFERENCES public.payment_requests(id) ON DELETE SET NULL;

GRANT SELECT ON public.payment_requests TO authenticated;

COMMENT ON TABLE public.payment_requests IS 'Stripe Checkout tabanlı evrensel ödeme talepleri — QR ile tarayıcıda ödeme.';

COMMIT;
