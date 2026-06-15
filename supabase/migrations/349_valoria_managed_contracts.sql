-- Valoria Sözleşme Yönetim Sistemi
-- İş ortakları, mutfak, personel, taşeron vb. dijital sözleşmeler

BEGIN;

-- ========== HELPERS ==========
CREATE OR REPLACE FUNCTION public.staff_has_managed_contract_manage_permission()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.current_user_is_staff_admin()
    OR public.staff_has_app_permission('sozlesme_yonetimi')
    OR public.staff_has_app_permission('super_admin');
$$;

CREATE OR REPLACE FUNCTION public.staff_has_managed_contract_view_permission()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.staff_has_managed_contract_manage_permission()
    OR public.staff_has_app_permission('sozlesme_goruntuleme');
$$;

CREATE OR REPLACE FUNCTION public.staff_can_view_managed_contract(p_contract_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_org_id uuid;
  v_role text;
  v_dept text;
  v_email text;
  v_contract record;
BEGIN
  SELECT s.id, s.organization_id, s.role, s.department, lower(trim(coalesce(s.email, '')))
  INTO v_staff_id, v_org_id, v_role, v_dept, v_email
  FROM public.staff s
  WHERE s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL
  LIMIT 1;

  IF v_staff_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT c.* INTO v_contract
  FROM public.managed_contracts c
  WHERE c.id = p_contract_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF public.staff_has_app_permission('super_admin') THEN
    RETURN true;
  END IF;

  IF v_contract.organization_id IS DISTINCT FROM v_org_id AND NOT public.staff_has_app_permission('super_admin') THEN
    RETURN false;
  END IF;

  IF public.staff_has_managed_contract_manage_permission() THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.managed_contract_staff_access a
    WHERE a.contract_id = p_contract_id AND a.staff_id = v_staff_id AND a.can_view = true
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.managed_contract_parties p
    WHERE p.contract_id = p_contract_id
      AND (
        p.linked_staff_id = v_staff_id
        OR (v_email <> '' AND lower(trim(coalesce(p.email, ''))) = v_email)
      )
  ) THEN
    RETURN true;
  END IF;

  IF v_dept IS NOT NULL AND v_dept <> '' AND v_contract.visible_departments IS NOT NULL THEN
    IF v_dept = ANY(v_contract.visible_departments) THEN
      RETURN true;
    END IF;
  END IF;

  IF public.staff_has_app_permission('sozlesme_goruntuleme')
     AND v_contract.status IN ('active', 'pending', 'expired', 'terminated', 'archived') THEN
    RETURN EXISTS (
      SELECT 1 FROM public.managed_contract_staff_access a
      WHERE a.contract_id = p_contract_id AND a.staff_id = v_staff_id
    );
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.next_managed_contract_number(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int := extract(year FROM now())::int;
  v_seq int;
BEGIN
  SELECT coalesce(max(
    CASE
      WHEN contract_number ~ ('^VAL-' || v_year::text || '-[0-9]+$')
      THEN substring(contract_number FROM '[0-9]+$')::int
      ELSE 0
    END
  ), 0) + 1
  INTO v_seq
  FROM public.managed_contracts
  WHERE organization_id = p_org_id;

  RETURN 'VAL-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

-- ========== TABLES ==========
CREATE TABLE IF NOT EXISTS public.managed_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  contract_number text NOT NULL,
  title text NOT NULL,
  contract_type text NOT NULL CHECK (contract_type IN (
    'kitchen_operation',
    'staff_employment',
    'cleaning_service',
    'supplier',
    'lease',
    'subcontractor',
    'other'
  )),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'pending', 'active', 'expired', 'terminated', 'archived'
  )),
  start_date date,
  end_date date,
  body_text text NOT NULL DEFAULT '',
  special_clauses text,
  current_version_no int NOT NULL DEFAULT 1,
  visible_departments text[] NOT NULL DEFAULT '{}',
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  updated_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  approved_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  approved_at timestamptz,
  terminated_at timestamptz,
  termination_reason text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, contract_number)
);

