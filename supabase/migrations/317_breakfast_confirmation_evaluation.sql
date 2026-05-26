-- Kahvaltı teyit değerlendirme: uygun/uygun değil + puan sistemi + mutfak genel puanı

BEGIN;

-- ========== breakfast_confirmations tablosuna değerlendirme alanları ekle ==========

ALTER TABLE public.breakfast_confirmations
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS rejection_score_impact smallint;

COMMENT ON COLUMN public.breakfast_confirmations.rejected_at IS 'Kahvaltı uygun görülmediğinde ret tarihi';
COMMENT ON COLUMN public.breakfast_confirmations.rejected_by_staff_id IS 'Ret veren yetkili personel';
COMMENT ON COLUMN public.breakfast_confirmations.rejection_reason IS 'Ret nedeni (zorunlu not)';
COMMENT ON COLUMN public.breakfast_confirmations.rejection_score_impact IS 'Puan etkisi (negatif, ör. -5)';

-- ========== Mutfak genel puan tablosu ==========

CREATE TABLE IF NOT EXISTS public.kitchen_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  record_date date NOT NULL,
  breakfast_confirmation_id uuid REFERENCES public.breakfast_confirmations(id) ON DELETE SET NULL,
  score_delta smallint NOT NULL DEFAULT 0,
  reason text,
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kitchen_scores_org_date_idx
  ON public.kitchen_scores (organization_id, record_date DESC);

CREATE INDEX IF NOT EXISTS kitchen_scores_org_idx
  ON public.kitchen_scores (organization_id);

COMMENT ON TABLE public.kitchen_scores IS 'Mutfak puan hareketleri — kahvaltı değerlendirme ve diğer kaynaklardan';

-- ========== Mutfak genel puan özet view ==========

CREATE OR REPLACE VIEW public.kitchen_score_summary AS
SELECT
  organization_id,
  COALESCE(SUM(score_delta), 0)::int AS total_score,
  COUNT(*) FILTER (WHERE score_delta < 0)::int AS negative_count,
  COUNT(*) FILTER (WHERE score_delta > 0)::int AS positive_count,
  COUNT(*)::int AS total_entries
FROM public.kitchen_scores
GROUP BY organization_id;

COMMENT ON VIEW public.kitchen_score_summary IS 'Her işletme için mutfak genel puan özeti';

-- ========== Aylık mutfak puan özet view ==========

CREATE OR REPLACE VIEW public.kitchen_score_monthly AS
SELECT
  organization_id,
  date_trunc('month', record_date)::date AS month,
  COALESCE(SUM(score_delta), 0)::int AS month_score,
  COUNT(*) FILTER (WHERE score_delta < 0)::int AS negative_count,
  COUNT(*) FILTER (WHERE score_delta > 0)::int AS positive_count
FROM public.kitchen_scores
GROUP BY organization_id, date_trunc('month', record_date);

-- ========== RLS ==========

ALTER TABLE public.kitchen_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kitchen_scores_select" ON public.kitchen_scores;
CREATE POLICY "kitchen_scores_select"
  ON public.kitchen_scores FOR SELECT TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
  );

DROP POLICY IF EXISTS "kitchen_scores_insert" ON public.kitchen_scores;
CREATE POLICY "kitchen_scores_insert"
  ON public.kitchen_scores FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND (
      public.current_user_is_staff_admin()
      OR public.staff_has_app_permission('kahvalti_teyit_onayla')
    )
  );

DROP POLICY IF EXISTS "kitchen_scores_delete_admin" ON public.kitchen_scores;
CREATE POLICY "kitchen_scores_delete_admin"
  ON public.kitchen_scores FOR DELETE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.current_user_is_staff_admin()
  );

GRANT SELECT, INSERT, DELETE ON public.kitchen_scores TO authenticated;
GRANT SELECT ON public.kitchen_score_summary TO authenticated;
GRANT SELECT ON public.kitchen_score_monthly TO authenticated;

COMMIT;
