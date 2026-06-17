-- Serbest tutarlı sabit QR — müşteri tutarı taradıktan sonra girer

BEGIN;

ALTER TABLE public.payment_qr_stands
  ADD COLUMN IF NOT EXISTS amount_mode text NOT NULL DEFAULT 'fixed'
  CHECK (amount_mode IN ('fixed', 'variable'));

ALTER TABLE public.payment_qr_stands
  DROP CONSTRAINT IF EXISTS payment_qr_stands_amount_check;

ALTER TABLE public.payment_qr_stands
  ALTER COLUMN amount DROP NOT NULL;

ALTER TABLE public.payment_qr_stands
  DROP CONSTRAINT IF EXISTS payment_qr_stands_amount_mode_check;

ALTER TABLE public.payment_qr_stands
  ADD CONSTRAINT payment_qr_stands_amount_mode_check CHECK (
    (amount_mode = 'fixed' AND amount IS NOT NULL AND amount > 0)
    OR (amount_mode = 'variable' AND amount IS NULL)
  );

COMMENT ON COLUMN public.payment_qr_stands.amount_mode IS 'fixed = sabit tutar; variable = müşteri tutarı girer';

COMMIT;