CREATE INDEX IF NOT EXISTS idx_managed_contracts_org_status ON public.managed_contracts(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_managed_contracts_org_created ON public.managed_contracts(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_managed_contracts_end_date ON public.managed_contracts(end_date) WHERE end_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.managed_contract_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.managed_contracts(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  party_side text NOT NULL CHECK (party_side IN ('party_1', 'party_2')),
  party_role text NOT NULL,
  full_name text,
  id_number text,
  phone text,
  email text,
  address text,
  tax_number text,
  company_name text,
  is_authority boolean NOT NULL DEFAULT false,
  authority_title text,
  linked_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_managed_contract_parties_contract ON public.managed_contract_parties(contract_id);
CREATE INDEX IF NOT EXISTS idx_managed_contract_parties_staff ON public.managed_contract_parties(linked_staff_id);

CREATE TABLE IF NOT EXISTS public.managed_contract_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.managed_contracts(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  version_no int NOT NULL,
  title text NOT NULL,
  contract_type text NOT NULL,
  body_text text NOT NULL DEFAULT '',
  special_clauses text,
  start_date date,
  end_date date,
  parties_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  change_summary text,
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contract_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_managed_contract_versions_contract ON public.managed_contract_versions(contract_id, version_no DESC);

CREATE TABLE IF NOT EXISTS public.managed_contract_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.managed_contracts(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  party_id uuid REFERENCES public.managed_contract_parties(id) ON DELETE SET NULL,
  signer_name text NOT NULL,
  signer_title text,
  signature_method text NOT NULL CHECK (signature_method IN (
    'draw', 'typed_name', 'sms', 'pdf_upload', 'e_signature'
  )),
  signature_data text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  signed_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ip_address text,
  device_info text,
  user_agent text,
  version_no int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_managed_contract_signatures_contract ON public.managed_contract_signatures(contract_id);

CREATE TABLE IF NOT EXISTS public.managed_contract_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.managed_contracts(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint,
  mime_type text,
  uploaded_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_managed_contract_attachments_contract ON public.managed_contract_attachments(contract_id);

CREATE TABLE IF NOT EXISTS public.managed_contract_staff_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.managed_contracts(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  can_view boolean NOT NULL DEFAULT true,
  can_download boolean NOT NULL DEFAULT false,
  granted_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contract_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_managed_contract_staff_access_staff ON public.managed_contract_staff_access(staff_id);

CREATE TABLE IF NOT EXISTS public.managed_contract_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.managed_contracts(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  actor_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  action_type text NOT NULL CHECK (action_type IN (
    'created', 'updated', 'viewed', 'downloaded', 'approved', 'signed',
    'submitted', 'terminated', 'archived', 'restored', 'version_created', 'printed'
  )),
  detail jsonb,
  ip_address text,
  device_info text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_managed_contract_audit_contract ON public.managed_contract_audit_logs(contract_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.managed_contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_type text NOT NULL,
  title text NOT NULL,
  body_text text NOT NULL DEFAULT '',
  special_clauses text,
  is_active boolean NOT NULL DEFAULT true,
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_managed_contract_templates_org_type ON public.managed_contract_templates(organization_id, contract_type);

-- ========== UPDATED_AT ==========
DROP TRIGGER IF EXISTS trg_managed_contracts_updated ON public.managed_contracts;
CREATE TRIGGER trg_managed_contracts_updated BEFORE UPDATE ON public.managed_contracts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_managed_contract_parties_updated ON public.managed_contract_parties;
CREATE TRIGGER trg_managed_contract_parties_updated BEFORE UPDATE ON public.managed_contract_parties
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_managed_contract_templates_updated ON public.managed_contract_templates;
CREATE TRIGGER trg_managed_contract_templates_updated BEFORE UPDATE ON public.managed_contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ========== VERSION SNAPSHOT ON UPDATE ==========
CREATE OR REPLACE FUNCTION public.managed_contract_bump_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parties jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.body_text IS DISTINCT FROM NEW.body_text
    OR OLD.title IS DISTINCT FROM NEW.title
    OR OLD.special_clauses IS DISTINCT FROM NEW.special_clauses
    OR OLD.start_date IS DISTINCT FROM NEW.start_date
    OR OLD.end_date IS DISTINCT FROM NEW.end_date
    OR OLD.contract_type IS DISTINCT FROM NEW.contract_type
  ) THEN
    NEW.current_version_no := OLD.current_version_no + 1;

    SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.party_side, p.created_at), '[]'::jsonb)
    INTO v_parties
    FROM public.managed_contract_parties p
    WHERE p.contract_id = NEW.id;

    INSERT INTO public.managed_contract_versions (
      contract_id, organization_id, version_no, title, contract_type,
      body_text, special_clauses, start_date, end_date, parties_snapshot,
      change_summary, created_by_staff_id
    ) VALUES (
      NEW.id, NEW.organization_id, NEW.current_version_no, NEW.title, NEW.contract_type,
      NEW.body_text, NEW.special_clauses, NEW.start_date, NEW.end_date, v_parties,
      'Otomatik sürüm', NEW.updated_by_staff_id
    );

    INSERT INTO public.managed_contract_audit_logs (contract_id, organization_id, actor_staff_id, action_type, detail)
    VALUES (NEW.id, NEW.organization_id, NEW.updated_by_staff_id, 'version_created',
      jsonb_build_object('version_no', NEW.current_version_no));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_managed_contract_bump_version ON public.managed_contracts;
CREATE TRIGGER trg_managed_contract_bump_version
  BEFORE UPDATE ON public.managed_contracts
  FOR EACH ROW EXECUTE FUNCTION public.managed_contract_bump_version();

-- Initial version on insert
CREATE OR REPLACE FUNCTION public.managed_contract_initial_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.managed_contract_versions (
    contract_id, organization_id, version_no, title, contract_type,
    body_text, special_clauses, start_date, end_date, parties_snapshot,
    change_summary, created_by_staff_id
  ) VALUES (
    NEW.id, NEW.organization_id, 1, NEW.title, NEW.contract_type,
    NEW.body_text, NEW.special_clauses, NEW.start_date, NEW.end_date, '[]'::jsonb,
    'İlk sürüm', NEW.created_by_staff_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_managed_contract_initial_version ON public.managed_contracts;
CREATE TRIGGER trg_managed_contract_initial_version
  AFTER INSERT ON public.managed_contracts
  FOR EACH ROW EXECUTE FUNCTION public.managed_contract_initial_version();

-- ========== STORAGE BUCKET ==========
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'managed-contract-files',
  'managed-contract-files',
  false,
  52428800,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ========== RLS ==========
ALTER TABLE public.managed_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.managed_contract_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.managed_contract_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.managed_contract_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.managed_contract_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.managed_contract_staff_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.managed_contract_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.managed_contract_templates ENABLE ROW LEVEL SECURITY;

-- managed_contracts
DROP POLICY IF EXISTS "mc_select" ON public.managed_contracts;
CREATE POLICY "mc_select" ON public.managed_contracts
  FOR SELECT TO authenticated
  USING (public.staff_can_view_managed_contract(id));

DROP POLICY IF EXISTS "mc_insert" ON public.managed_contracts;
CREATE POLICY "mc_insert" ON public.managed_contracts
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.staff_has_managed_contract_manage_permission()
  );

DROP POLICY IF EXISTS "mc_update" ON public.managed_contracts;
CREATE POLICY "mc_update" ON public.managed_contracts
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_has_managed_contract_manage_permission()
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.staff_has_managed_contract_manage_permission()
  );

-- No DELETE policy — arşiv only

-- parties
DROP POLICY IF EXISTS "mc_parties_select" ON public.managed_contract_parties;
CREATE POLICY "mc_parties_select" ON public.managed_contract_parties
  FOR SELECT TO authenticated
  USING (public.staff_can_view_managed_contract(contract_id));

DROP POLICY IF EXISTS "mc_parties_write" ON public.managed_contract_parties;
CREATE POLICY "mc_parties_write" ON public.managed_contract_parties
  FOR ALL TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_has_managed_contract_manage_permission()
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.staff_has_managed_contract_manage_permission()
  );

-- versions
DROP POLICY IF EXISTS "mc_versions_select" ON public.managed_contract_versions;
CREATE POLICY "mc_versions_select" ON public.managed_contract_versions
  FOR SELECT TO authenticated
  USING (public.staff_can_view_managed_contract(contract_id));

DROP POLICY IF EXISTS "mc_versions_insert" ON public.managed_contract_versions;
CREATE POLICY "mc_versions_insert" ON public.managed_contract_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.staff_has_managed_contract_manage_permission()
  );

-- signatures
DROP POLICY IF EXISTS "mc_signatures_select" ON public.managed_contract_signatures;
CREATE POLICY "mc_signatures_select" ON public.managed_contract_signatures
  FOR SELECT TO authenticated
  USING (public.staff_can_view_managed_contract(contract_id));

DROP POLICY IF EXISTS "mc_signatures_insert" ON public.managed_contract_signatures;
CREATE POLICY "mc_signatures_insert" ON public.managed_contract_signatures
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND (
      public.staff_has_managed_contract_manage_permission()
      OR public.staff_can_view_managed_contract(contract_id)
    )
  );

-- attachments
DROP POLICY IF EXISTS "mc_attachments_select" ON public.managed_contract_attachments;
CREATE POLICY "mc_attachments_select" ON public.managed_contract_attachments
  FOR SELECT TO authenticated
  USING (public.staff_can_view_managed_contract(contract_id));

DROP POLICY IF EXISTS "mc_attachments_write" ON public.managed_contract_attachments;
CREATE POLICY "mc_attachments_write" ON public.managed_contract_attachments
  FOR ALL TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_has_managed_contract_manage_permission()
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.staff_has_managed_contract_manage_permission()
  );

-- staff access
DROP POLICY IF EXISTS "mc_access_select" ON public.managed_contract_staff_access;
CREATE POLICY "mc_access_select" ON public.managed_contract_staff_access
  FOR SELECT TO authenticated
  USING (
    staff_id = public.current_staff_id()
    OR public.staff_has_managed_contract_manage_permission()
  );

DROP POLICY IF EXISTS "mc_access_write" ON public.managed_contract_staff_access;
CREATE POLICY "mc_access_write" ON public.managed_contract_staff_access
  FOR ALL TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_has_managed_contract_manage_permission()
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.staff_has_managed_contract_manage_permission()
  );

