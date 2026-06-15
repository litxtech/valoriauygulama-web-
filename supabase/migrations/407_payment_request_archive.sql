-- Ödeme linki kapatma / arşiv (tahsil sonrası listeden kaldır, kayıt muhasebede kalır)

BEGIN;

ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS payment_requests_archived_idx
  ON public.payment_requests (organization_id, archived_at)
  WHERE archived_at IS NOT NULL;

COMMENT ON COLUMN public.payment_requests.archived_at IS
  'Tahsil edilmiş veya tamamlanmış link listeden kapatıldı — open-payment devre dışı.';

COMMIT;
