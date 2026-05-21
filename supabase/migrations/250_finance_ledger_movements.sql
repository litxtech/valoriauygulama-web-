-- Genel muhasebe: gelir/gider hareketleri, cari, proje (inşaat/ofis). Fiş opsiyonel.
-- Mevcut personel harcaması, borç/alacak, çek modülleri ayrı kalır.

BEGIN;

-- İşletme türü genişletme
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_kind_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_kind_check
  CHECK (kind IN ('hotel', 'tour_office', 'construction', 'office', 'general'));

-- ---------- Cari ----------
CREATE TABLE IF NOT EXISTS public.finance_counterparties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  party_type text NOT NULL DEFAULT 'other'
    CHECK (party_type IN ('customer', 'supplier', 'subcontractor', 'staff', 'other')),
  phone text,
  tax_id text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_counterparties_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_finance_counterparties_org
  ON public.finance_counterparties (organization_id, name);

-- ---------- Proje (inşaat vb.) ----------
CREATE TABLE IF NOT EXISTS public.finance_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_projects_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_finance_projects_org
  ON public.finance_projects (organization_id, sort_order);

-- ---------- Gelir / gider hareketleri ----------
CREATE TABLE IF NOT EXISTS public.finance_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('income', 'expense')),
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'TRY',
  movement_date date NOT NULL DEFAULT (CURRENT_DATE),
  payment_method text NOT NULL DEFAULT 'cash'
    CHECK (payment_method IN ('cash', 'transfer', 'card', 'check', 'other')),
  category text NOT NULL DEFAULT 'other',
  counterparty_id uuid REFERENCES public.finance_counterparties(id) ON DELETE SET NULL,
  counterparty_name text,
  project_id uuid REFERENCES public.finance_projects(id) ON DELETE SET NULL,
  description text NOT NULL DEFAULT '',
  receipt_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  updated_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_movements_org_date
  ON public.finance_movements (organization_id, movement_date DESC);
CREATE INDEX IF NOT EXISTS idx_finance_movements_org_kind
  ON public.finance_movements (organization_id, kind);

-- ---------- Storage: muhasebe fişleri ----------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'finance-receipts',
  'finance-receipts',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "finance_receipts_storage_insert" ON storage.objects;
CREATE POLICY "finance_receipts_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'finance-receipts');

DROP POLICY IF EXISTS "finance_receipts_storage_read" ON storage.objects;
CREATE POLICY "finance_receipts_storage_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'finance-receipts');

-- ---------- updated_at ----------
CREATE OR REPLACE FUNCTION public.finance_ledger_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_counterparties_updated ON public.finance_counterparties;
CREATE TRIGGER trg_finance_counterparties_updated
  BEFORE UPDATE ON public.finance_counterparties
  FOR EACH ROW EXECUTE FUNCTION public.finance_ledger_touch_updated_at();

DROP TRIGGER IF EXISTS trg_finance_movements_updated ON public.finance_movements;
CREATE TRIGGER trg_finance_movements_updated
  BEFORE UPDATE ON public.finance_movements
  FOR EACH ROW EXECUTE FUNCTION public.finance_ledger_touch_updated_at();

-- ---------- RLS (finance_checks ile aynı mantık) ----------
ALTER TABLE public.finance_counterparties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_counterparties_select" ON public.finance_counterparties;
CREATE POLICY "finance_counterparties_select" ON public.finance_counterparties
  FOR SELECT TO authenticated USING (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_counterparties_insert" ON public.finance_counterparties;
CREATE POLICY "finance_counterparties_insert" ON public.finance_counterparties
  FOR INSERT TO authenticated WITH CHECK (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_counterparties_update" ON public.finance_counterparties;
CREATE POLICY "finance_counterparties_update" ON public.finance_counterparties
  FOR UPDATE TO authenticated USING (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  )
  WITH CHECK (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_counterparties_delete" ON public.finance_counterparties;
CREATE POLICY "finance_counterparties_delete" ON public.finance_counterparties
  FOR DELETE TO authenticated USING (public.staff_is_admin_active());

DROP POLICY IF EXISTS "finance_projects_select" ON public.finance_projects;
CREATE POLICY "finance_projects_select" ON public.finance_projects
  FOR SELECT TO authenticated USING (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_projects_insert" ON public.finance_projects;
CREATE POLICY "finance_projects_insert" ON public.finance_projects
  FOR INSERT TO authenticated WITH CHECK (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_projects_update" ON public.finance_projects;
CREATE POLICY "finance_projects_update" ON public.finance_projects
  FOR UPDATE TO authenticated USING (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  )
  WITH CHECK (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_projects_delete" ON public.finance_projects;
CREATE POLICY "finance_projects_delete" ON public.finance_projects
  FOR DELETE TO authenticated USING (public.staff_is_admin_active());

DROP POLICY IF EXISTS "finance_movements_select" ON public.finance_movements;
CREATE POLICY "finance_movements_select" ON public.finance_movements
  FOR SELECT TO authenticated USING (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_movements_insert" ON public.finance_movements;
CREATE POLICY "finance_movements_insert" ON public.finance_movements
  FOR INSERT TO authenticated WITH CHECK (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_movements_update" ON public.finance_movements;
CREATE POLICY "finance_movements_update" ON public.finance_movements
  FOR UPDATE TO authenticated USING (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  )
  WITH CHECK (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_movements_delete" ON public.finance_movements;
CREATE POLICY "finance_movements_delete" ON public.finance_movements
  FOR DELETE TO authenticated USING (public.staff_is_admin_active());

COMMENT ON TABLE public.finance_movements IS 'İşletme gelir/gider; receipt_urls opsiyonel fiş fotoğrafları.';
COMMENT ON TABLE public.finance_counterparties IS 'Cari: müşteri, tedarikçi, taşeron vb.';
COMMENT ON TABLE public.finance_projects IS 'Proje bazlı gider/gelir (inşaat).';

COMMIT;