-- audit logs
DROP POLICY IF EXISTS "mc_audit_select" ON public.managed_contract_audit_logs;
CREATE POLICY "mc_audit_select" ON public.managed_contract_audit_logs
  FOR SELECT TO authenticated
  USING (
    public.staff_has_managed_contract_manage_permission()
    AND organization_id = public.current_staff_organization_id()
  );

DROP POLICY IF EXISTS "mc_audit_insert" ON public.managed_contract_audit_logs;
CREATE POLICY "mc_audit_insert" ON public.managed_contract_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.staff_can_view_managed_contract(contract_id)
  );

-- templates
DROP POLICY IF EXISTS "mc_templates_select" ON public.managed_contract_templates;
CREATE POLICY "mc_templates_select" ON public.managed_contract_templates
  FOR SELECT TO authenticated
  USING (
    organization_id IS NULL
    OR organization_id = public.current_staff_organization_id()
    OR public.staff_has_app_permission('super_admin')
  );

DROP POLICY IF EXISTS "mc_templates_write" ON public.managed_contract_templates;
CREATE POLICY "mc_templates_write" ON public.managed_contract_templates
  FOR ALL TO authenticated
  USING (public.staff_has_managed_contract_manage_permission())
  WITH CHECK (public.staff_has_managed_contract_manage_permission());

