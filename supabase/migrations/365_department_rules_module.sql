-- Valoria Bölüm Kuralları ve Talimat Yönetimi
BEGIN;

-- ========== HELPERS ==========
CREATE OR REPLACE FUNCTION public.staff_has_department_rules_manage_permission()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.current_user_is_staff_admin()
    OR public.staff_has_app_permission('bolum_kurallari_yonetim')
    OR public.staff_has_app_permission('super_admin');
$$;

CREATE OR REPLACE FUNCTION public.staff_has_department_rules_view_permission()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.staff_has_department_rules_manage_permission()
    OR public.staff_has_app_permission('bolum_kurallari')
    OR public.staff_has_app_permission('bolum_kurallari_duzenle');
$$;

CREATE OR REPLACE FUNCTION public.staff_department_rule_dept_matches(p_rule_dept text, p_staff_dept text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_rule text := lower(trim(coalesce(p_rule_dept, '')));
  v_staff text := lower(trim(coalesce(p_staff_dept, '')));
BEGIN
  IF v_rule IN ('', 'all_hotel', 'tum_otel') THEN
    RETURN true;
  END IF;
  IF v_staff = '' THEN
    RETURN false;
  END IF;
  IF v_rule = v_staff THEN
    RETURN true;
  END IF;
  -- Mutfak eşleşmeleri
  IF v_rule IN ('kitchen', 'mutfak') AND v_staff IN ('kitchen', 'mutfak', 'kitchen_staff', 'chef', 'head_chef', 'pastry') THEN
    RETURN true;
  END IF;
  -- Resepsiyon
  IF v_rule IN ('reception', 'resepsiyon') AND v_staff IN ('reception', 'resepsiyon', 'reception_chief', 'receptionist') THEN
    RETURN true;
  END IF;
  -- Kat hizmetleri
  IF v_rule IN ('housekeeping', 'kat_hizmetleri') AND v_staff IN ('housekeeping', 'kat_hizmetleri') THEN
    RETURN true;
  END IF;
  -- Teknik
  IF v_rule IN ('technical', 'teknik') AND v_staff IN ('technical', 'teknik') THEN
    RETURN true;
  END IF;
  -- Güvenlik
  IF v_rule IN ('security', 'guvenlik') AND v_staff IN ('security', 'guvenlik') THEN
    RETURN true;
  END IF;
  -- Muhasebe
  IF v_rule IN ('accounting', 'muhasebe') AND v_staff IN ('accounting', 'muhasebe') THEN
    RETURN true;
  END IF;
  -- Yönetim
  IF v_rule IN ('management', 'yonetim') AND v_staff IN ('management', 'yonetim', 'admin') THEN
    RETURN true;
  END IF;
  -- Depo
  IF v_rule IN ('warehouse', 'depo') AND v_staff IN ('warehouse', 'depo', 'stok') THEN
    RETURN true;
  END IF;
  -- Restoran
  IF v_rule IN ('restaurant', 'restoran') AND v_staff IN ('restaurant', 'restoran') THEN
    RETURN true;
  END IF;
  -- Bahçe
  IF v_rule IN ('outdoor', 'bahce') AND v_staff IN ('outdoor', 'bahce', 'garden') THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_can_view_department_rule(p_rule_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_org_id uuid;
  v_dept text;
  v_role text;
  v_rule record;
BEGIN
  SELECT s.id, s.organization_id, s.department, s.role
  INTO v_staff_id, v_org_id, v_dept, v_role
  FROM public.staff s
  WHERE s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL
  LIMIT 1;

  IF v_staff_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT r.* INTO v_rule
  FROM public.department_rules r
  WHERE r.id = p_rule_id AND r.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF public.staff_has_app_permission('super_admin') THEN
    RETURN true;
  END IF;

  IF v_rule.organization_id IS DISTINCT FROM v_org_id THEN
    RETURN false;
  END IF;

  IF public.staff_has_department_rules_manage_permission() THEN
    RETURN true;
  END IF;

  IF v_rule.status NOT IN ('published', 'expired', 'archived') THEN
    RETURN false;
  END IF;

  -- Belirli personele gönderilmiş
  IF v_rule.target_staff_ids IS NOT NULL AND cardinality(v_rule.target_staff_ids) > 0 THEN
    IF v_staff_id = ANY(v_rule.target_staff_ids) THEN
      RETURN true;
    END IF;
    IF v_rule.publish_scope = 'staff' THEN
      RETURN false;
    END IF;
  END IF;

  -- Departman hedefi
  IF v_rule.publish_scope = 'departments' OR v_rule.publish_scope = 'all' OR v_rule.publish_scope IS NULL THEN
    IF public.staff_department_rule_dept_matches(v_rule.department, v_dept) THEN
      IF v_rule.visible_roles IS NULL OR cardinality(v_rule.visible_roles) = 0 OR v_role = ANY(v_rule.visible_roles) THEN
        RETURN true;
      END IF;
    END IF;
    IF v_rule.target_departments IS NOT NULL AND cardinality(v_rule.target_departments) > 0 THEN
      IF EXISTS (
        SELECT 1 FROM unnest(v_rule.target_departments) AS td(dept)
        WHERE public.staff_department_rule_dept_matches(td.dept, v_dept)
      ) THEN
        IF v_rule.visible_roles IS NULL OR cardinality(v_rule.visible_roles) = 0 OR v_role = ANY(v_rule.visible_roles) THEN
          RETURN true;
        END IF;
      END IF;
    END IF;
  END IF;

  IF public.staff_has_app_permission('bolum_kurallari') OR public.staff_has_app_permission('bolum_kurallari_duzenle') THEN
    RETURN public.staff_department_rule_dept_matches(v_rule.department, v_dept);
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.next_department_rule_document_number(p_org_id uuid)
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
      WHEN document_number ~ ('^BK-' || v_year::text || '-[0-9]+$')
      THEN substring(document_number FROM '[0-9]+$')::int
      ELSE 0
    END
  ), 0) + 1
  INTO v_seq
  FROM public.department_rules
  WHERE organization_id = p_org_id;

  RETURN 'BK-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_department_rule_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule record;
  v_latest_version int;
  v_creator text;
