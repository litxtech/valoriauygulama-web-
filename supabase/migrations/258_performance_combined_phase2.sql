BEGIN;

-- ---------- Birleşik performans skoru + 70 altı resmi kayıt ----------
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS evaluation_management smallint
    CHECK (evaluation_management IS NULL OR (evaluation_management >= 0 AND evaluation_management <= 100)),
  ADD COLUMN IF NOT EXISTS evaluation_guest smallint
    CHECK (evaluation_guest IS NULL OR (evaluation_guest >= 0 AND evaluation_guest <= 100)),
  ADD COLUMN IF NOT EXISTS evaluation_combined smallint
    CHECK (evaluation_combined IS NULL OR (evaluation_combined >= 0 AND evaluation_combined <= 100)),
  ADD COLUMN IF NOT EXISTS evaluation_combined_updated_at timestamptz;

COMMENT ON COLUMN public.staff.evaluation_management IS 'Son yönetim değerlendirmesi (0–100).';
COMMENT ON COLUMN public.staff.evaluation_guest IS 'Misafir puanı türetilmiş (0–100).';
COMMENT ON COLUMN public.staff.evaluation_combined IS 'Ağırlıklı birleşik skor (0–100).';
COMMENT ON COLUMN public.staff.evaluation_score IS 'Gösterim skoru; birleşik skor ile senkron.';

CREATE TABLE IF NOT EXISTS public.organization_performance_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  weight_management smallint NOT NULL DEFAULT 50 CHECK (weight_management >= 0 AND weight_management <= 100),
  weight_audit smallint NOT NULL DEFAULT 35 CHECK (weight_audit >= 0 AND weight_audit <= 100),
  weight_guest smallint NOT NULL DEFAULT 15 CHECK (weight_guest >= 0 AND weight_guest <= 100),
  threshold_score smallint NOT NULL DEFAULT 70 CHECK (threshold_score >= 0 AND threshold_score <= 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_perf_weights_sum_100 CHECK (weight_management + weight_audit + weight_guest = 100)
);

