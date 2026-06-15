BEGIN;

-- Otel eşyaları kullanımı (tesis_gunlugu): yayınlanmış tüm kayıtları org içinde görüntüleme.
-- Admin / oluşturan / erişim listesi kuralları aynı kalır.

CREATE OR REPLACE FUNCTION public.facility_journal_can_view_record(p_record_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.facility_journal_records r
    INNER JOIN public.facility_journal_current_staff() cs ON cs.organization_id = r.organization_id
    WHERE r.id = p_record_id
      AND (
        EXISTS (SELECT 1 FROM public.admin_auth_ids a WHERE a.auth_id = auth.uid())
        OR r.created_by_staff_id = cs.staff_id
        OR EXISTS (
          SELECT 1
          FROM public.facility_journal_record_access a
          WHERE a.record_id = r.id
            AND a.staff_id = cs.staff_id
            AND a.can_view = true
        )
        OR (
          r.status = 'published'
          AND public.staff_has_facility_journal_permission()
        )
      )
  );
$$;

COMMENT ON FUNCTION public.facility_journal_can_view_record(uuid) IS
  'Otel eşyaları kullanımı: admin, oluşturan, erişim listesi veya tesis_gunlugu ile yayınlanmış kayıtlar';

COMMIT;