BEGIN
  SELECT r.*, s.full_name AS creator_name
  INTO v_rule
  FROM public.department_rules r
  LEFT JOIN public.staff s ON s.id = r.created_by
  WHERE r.verification_token::text = p_token AND r.deleted_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Belge bulunamadı');
  END IF;

  SELECT max(version) INTO v_latest_version
  FROM public.department_rules
  WHERE (parent_rule_id = coalesce(v_rule.parent_rule_id, v_rule.id) OR id = coalesce(v_rule.parent_rule_id, v_rule.id))
    AND deleted_at IS NULL;

  RETURN jsonb_build_object(
    'valid', true,
    'document_number', v_rule.document_number,
    'title', v_rule.title,
    'department', v_rule.department,
    'status', v_rule.status,
    'version', v_rule.version,
    'is_latest_version', v_rule.version = v_latest_version,
    'is_active', v_rule.status = 'published',
    'created_by', v_rule.creator_name,
    'created_at', v_rule.created_at,
    'published_at', v_rule.published_at,
    'start_date', v_rule.start_date,
    'end_date', v_rule.end_date
  );
END;
$$;

-- ========== TABLES ==========
CREATE TABLE IF NOT EXISTS public.department_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  document_number text NOT NULL,
  verification_token uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  department text NOT NULL,
  rule_type text NOT NULL CHECK (rule_type IN (
    'general', 'daily_instruction', 'opening', 'closing', 'cleaning_procedure',
    'emergency', 'hygiene', 'security', 'guest_relations', 'discipline',
    'stock_usage', 'kitchen_operation', 'other'
  )),
  content text NOT NULL DEFAULT '',
  start_date date,
  end_date date,
  start_time time,
  end_time time,
  is_permanent boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'published', 'scheduled', 'expired', 'archived', 'cancelled'
  )),
  requires_acknowledgement boolean NOT NULL DEFAULT false,
  is_printable boolean NOT NULL DEFAULT true,
  generate_pdf boolean NOT NULL DEFAULT true,
  send_notification boolean NOT NULL DEFAULT true,
  visible_roles text[] NOT NULL DEFAULT '{}',
  target_departments text[] NOT NULL DEFAULT '{}',
  target_staff_ids uuid[] NOT NULL DEFAULT '{}',
  publish_scope text NOT NULL DEFAULT 'departments' CHECK (publish_scope IN ('all', 'departments', 'staff')),
  scheduled_publish_at timestamptz,
  published_at timestamptz,
  notify_reminder_sent_at timestamptz,
  created_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  version int NOT NULL DEFAULT 1,
  parent_rule_id uuid REFERENCES public.department_rules(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, document_number, version)
);

