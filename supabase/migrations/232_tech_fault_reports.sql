-- Teknik varlık arıza / bildirim kayıtları (QR modülü tamamlayıcı)

BEGIN;

CREATE OR REPLACE FUNCTION public.staff_tech_module_reader_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (s.role = 'admin')
        OR (s.app_permissions->>'teknik_varliklar') IN ('true', 't', '1', 'True', 'TRUE')
        OR (s.app_permissions->>'teknik_varliklar_okuma') IN ('true', 't', '1', 'True', 'TRUE')
        OR (s.app_permissions->>'teknik_varlik_yonetimi') IN ('true', 't', '1', 'True', 'TRUE')
      FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND COALESCE(s.is_active, true) = true
        AND s.deleted_at IS NULL
      LIMIT 1
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.staff_tech_module_reader_allowed() IS
  'Teknik QR modülüne erişen personel (okuma veya arıza bildirimi için).';

CREATE TABLE IF NOT EXISTS public.tech_fault_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  asset_id uuid REFERENCES public.tech_assets(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  is_emergency boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'cancelled')),
  created_by_staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  assigned_to_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  resolved_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution_note text,
  photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tech_fault_reports_title_not_blank CHECK (length(trim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_tech_fault_reports_org_status_created
  ON public.tech_fault_reports (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tech_fault_reports_asset
  ON public.tech_fault_reports (asset_id);

DROP TRIGGER IF EXISTS trg_tech_fault_reports_updated ON public.tech_fault_reports;
CREATE TRIGGER trg_tech_fault_reports_updated
  BEFORE UPDATE ON public.tech_fault_reports
  FOR EACH ROW EXECUTE FUNCTION public.tech_touch_updated_at();

ALTER TABLE public.tech_fault_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tech_fault_reports_select_org_reader" ON public.tech_fault_reports;
CREATE POLICY "tech_fault_reports_select_org_reader" ON public.tech_fault_reports
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_tech_module_reader_allowed()
  );

DROP POLICY IF EXISTS "tech_fault_reports_insert_org_reader" ON public.tech_fault_reports;
CREATE POLICY "tech_fault_reports_insert_org_reader" ON public.tech_fault_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.staff_tech_module_reader_allowed()
    AND created_by_staff_id = public.current_staff_id()
  );

DROP POLICY IF EXISTS "tech_fault_reports_update_operate_or_manage" ON public.tech_fault_reports;
CREATE POLICY "tech_fault_reports_update_operate_or_manage" ON public.tech_fault_reports
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_tech_module_reader_allowed()
    AND (
      public.staff_tech_asset_manage_allowed()
      OR public.staff_tech_asset_operate_allowed()
      OR created_by_staff_id = public.current_staff_id()
    )
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.staff_tech_module_reader_allowed()
  );

REVOKE ALL ON FUNCTION public.staff_tech_module_reader_allowed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_tech_module_reader_allowed() TO authenticated;

COMMENT ON TABLE public.tech_fault_reports IS 'Teknik varlık / genel arıza bildirimi; acil bayrağı ve çözüm takibi.';

COMMIT;
