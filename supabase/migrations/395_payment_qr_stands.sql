-- Sabit QR ödeme noktaları — manuel kapatılana kadar tekrar tekrar ödeme alınır

BEGIN;

CREATE TABLE IF NOT EXISTS public.payment_qr_stands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'try',
  title text NOT NULL,
  description text,
  service_kind text NOT NULL DEFAULT 'generic' CHECK (
    service_kind IN ('food', 'amenity', 'room_service', 'transfer', 'dining', 'generic', 'other', 'staff_tip')
  ),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  closed_at timestamptz,
  closed_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_qr_stands_org_idx ON public.payment_qr_stands (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_qr_stands_status_idx ON public.payment_qr_stands (status, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_qr_stands_token_idx ON public.payment_qr_stands (public_token);

CREATE OR REPLACE FUNCTION public.payment_qr_stands_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_qr_stands_updated_at ON public.payment_qr_stands;
CREATE TRIGGER trg_payment_qr_stands_updated_at
  BEFORE UPDATE ON public.payment_qr_stands
  FOR EACH ROW EXECUTE FUNCTION public.payment_qr_stands_set_updated_at();

ALTER TABLE public.payment_qr_stands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_qr_stands_staff_select ON public.payment_qr_stands;
CREATE POLICY payment_qr_stands_staff_select ON public.payment_qr_stands
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.deleted_at IS NULL
        AND COALESCE(s.is_active, true) = true
        AND (
          s.role = 'admin'
          OR s.organization_id = payment_qr_stands.organization_id
        )
    )
  );

GRANT SELECT ON public.payment_qr_stands TO authenticated;

COMMENT ON TABLE public.payment_qr_stands IS 'Sabit QR ödeme — QR kapatılana kadar her okutmada yeni Stripe oturumu açılır.';

COMMIT;