INSERT INTO public.organization_performance_settings (organization_id)
SELECT o.id FROM public.organizations o
ON CONFLICT (organization_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.staff_performance_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  notice_type text NOT NULL CHECK (notice_type IN ('warning', 'termination_review')),
  threshold_score smallint NOT NULL DEFAULT 70,
  score_at_trigger smallint NOT NULL,
  message text NOT NULL,
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_perf_notices_staff
  ON public.staff_performance_notices (staff_id, created_at DESC);

-- Misafir skoru türet
CREATE OR REPLACE FUNCTION public.staff_guest_evaluation_score(p_staff_id uuid)
RETURNS smallint
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN s.average_rating IS NOT NULL AND s.average_rating > 0
      THEN LEAST(100, GREATEST(0, ROUND((s.average_rating::numeric / 5.0) * 100)::int))
    ELSE NULL
  END
  FROM public.staff s
  WHERE s.id = p_staff_id;
$$;

-- Birleşik skor yeniden hesapla
CREATE OR REPLACE FUNCTION public.recompute_staff_combined_score(p_staff_id uuid)
RETURNS smallint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_mgmt smallint;
  v_audit smallint;
  v_guest smallint;
  v_combined smallint;
  v_wm int;
  v_wa int;
  v_wg int;
  v_threshold int;
  v_parts int := 0;
  v_sum numeric := 0;
BEGIN
  SELECT organization_id INTO v_org FROM public.staff WHERE id = p_staff_id;
  IF v_org IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT s.evaluation_management, s.evaluation_audit, public.staff_guest_evaluation_score(p_staff_id)
  INTO v_mgmt, v_audit, v_guest
  FROM public.staff s
  WHERE s.id = p_staff_id;

  SELECT weight_management, weight_audit, weight_guest, threshold_score
  INTO v_wm, v_wa, v_wg, v_threshold
  FROM public.organization_performance_settings
  WHERE organization_id = v_org;

  IF NOT FOUND THEN
    v_wm := 50; v_wa := 35; v_wg := 15; v_threshold := 70;
  END IF;

  IF v_mgmt IS NOT NULL THEN
    v_sum := v_sum + v_mgmt * v_wm;
    v_parts := v_parts + v_wm;
  END IF;
  IF v_audit IS NOT NULL THEN
    v_sum := v_sum + v_audit * v_wa;
    v_parts := v_parts + v_wa;
  END IF;
  IF v_guest IS NOT NULL THEN
    v_sum := v_sum + v_guest * v_wg;
    v_parts := v_parts + v_wg;
  END IF;

  IF v_parts > 0 THEN
    v_combined := LEAST(100, GREATEST(0, ROUND(v_sum / v_parts)::int));
  ELSE
    v_combined := COALESCE(v_mgmt, v_audit, v_guest);
  END IF;

  UPDATE public.staff
  SET
    evaluation_guest = v_guest,
    evaluation_combined = v_combined,
    evaluation_combined_updated_at = CASE WHEN v_combined IS NULL THEN NULL ELSE now() END,
    evaluation_score = v_combined,
    updated_at = now()
  WHERE id = p_staff_id;

  IF v_combined IS NOT NULL AND v_combined < v_threshold THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.staff_performance_notices n
      WHERE n.staff_id = p_staff_id
        AND n.notice_type = 'termination_review'
        AND n.created_at >= (now() - interval '30 days')
    ) THEN
      INSERT INTO public.staff_performance_notices (
        organization_id, staff_id, notice_type, threshold_score, score_at_trigger, message, created_by_staff_id
      ) VALUES (
        v_org,
        p_staff_id,
        'termination_review',
        v_threshold,
        v_combined,
        'Birleşik performans puanınız ' || v_combined::text || ' olup kurumsal eşik (' || v_threshold::text
          || ') altındadır. İş ilişkisinin sonlandırılması değerlendirmesi yapılabilir; insan kaynakları / yönetim ile görüşünüz.',
        NULL
      );
    END IF;
  END IF;

  RETURN v_combined;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_staff_combined_score(uuid) TO authenticated;

