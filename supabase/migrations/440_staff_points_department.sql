-- Personel puan kaydına bölüm etiketi (hangi bölüm adına puanlandı).

BEGIN;

ALTER TABLE public.staff_points
  ADD COLUMN IF NOT EXISTS department text;

COMMENT ON COLUMN public.staff_points.department IS
  'Puanın ilişkilendirildiği bölüm (ör. kitchen, receptionist). Boşsa genel kabul edilir.';

CREATE INDEX IF NOT EXISTS staff_points_org_dept_idx
  ON public.staff_points (organization_id, department, created_at DESC)
  WHERE department IS NOT NULL;

COMMIT;
