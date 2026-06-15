-- Tutanak PDF: RLS / audit trigger kaynakli guncelleme hatalarini gider

BEGIN;

-- Audit trigger RLS'e takilmasin (216 uygulanmamis ortamlarda da calisir)
CREATE OR REPLACE FUNCTION public.incident_reports_audit_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_staff_id uuid;
BEGIN
  v_actor_staff_id := public.current_staff_id();

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.incident_report_audit_log (
      organization_id, report_id, event_type, event_payload, actor_staff_id
    )
    VALUES (
      NEW.organization_id,
      NEW.id,
      'created',
      jsonb_build_object('status', NEW.status, 'report_no', NEW.report_no),
      v_actor_staff_id
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.incident_report_audit_log (
      organization_id, report_id, event_type, event_payload, actor_staff_id
    )
    VALUES (
      NEW.organization_id,
      NEW.id,
      CASE
        WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'status_changed'
        WHEN NEW.pdf_file_path IS DISTINCT FROM OLD.pdf_file_path THEN 'pdf_generated'
        ELSE 'updated'
      END,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'pdf_file_path', NEW.pdf_file_path,
        'changed_at', now()
      ),
      v_actor_staff_id
    );
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

-- PDF olusturma: istemci UPDATE yerine guvenli RPC
CREATE OR REPLACE FUNCTION public.mark_incident_report_pdf_generated(
  p_report_id uuid,
  p_file_path text
)
RETURNS TABLE (
  id uuid,
  status text,
  pdf_file_path text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_org_id uuid;
BEGIN
  IF NOT public.staff_has_incident_reports_permission() THEN
    RAISE EXCEPTION 'Tutanak modulu icin yetkiniz yok';
  END IF;

  v_staff_id := public.current_staff_id();
  v_org_id := public.current_staff_organization_id();

  IF v_staff_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Aktif personel kaydi bulunamadi';
  END IF;

  IF p_file_path IS NULL OR length(trim(p_file_path)) = 0 THEN
    RAISE EXCEPTION 'PDF dosya yolu gerekli';
  END IF;

  RETURN QUERY
  UPDATE public.incident_reports r
  SET
    status = 'pdf_generated',
    pdf_file_path = trim(p_file_path),
    pdf_generated_by_staff_id = v_staff_id,
    pdf_generated_at = now()
  WHERE r.id = p_report_id
    AND r.organization_id = v_org_id
  RETURNING r.id, r.status, r.pdf_file_path;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tutanak bulunamadi veya erisim reddedildi';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_incident_report_pdf_generated(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_incident_report_pdf_generated(uuid, text) TO authenticated;

-- 366 uygulanmamis ortamlar: ilgili personel tablosu + RLS
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

-- Bildirim gonderildiginde notified_at guncellemesi (onayli/pdf durumlarinda da)
DROP POLICY IF EXISTS "incident_report_recipients_notify_update" ON public.incident_report_recipients;
CREATE POLICY "incident_report_recipients_notify_update"
  ON public.incident_report_recipients FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_has_incident_reports_permission()
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.staff_has_incident_reports_permission()
  );

-- Taslaktan PDF: onay zorunlulugu kaldirilmis olmali (366 yedegi)
ALTER TABLE public.incident_reports
  DROP CONSTRAINT IF EXISTS incident_reports_approval_fields_consistent;

ALTER TABLE public.incident_reports
  ADD CONSTRAINT incident_reports_approval_fields_consistent CHECK (
    (status IN ('approved', 'archived') AND approved_at IS NOT NULL)
    OR (status NOT IN ('approved', 'archived'))
  );

COMMIT;