-- Yönetim değerlendirmesi senkronu: management + combined
CREATE OR REPLACE FUNCTION public._sync_staff_eval_from_latest_mgmt(p_staff_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.staff_management_evaluations%ROWTYPE;
  v_avg NUMERIC;
  v_mgmt smallint;
BEGIN
  SELECT * INTO r
  FROM public.staff_management_evaluations
  WHERE staff_id = p_staff_id
  ORDER BY created_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    UPDATE public.staff
    SET
      evaluation_management = NULL,
      evaluation_discipline = NULL,
      evaluation_communication = NULL,
      evaluation_speed = NULL,
      evaluation_responsibility = NULL,
      evaluation_insight = NULL,
      updated_at = now()
    WHERE id = p_staff_id;
    PERFORM public.recompute_staff_combined_score(p_staff_id);
    RETURN;
  END IF;

  v_avg := r.overall_star_avg;
  v_mgmt := LEAST(100, GREATEST(0, ROUND(v_avg * 20)::INT));

  UPDATE public.staff
  SET
    evaluation_management = v_mgmt,
    evaluation_discipline = r.star_discipline * 20,
    evaluation_communication = r.star_communication * 20,
    evaluation_speed = r.star_job_skills * 20,
    evaluation_responsibility = LEAST(
      100,
      GREATEST(
        0,
        ROUND(((r.star_teamwork + r.star_initiative + r.star_rule_compliance)::numeric / 3.0) * 20)::INT
      )
    ),
    evaluation_insight = LEFT(NULLIF(BTRIM(r.manager_comment), ''), 500),
    updated_at = now()
  WHERE id = p_staff_id;

  PERFORM public.recompute_staff_combined_score(p_staff_id);
END;
$$;

-- Denetim senkronu: combined tetikle
CREATE OR REPLACE FUNCTION public.audit_sync_staff_evaluation(p_staff_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avg smallint;
BEGIN
  SELECT ROUND(AVG(s.session_score))::smallint
  INTO v_avg
  FROM public.staff_audit_ledger l
  JOIN public.audit_sessions s ON s.id = l.session_id
  WHERE l.staff_id = p_staff_id
    AND s.status = 'submitted'
    AND s.conducted_at >= (now() - interval '90 days');

  UPDATE public.staff
  SET
    evaluation_audit = v_avg,
    evaluation_audit_updated_at = CASE WHEN v_avg IS NULL THEN NULL ELSE now() END,
    updated_at = now()
  WHERE id = p_staff_id;

  PERFORM public.recompute_staff_combined_score(p_staff_id);
END;
$$;

-- Misafir yorumu güncellenince
CREATE OR REPLACE FUNCTION public.trg_staff_reviews_recompute_combined()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_staff_combined_score(NEW.staff_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_reviews_recompute_combined ON public.staff_reviews;
CREATE TRIGGER trg_staff_reviews_recompute_combined
  AFTER INSERT OR UPDATE ON public.staff_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_staff_reviews_recompute_combined();

-- Tüm personelde bir kez hesapla
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.staff WHERE deleted_at IS NULL LOOP
  BEGIN
    PERFORM public.recompute_staff_combined_score(r.id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  END LOOP;
END;
$$;

-- Personel performans panosu
CREATE OR REPLACE FUNCTION public.get_staff_performance_dashboard(p_staff_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_auth uuid;
  v_org uuid;
  v_row public.staff%ROWTYPE;
  v_weights record;
  v_notices jsonb;
  v_audit jsonb;
  v_leaderboard jsonb;
BEGIN
  v_auth := public.current_staff_id();
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_staff_id <> v_auth AND NOT public.staff_is_admin_active() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_row FROM public.staff WHERE id = p_staff_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'staff not found';
  END IF;
  v_org := v_row.organization_id;

  SELECT * INTO v_weights FROM public.organization_performance_settings WHERE organization_id = v_org;
  IF NOT FOUND THEN
    v_weights.weight_management := 50;
    v_weights.weight_audit := 35;
    v_weights.weight_guest := 15;
    v_weights.threshold_score := 70;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', n.id,
    'notice_type', n.notice_type,
    'message', n.message,
    'score_at_trigger', n.score_at_trigger,
    'threshold_score', n.threshold_score,
    'acknowledged_at', n.acknowledged_at,
    'created_at', n.created_at
  ) ORDER BY n.created_at DESC), '[]'::jsonb)
  INTO v_notices
  FROM public.staff_performance_notices n
  WHERE n.staff_id = p_staff_id;

  v_audit := public.get_staff_audit_summary(p_staff_id);
  v_leaderboard := public.get_audit_department_leaderboard(v_org, public.audit_month_key(now()));

  RETURN jsonb_build_object(
    'staff_id', p_staff_id,
    'full_name', v_row.full_name,
    'evaluation_management', v_row.evaluation_management,
    'evaluation_audit', v_row.evaluation_audit,
    'evaluation_guest', v_row.evaluation_guest,
    'evaluation_combined', v_row.evaluation_combined,
    'evaluation_combined_updated_at', v_row.evaluation_combined_updated_at,
    'threshold_score', v_weights.threshold_score,
    'weights', jsonb_build_object(
      'management', v_weights.weight_management,
      'audit', v_weights.weight_audit,
      'guest', v_weights.weight_guest
    ),
    'below_threshold', COALESCE(v_row.evaluation_combined, 100) < v_weights.threshold_score,
    'notices', v_notices,
    'audit_summary', v_audit,
    'department_leaderboard', v_leaderboard
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_performance_dashboard(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.acknowledge_staff_performance_notice(p_notice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
BEGIN
  v_staff_id := public.current_staff_id();
  UPDATE public.staff_performance_notices
  SET acknowledged_at = now()
  WHERE id = p_notice_id AND staff_id = v_staff_id AND acknowledged_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.acknowledge_staff_performance_notice(uuid) TO authenticated;

-- Aylık rapor verisi (PDF)
CREATE OR REPLACE FUNCTION public.get_audit_monthly_report_data(
  p_organization_id uuid,
  p_month_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_month text;
  v_org_name text;
  v_lb jsonb;
  v_sessions jsonb;
  v_below jsonb;
BEGIN
  IF NOT (
    public.staff_is_admin_active()
    OR p_organization_id = ANY (public.staff_org_ids_for_auth())
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_month := COALESCE(p_month_key, public.audit_month_key(now()));
  SELECT name INTO v_org_name FROM public.organizations WHERE id = p_organization_id;
  v_lb := public.get_audit_department_leaderboard(p_organization_id, v_month);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'conducted_at', s.conducted_at,
    'session_score', s.session_score,
    'category_name', c.name,
    'auditor_name', st.full_name
  ) ORDER BY s.conducted_at DESC), '[]'::jsonb)
  INTO v_sessions
  FROM public.audit_sessions s
  JOIN public.audit_categories c ON c.id = s.category_id
  LEFT JOIN public.staff st ON st.id = s.auditor_staff_id
  WHERE s.organization_id = p_organization_id
    AND s.status = 'submitted'
    AND s.month_key = v_month;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'full_name', s.full_name,
    'evaluation_combined', s.evaluation_combined,
    'evaluation_audit', s.evaluation_audit,
    'evaluation_management', s.evaluation_management
  ) ORDER BY s.evaluation_combined ASC NULLS LAST), '[]'::jsonb)
  INTO v_below
  FROM public.staff s
  JOIN public.organization_performance_settings ops ON ops.organization_id = s.organization_id
  WHERE s.organization_id = p_organization_id
    AND s.is_active = true
    AND s.deleted_at IS NULL
    AND s.evaluation_combined IS NOT NULL
    AND s.evaluation_combined < ops.threshold_score;

  RETURN jsonb_build_object(
    'organization_name', v_org_name,
    'month_key', v_month,
    'leaderboard', v_lb,
    'sessions', v_sessions,
    'below_threshold_staff', v_below,
    'generated_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_audit_monthly_report_data(uuid, text) TO authenticated;

-- RLS notices
ALTER TABLE public.staff_performance_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_performance_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_perf_notices_select ON public.staff_performance_notices;
CREATE POLICY staff_perf_notices_select ON public.staff_performance_notices
  FOR SELECT TO authenticated
  USING (
    staff_id = public.current_staff_id()
    OR (public.staff_is_admin_active() AND organization_id = ANY (public.staff_org_ids_for_auth()))
  );

DROP POLICY IF EXISTS staff_perf_notices_update_ack ON public.staff_performance_notices;
CREATE POLICY staff_perf_notices_update_ack ON public.staff_performance_notices
  FOR UPDATE TO authenticated
  USING (staff_id = public.current_staff_id())
  WITH CHECK (staff_id = public.current_staff_id());

DROP POLICY IF EXISTS org_perf_settings_select ON public.organization_performance_settings;
CREATE POLICY org_perf_settings_select ON public.organization_performance_settings
  FOR SELECT TO authenticated
  USING (organization_id = ANY (public.staff_org_ids_for_auth()));

DROP POLICY IF EXISTS org_perf_settings_admin ON public.organization_performance_settings;
CREATE POLICY org_perf_settings_admin ON public.organization_performance_settings
  FOR ALL TO authenticated
  USING (public.staff_is_admin_active() AND organization_id = ANY (public.staff_org_ids_for_auth()))
  WITH CHECK (public.staff_is_admin_active() AND organization_id = ANY (public.staff_org_ids_for_auth()));

COMMIT;
