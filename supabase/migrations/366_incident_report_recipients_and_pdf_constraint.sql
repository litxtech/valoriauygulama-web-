-- Tutanak: PDF olusturma kisiti + ilgili personel alicilari

BEGIN;

ALTER TABLE public.incident_reports
  DROP CONSTRAINT IF EXISTS incident_reports_approval_fields_consistent;

ALTER TABLE public.incident_reports
  ADD CONSTRAINT incident_reports_approval_fields_consistent CHECK (
    (status IN ('approved', 'archived') AND approved_at IS NOT NULL)
    OR (status NOT IN ('approved', 'archived'))
  );

CREATE TABLE IF NOT EXISTS public.incident_report_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  report_id uuid NOT NULL REFERENCES public.incident_reports(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  notified_at timestamptz,
  created_by_staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incident_report_recipients_report_staff_uniq UNIQUE (report_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_incident_report_recipients_report
  ON public.incident_report_recipients (report_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_incident_report_recipients_staff
  ON public.incident_report_recipients (staff_id, created_at DESC);

ALTER TABLE public.incident_report_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "incident_report_recipients_select_staff" ON public.incident_report_recipients;
CREATE POLICY "incident_report_recipients_select_staff"
  ON public.incident_report_recipients FOR SELECT TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_has_incident_reports_permission()
  );

DROP POLICY IF EXISTS "incident_report_recipients_modify_staff" ON public.incident_report_recipients;
CREATE POLICY "incident_report_recipients_modify_staff"
  ON public.incident_report_recipients FOR ALL TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_has_incident_reports_permission()
    AND EXISTS (
      SELECT 1
      FROM public.incident_reports r
      WHERE r.id = incident_report_recipients.report_id
        AND r.organization_id = public.current_staff_organization_id()
        AND r.status IN ('draft', 'pending_admin_approval', 'revision_requested')
    )
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.staff_has_incident_reports_permission()
    AND EXISTS (
      SELECT 1
      FROM public.incident_reports r
      WHERE r.id = incident_report_recipients.report_id
        AND r.organization_id = public.current_staff_organization_id()
        AND r.status IN ('draft', 'pending_admin_approval', 'revision_requested')
    )
  );

COMMIT;
