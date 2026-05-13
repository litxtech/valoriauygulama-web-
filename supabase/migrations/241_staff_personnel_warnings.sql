-- Yönetici → personel resmi uyarı kaydı (ciddiyet seviyesi, okundu onayı)

BEGIN;

-- Bu bildirim türü kapatılamaz (tercih filtresi)
CREATE OR REPLACE FUNCTION public.filter_staff_notification_recipients(
  p_staff_ids uuid[],
  p_notification_type text
)
RETURNS TABLE(staff_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text := lower(coalesce(trim(p_notification_type), ''));
BEGIN
  IF p_staff_ids IS NULL OR array_length(p_staff_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF v_type IN ('message', 'admin_announcement', 'staff_personnel_warning') THEN
    RETURN QUERY
    SELECT s.id
    FROM public.staff s
    WHERE s.id = ANY (p_staff_ids);
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.id
  FROM public.staff s
  LEFT JOIN public.notification_preferences np
    ON np.staff_id = s.id
   AND np.pref_key = 'staff_notif_' || v_type
  WHERE s.id = ANY (p_staff_ids)
    AND coalesce(np.enabled, true);
END;
$$;

COMMENT ON FUNCTION public.filter_staff_notification_recipients(uuid[], text) IS
  'Personel alıcı listesini tercihe göre filtreler; message, admin_announcement ve staff_personnel_warning daima açıktır.';

CREATE TABLE IF NOT EXISTS public.staff_personnel_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subject_staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  issued_by_staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  severity text NOT NULL CHECK (severity IN ('reminder', 'verbal', 'written', 'severe', 'final')),
  subject_line text,
  body text NOT NULL,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_personnel_warnings_body_not_blank CHECK (length(trim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_staff_personnel_warnings_subject_ack
  ON public.staff_personnel_warnings (subject_staff_id, acknowledged_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_staff_personnel_warnings_org_created
  ON public.staff_personnel_warnings (organization_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.staff_personnel_warnings_validate_org()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.id = NEW.subject_staff_id
      AND s.organization_id = NEW.organization_id
      AND s.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'staff_personnel_warnings: subject organization mismatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_personnel_warnings_validate ON public.staff_personnel_warnings;
CREATE TRIGGER trg_staff_personnel_warnings_validate
  BEFORE INSERT OR UPDATE ON public.staff_personnel_warnings
  FOR EACH ROW EXECUTE FUNCTION public.staff_personnel_warnings_validate_org();

ALTER TABLE public.staff_personnel_warnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_personnel_warnings_select" ON public.staff_personnel_warnings;
CREATE POLICY "staff_personnel_warnings_select"
  ON public.staff_personnel_warnings FOR SELECT TO authenticated
  USING (
    subject_staff_id = public.current_staff_id()
    OR (
      public.current_user_is_staff_admin()
      AND organization_id = public.current_staff_organization_id()
    )
  );

DROP POLICY IF EXISTS "staff_personnel_warnings_insert_admin" ON public.staff_personnel_warnings;
CREATE POLICY "staff_personnel_warnings_insert_admin"
  ON public.staff_personnel_warnings FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_staff_admin()
    AND organization_id = public.current_staff_organization_id()
    AND issued_by_staff_id = public.current_staff_id()
    AND EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.id = subject_staff_id
        AND s.organization_id = public.current_staff_organization_id()
        AND s.deleted_at IS NULL
    )
  );

CREATE OR REPLACE FUNCTION public.acknowledge_staff_personnel_warning(p_warning_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  UPDATE public.staff_personnel_warnings
  SET acknowledged_at = now()
  WHERE id = p_warning_id
    AND subject_staff_id = public.current_staff_id()
    AND acknowledged_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.acknowledge_staff_personnel_warning(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_staff_personnel_warning(uuid) TO authenticated;

COMMENT ON TABLE public.staff_personnel_warnings IS 'Yöneticinin personele verdiği resmi uyarı (şiddet seviyesi + metin + okundu onayı).';

GRANT SELECT, INSERT ON public.staff_personnel_warnings TO authenticated;

COMMIT;
