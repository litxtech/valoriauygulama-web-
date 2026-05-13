-- Çek defteri + personel borç/alacak (personel–personel ve otel/şirket tarafı).

BEGIN;

-- ---------- Storage: çek görselleri ----------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'finance-checks',
  'finance-checks',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "finance_checks_storage_insert" ON storage.objects;
CREATE POLICY "finance_checks_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'finance-checks');

DROP POLICY IF EXISTS "finance_checks_storage_read" ON storage.objects;
CREATE POLICY "finance_checks_storage_read" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'finance-checks');

-- ---------- Yardımcı: aynı org + admin ----------
CREATE OR REPLACE FUNCTION public.staff_is_admin_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.auth_id = auth.uid()
      AND s.role = 'admin'
      AND COALESCE(s.is_active, true) = true
      AND s.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.staff_org_ids_for_auth()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT s.organization_id), ARRAY[]::uuid[])
  FROM public.staff s
  WHERE s.auth_id = auth.uid()
    AND COALESCE(s.is_active, true) = true
    AND s.deleted_at IS NULL
    AND s.organization_id IS NOT NULL;
$$;

-- ---------- Çek kayıtları ----------
CREATE TABLE IF NOT EXISTS public.finance_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  direction text NOT NULL CHECK (direction IN ('given', 'received')),
  counterparty_name text NOT NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'TRY',
  check_number text,
  bank_name text,
  branch_name text,
  issue_date date,
  due_date date,
  purpose text,
  status text NOT NULL DEFAULT 'registered'
    CHECK (status IN ('draft', 'registered', 'presented', 'paid', 'bounced', 'cancelled')),
  image_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  updated_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_checks_counterparty_not_blank CHECK (length(trim(counterparty_name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_finance_checks_org_due
  ON public.finance_checks (organization_id, due_date);
CREATE INDEX IF NOT EXISTS idx_finance_checks_org_status
  ON public.finance_checks (organization_id, status);

-- ---------- Borç kayıtları ----------
CREATE TABLE IF NOT EXISTS public.staff_debt_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  category text NOT NULL DEFAULT 'personal'
    CHECK (category IN ('personal', 'hotel_expense', 'company_flow')),
  borrower_staff_id uuid REFERENCES public.staff(id) ON DELETE RESTRICT,
  borrower_is_organization boolean NOT NULL DEFAULT false,
  lender_staff_id uuid REFERENCES public.staff(id) ON DELETE RESTRICT,
  lender_is_organization boolean NOT NULL DEFAULT false,
  description text NOT NULL DEFAULT '',
  amount_principal numeric(14, 2) NOT NULL CHECK (amount_principal > 0),
  currency text NOT NULL DEFAULT 'TRY',
  amount_remaining numeric(14, 2) NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partial', 'closed')),
  due_date date,
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_debt_borrower_party CHECK (
    (borrower_is_organization = true AND borrower_staff_id IS NULL)
    OR (borrower_is_organization = false AND borrower_staff_id IS NOT NULL)
  ),
  CONSTRAINT staff_debt_lender_party CHECK (
    (lender_is_organization = true AND lender_staff_id IS NULL)
    OR (lender_is_organization = false AND lender_staff_id IS NOT NULL)
  ),
  CONSTRAINT staff_debt_not_both_org CHECK (NOT (borrower_is_organization AND lender_is_organization))
);

CREATE INDEX IF NOT EXISTS idx_staff_debt_org_created
  ON public.staff_debt_entries (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_debt_borrower ON public.staff_debt_entries (borrower_staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_debt_lender ON public.staff_debt_entries (lender_staff_id);

-- ---------- Ödemeler (kısmi kapama) ----------
CREATE TABLE IF NOT EXISTS public.staff_debt_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_entry_id uuid NOT NULL REFERENCES public.staff_debt_entries(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL DEFAULT 'cash'
    CHECK (payment_method IN ('cash', 'transfer', 'card', 'check', 'other')),
  finance_check_id uuid REFERENCES public.finance_checks(id) ON DELETE SET NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  recorded_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_debt_payments_debt ON public.staff_debt_payments (debt_entry_id);

-- org sync for payments
CREATE OR REPLACE FUNCTION public.sync_staff_debt_payment_org()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  SELECT e.organization_id INTO STRICT NEW.organization_id
  FROM public.staff_debt_entries e
  WHERE e.id = NEW.debt_entry_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_debt_payments_org ON public.staff_debt_payments;
CREATE TRIGGER trg_staff_debt_payments_org
  BEFORE INSERT OR UPDATE OF debt_entry_id ON public.staff_debt_payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_staff_debt_payment_org();

-- remaining + status
CREATE OR REPLACE FUNCTION public.staff_debt_recalc_remaining(p_debt_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prin numeric;
  paid numeric;
BEGIN
  SELECT amount_principal INTO prin FROM public.staff_debt_entries WHERE id = p_debt_id;
  IF prin IS NULL THEN RETURN; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO paid FROM public.staff_debt_payments WHERE debt_entry_id = p_debt_id;
  UPDATE public.staff_debt_entries
  SET
    amount_remaining = GREATEST(0, prin - paid),
    status = CASE
      WHEN paid <= 0 THEN 'open'
      WHEN paid >= prin THEN 'closed'
      ELSE 'partial'
    END,
    updated_at = now()
  WHERE id = p_debt_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_staff_debt_payments_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.staff_debt_recalc_remaining(OLD.debt_entry_id);
    RETURN OLD;
  END IF;
  PERFORM public.staff_debt_recalc_remaining(NEW.debt_entry_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_debt_payments_recalc ON public.staff_debt_payments;
CREATE TRIGGER trg_staff_debt_payments_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.staff_debt_payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_staff_debt_payments_after_change();

-- new debt: amount_remaining = principal
CREATE OR REPLACE FUNCTION public.staff_debt_entries_set_remaining()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.amount_remaining := NEW.amount_principal;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_debt_entries_remaining ON public.staff_debt_entries;
CREATE TRIGGER trg_staff_debt_entries_remaining
  BEFORE INSERT ON public.staff_debt_entries
  FOR EACH ROW EXECUTE FUNCTION public.staff_debt_entries_set_remaining();

CREATE OR REPLACE FUNCTION public.staff_debt_validate_staff_org()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.borrower_staff_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = NEW.borrower_staff_id AND s.organization_id = NEW.organization_id
    ) THEN
      RAISE EXCEPTION 'borrower_staff_id aynı işletmeye ait olmalı';
    END IF;
  END IF;
  IF NEW.lender_staff_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = NEW.lender_staff_id AND s.organization_id = NEW.organization_id
    ) THEN
      RAISE EXCEPTION 'lender_staff_id aynı işletmeye ait olmalı';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_debt_validate_org ON public.staff_debt_entries;
CREATE TRIGGER trg_staff_debt_validate_org
  BEFORE INSERT OR UPDATE OF borrower_staff_id, lender_staff_id, organization_id ON public.staff_debt_entries
  FOR EACH ROW EXECUTE FUNCTION public.staff_debt_validate_staff_org();

CREATE OR REPLACE FUNCTION public.finance_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_checks_updated ON public.finance_checks;
CREATE TRIGGER trg_finance_checks_updated
  BEFORE UPDATE ON public.finance_checks
  FOR EACH ROW EXECUTE FUNCTION public.finance_touch_updated_at();

DROP TRIGGER IF EXISTS trg_staff_debt_entries_updated ON public.staff_debt_entries;
CREATE TRIGGER trg_staff_debt_entries_updated
  BEFORE UPDATE ON public.staff_debt_entries
  FOR EACH ROW EXECUTE FUNCTION public.finance_touch_updated_at();

-- ---------- RLS ----------
ALTER TABLE public.finance_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_debt_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_debt_payments ENABLE ROW LEVEL SECURITY;

-- finance_checks: select — admin veya aynı org personeli
DROP POLICY IF EXISTS "finance_checks_select" ON public.finance_checks;
CREATE POLICY "finance_checks_select" ON public.finance_checks
  FOR SELECT TO authenticated USING (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_checks_insert" ON public.finance_checks;
CREATE POLICY "finance_checks_insert" ON public.finance_checks
  FOR INSERT TO authenticated WITH CHECK (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_checks_update" ON public.finance_checks;
CREATE POLICY "finance_checks_update" ON public.finance_checks
  FOR UPDATE TO authenticated USING (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  )
  WITH CHECK (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_checks_delete" ON public.finance_checks;
CREATE POLICY "finance_checks_delete" ON public.finance_checks
  FOR DELETE TO authenticated USING (public.staff_is_admin_active());

-- staff_debt_entries
DROP POLICY IF EXISTS "staff_debt_entries_select" ON public.staff_debt_entries;
CREATE POLICY "staff_debt_entries_select" ON public.staff_debt_entries
  FOR SELECT TO authenticated USING (
    public.staff_is_admin_active()
    OR (
      organization_id = ANY (public.staff_org_ids_for_auth())
      AND (
        borrower_staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
        OR lender_staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "staff_debt_entries_insert" ON public.staff_debt_entries;
CREATE POLICY "staff_debt_entries_insert" ON public.staff_debt_entries
  FOR INSERT TO authenticated WITH CHECK (
    public.staff_is_admin_active()
    OR (
      organization_id = ANY (public.staff_org_ids_for_auth())
      AND (
        borrower_staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
        OR lender_staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "staff_debt_entries_update" ON public.staff_debt_entries;
CREATE POLICY "staff_debt_entries_update" ON public.staff_debt_entries
  FOR UPDATE TO authenticated USING (
    public.staff_is_admin_active()
    OR (
      organization_id = ANY (public.staff_org_ids_for_auth())
      AND (
        borrower_staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
        OR lender_staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
      )
    )
  )
  WITH CHECK (
    public.staff_is_admin_active()
    OR (
      organization_id = ANY (public.staff_org_ids_for_auth())
      AND (
        borrower_staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
        OR lender_staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "staff_debt_entries_delete" ON public.staff_debt_entries;
CREATE POLICY "staff_debt_entries_delete" ON public.staff_debt_entries
  FOR DELETE TO authenticated USING (public.staff_is_admin_active());

-- payments: taraf veya admin
DROP POLICY IF EXISTS "staff_debt_payments_select" ON public.staff_debt_payments;
CREATE POLICY "staff_debt_payments_select" ON public.staff_debt_payments
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.staff_debt_entries e
      WHERE e.id = staff_debt_payments.debt_entry_id
        AND (
          public.staff_is_admin_active()
          OR (
            e.organization_id = ANY (public.staff_org_ids_for_auth())
            AND (
              e.borrower_staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
              OR e.lender_staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "staff_debt_payments_insert" ON public.staff_debt_payments;
CREATE POLICY "staff_debt_payments_insert" ON public.staff_debt_payments
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_debt_entries e
      WHERE e.id = debt_entry_id
        AND (
          public.staff_is_admin_active()
          OR (
            e.organization_id = ANY (public.staff_org_ids_for_auth())
            AND (
              e.borrower_staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
              OR e.lender_staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "staff_debt_payments_update" ON public.staff_debt_payments;
CREATE POLICY "staff_debt_payments_update" ON public.staff_debt_payments
  FOR UPDATE TO authenticated USING (
    public.staff_is_admin_active()
    OR EXISTS (
      SELECT 1 FROM public.staff_debt_entries e
      WHERE e.id = staff_debt_payments.debt_entry_id
        AND e.organization_id = ANY (public.staff_org_ids_for_auth())
        AND (
          e.borrower_staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
          OR e.lender_staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
        )
    )
  )
  WITH CHECK (
    public.staff_is_admin_active()
    OR EXISTS (
      SELECT 1 FROM public.staff_debt_entries e
      WHERE e.id = staff_debt_payments.debt_entry_id
        AND e.organization_id = ANY (public.staff_org_ids_for_auth())
        AND (
          e.borrower_staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
          OR e.lender_staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "staff_debt_payments_delete" ON public.staff_debt_payments;
CREATE POLICY "staff_debt_payments_delete" ON public.staff_debt_payments
  FOR DELETE TO authenticated USING (public.staff_is_admin_active());

COMMENT ON TABLE public.finance_checks IS 'Çek verildi/alındı takibi; görsel URL''leri image_urls içinde.';
COMMENT ON TABLE public.staff_debt_entries IS 'Borçlu/alacaklı: personel ve/veya işletme (organization); staff_debt_payments ile kapanır.';
COMMENT ON TABLE public.staff_debt_payments IS 'Borç ödemesi; finance_check_id ile çek bağlantısı.';

COMMIT;