CREATE INDEX IF NOT EXISTS idx_department_rules_org_status ON public.department_rules(organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_department_rules_org_dept ON public.department_rules(organization_id, department) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_department_rules_parent ON public.department_rules(parent_rule_id) WHERE parent_rule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_department_rules_verify ON public.department_rules(verification_token);

CREATE TABLE IF NOT EXISTS public.department_rule_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.department_rules(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  read_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_version int,
  ip_address text,
  device_info text,
  status text NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'acknowledged')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rule_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_department_rule_reads_rule ON public.department_rule_reads(rule_id);
CREATE INDEX IF NOT EXISTS idx_department_rule_reads_user ON public.department_rule_reads(user_id);

CREATE TABLE IF NOT EXISTS public.department_rule_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.department_rules(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  uploaded_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_department_rule_attachments_rule ON public.department_rule_attachments(rule_id);

-- ========== RLS ==========
ALTER TABLE public.department_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_rule_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_rule_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY department_rules_select ON public.department_rules
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.staff_has_department_rules_manage_permission()
      OR public.staff_can_view_department_rule(id)
    )
  );

CREATE POLICY department_rules_insert ON public.department_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    public.staff_has_department_rules_manage_permission()
    OR (
      public.staff_has_app_permission('bolum_kurallari_duzenle')
      AND public.staff_department_rule_dept_matches(department, (
        SELECT department FROM public.staff WHERE auth_id = auth.uid() AND is_active = true LIMIT 1
      ))
    )
  );

CREATE POLICY department_rules_update ON public.department_rules
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.staff_has_department_rules_manage_permission()
      OR (
        public.staff_has_app_permission('bolum_kurallari_duzenle')
        AND public.staff_department_rule_dept_matches(department, (
          SELECT department FROM public.staff WHERE auth_id = auth.uid() AND is_active = true LIMIT 1
        ))
      )
    )
  );

CREATE POLICY department_rule_reads_select ON public.department_rule_reads
  FOR SELECT TO authenticated
  USING (
    public.staff_has_department_rules_manage_permission()
    OR user_id = (SELECT id FROM public.staff WHERE auth_id = auth.uid() AND is_active = true LIMIT 1)
  );

CREATE POLICY department_rule_reads_insert ON public.department_rule_reads
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT id FROM public.staff WHERE auth_id = auth.uid() AND is_active = true LIMIT 1)
    AND public.staff_can_view_department_rule(rule_id)
  );

CREATE POLICY department_rule_reads_update ON public.department_rule_reads
  FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT id FROM public.staff WHERE auth_id = auth.uid() AND is_active = true LIMIT 1)
    OR public.staff_has_department_rules_manage_permission()
  );

CREATE POLICY department_rule_attachments_select ON public.department_rule_attachments
  FOR SELECT TO authenticated
  USING (public.staff_can_view_department_rule(rule_id));

CREATE POLICY department_rule_attachments_insert ON public.department_rule_attachments
  FOR INSERT TO authenticated
  WITH CHECK (public.staff_has_department_rules_manage_permission());

CREATE POLICY department_rule_attachments_delete ON public.department_rule_attachments
  FOR DELETE TO authenticated
  USING (public.staff_has_department_rules_manage_permission());

-- ========== GRANTS ==========
GRANT SELECT, INSERT, UPDATE ON public.department_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.department_rule_reads TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.department_rule_attachments TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_department_rule_document_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_department_rule_token(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.staff_can_view_department_rule(uuid) TO authenticated;

COMMIT;
