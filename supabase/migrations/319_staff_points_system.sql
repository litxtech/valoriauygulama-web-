-- Genel amaçlı personel puan sistemi
-- Admin dilediği zaman, dilediği nedenle personele puan verebilir/çıkarabilir.
-- Kategori bazlı: görev, kahvaltı, genel, ödül, ceza vs.

BEGIN;

CREATE TABLE IF NOT EXISTS public.staff_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  points smallint NOT NULL,
  category text NOT NULL DEFAULT 'general',
  reason text,
  reference_type text,
  reference_id uuid,
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.staff_points IS 'Genel amaçlı personel puan defteri — admin tarafından verilen/çıkarılan puanlar';
COMMENT ON COLUMN public.staff_points.category IS 'Puan kategorisi: general, task, breakfast, reward, penalty';
COMMENT ON COLUMN public.staff_points.reference_type IS 'İlişkili kaynak tipi: staff_assignment, breakfast_confirmation, vb.';
COMMENT ON COLUMN public.staff_points.reference_id IS 'İlişkili kaydın UUID si';

CREATE INDEX IF NOT EXISTS staff_points_org_staff_idx
  ON public.staff_points (organization_id, staff_id, created_at DESC);

CREATE INDEX IF NOT EXISTS staff_points_staff_idx
  ON public.staff_points (staff_id, created_at DESC);

-- Personel bazlı puan özeti
CREATE OR REPLACE VIEW public.staff_points_summary AS
SELECT
  organization_id,
  staff_id,
  COALESCE(SUM(points), 0)::int AS total_points,
  COUNT(*) FILTER (WHERE points > 0)::int AS positive_count,
  COUNT(*) FILTER (WHERE points < 0)::int AS negative_count,
  COUNT(*)::int AS total_entries
FROM public.staff_points
GROUP BY organization_id, staff_id;

COMMENT ON VIEW public.staff_points_summary IS 'Personel bazlı toplam puan özeti';

-- Aylık puan özeti
CREATE OR REPLACE VIEW public.staff_points_monthly AS
SELECT
  organization_id,
  staff_id,
  date_trunc('month', created_at)::date AS month,
  COALESCE(SUM(points), 0)::int AS month_points,
  COUNT(*) FILTER (WHERE points > 0)::int AS positive_count,
  COUNT(*) FILTER (WHERE points < 0)::int AS negative_count
FROM public.staff_points
GROUP BY organization_id, staff_id, date_trunc('month', created_at);

-- RLS
ALTER TABLE public.staff_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_points_select" ON public.staff_points;
CREATE POLICY "staff_points_select"
  ON public.staff_points FOR SELECT TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
  );

DROP POLICY IF EXISTS "staff_points_insert" ON public.staff_points;
CREATE POLICY "staff_points_insert"
  ON public.staff_points FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.current_user_is_staff_admin()
  );

DROP POLICY IF EXISTS "staff_points_delete_admin" ON public.staff_points;
CREATE POLICY "staff_points_delete_admin"
  ON public.staff_points FOR DELETE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.current_user_is_staff_admin()
  );

GRANT SELECT, INSERT, DELETE ON public.staff_points TO authenticated;
GRANT SELECT ON public.staff_points_summary TO authenticated;
GRANT SELECT ON public.staff_points_monthly TO authenticated;

COMMIT;