-- Storage policies
DROP POLICY IF EXISTS "mc_files_select" ON storage.objects;
CREATE POLICY "mc_files_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'managed-contract-files'
    AND public.staff_has_managed_contract_view_permission()
  );

DROP POLICY IF EXISTS "mc_files_insert" ON storage.objects;
CREATE POLICY "mc_files_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'managed-contract-files'
    AND public.staff_has_managed_contract_manage_permission()
  );

-- ========== SEED DEFAULT TEMPLATES ==========
INSERT INTO public.managed_contract_templates (organization_id, contract_type, title, body_text, special_clauses)
VALUES
  (NULL, 'kitchen_operation', 'Mutfak İşletme Sözleşmesi',
   E'TARAFLAR\n\n1. Taraf: [Taraf 1 — şirket / kişi adını girin]\n2. Taraf: [Taraf 2 — mutfak işletmecisi veya hizmet sağlayıcı]\n\nKONU\n\nİşbu sözleşme, mutfak ve yiyecek-içecek hizmetlerinin işletilmesine ilişkin hak ve yükümlülükleri düzenler.\n\nSÜRE\n\nBaşlangıç ve bitiş tarihleri sözleşme kaydında belirtilir.\n\nYÜKÜMLÜLÜKLER\n\n• Taraflar karşılıklı yükümlülüklerini yerine getirmeyi kabul eder.\n• Hijyen, gıda güvenliği ve işletme standartlarına uyulur.\n• Ödeme ve hasılat koşulları özel maddelerde belirtilir.\n\nFESİH\n\nTaraflardan biri yazılı bildirimle, sözleşmede belirtilen süreye uyarak feshedebilir.',
   E'• Günlük raporlama ve SGK yükümlülükleri taraflarca ayrıca tanımlanabilir.'),
  (NULL, 'staff_employment', 'Personel İş Sözleşmesi',
   E'TARAFLAR\n\n1. Taraf: [İşveren]\n2. Taraf: [Çalışan]\n\nİŞİN TANIMI\n\nÇalışan, görev tanımında belirtilen işleri yerine getirmeyi kabul eder.\n\nÇALIŞMA SÜRESİ VE ÜCRET\n\nÇalışma saatleri ve ücret koşulları bu metinde veya eklerde belirtilir.\n\nGİZLİLİK\n\nTaraflar, ticari ve kişisel bilgileri gizli tutmayı taahhüt eder.',
   NULL),
  (NULL, 'cleaning_service', 'Temizlik Hizmet Sözleşmesi',
   E'Temizlik hizmeti kapsamı, oda ve ortak alan temizliği, malzeme sorumluluğu ve kalite standartlarını içerir.',
   NULL),
  (NULL, 'supplier', 'Tedarikçi Sözleşmesi',
   E'Tedarik koşulları, teslimat süreleri, fiyatlandırma ve kalite garantisi bu sözleşmede düzenlenir.',
   NULL),
  (NULL, 'lease', 'Kira Sözleşmesi',
   E'Kiralanan alan, kira bedeli, ödeme takvimi ve tarafların yükümlülükleri bu sözleşmede belirtilir.',
   NULL),
  (NULL, 'subcontractor', 'Taşeron Sözleşmesi',
   E'Taşeron iş kapsamı, iş güvenliği, sigorta ve teslim süreleri bu sözleşmede düzenlenir.',
   NULL);

COMMIT;
