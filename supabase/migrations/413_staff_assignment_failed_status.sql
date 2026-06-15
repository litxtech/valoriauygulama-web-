-- Görev: yapılamadı (failed) durumu + otel içi tüm görevleri görme (SELECT)

ALTER TABLE public.staff_assignments
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

ALTER TABLE public.staff_assignments DROP CONSTRAINT IF EXISTS staff_assignments_status_check;

ALTER TABLE public.staff_assignments
  ADD CONSTRAINT staff_assignments_status_check
  CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled', 'failed'));

COMMENT ON COLUMN public.staff_assignments.failure_reason IS 'Personel "yapamadım" seçtiğinde zorunlu açıklama';
COMMENT ON COLUMN public.staff_assignments.failed_at IS 'Yapılamadı işaretlendiği zaman';

DROP POLICY IF EXISTS "staff_assignments_select" ON public.staff_assignments;

CREATE POLICY "staff_assignments_select" ON public.staff_assignments
  FOR SELECT TO authenticated
  USING (
    assigned_staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.staff WHERE auth_id = auth.uid() AND role = 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.staff viewer
      INNER JOIN public.staff assignee ON assignee.id = staff_assignments.assigned_staff_id
      WHERE viewer.auth_id = auth.uid()
        AND viewer.organization_id IS NOT NULL
        AND viewer.organization_id = assignee.organization_id
    )
  );
