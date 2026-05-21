-- Kişiye özel duyuru panosu (görev ataması vb.): sadece target_staff_id eşleşen personel görür

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS target_staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS staff_assignment_id UUID REFERENCES public.staff_assignments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_announcements_target_staff
  ON public.announcements(target_staff_id)
  WHERE target_staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_announcements_staff_assignment
  ON public.announcements(staff_assignment_id)
  WHERE staff_assignment_id IS NOT NULL;

DROP POLICY IF EXISTS "announcements_staff_read" ON public.announcements;
CREATE POLICY "announcements_staff_read" ON public.announcements
  FOR SELECT TO authenticated
  USING (
    target_staff_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = announcements.target_staff_id AND s.auth_id = auth.uid()
    )
  );
