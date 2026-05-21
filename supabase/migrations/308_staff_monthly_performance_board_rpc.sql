-- Ayın en iyi personeli / kurumsal performans panosu: personel sıralaması, puan kaynakları, ödüller.

CREATE OR REPLACE FUNCTION public.get_organization_staff_performance_board(
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
  v_weights record;
  v_staff jsonb;
  v_winner jsonb;
BEGIN
  IF NOT (
    public.staff_is_admin_active()
    OR p_organization_id = ANY (public.staff_org_ids_for_auth())
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_month := COALESCE(p_month_key, public.audit_month_key(now()));

  SELECT weight_management, weight_audit, weight_guest, threshold_score
  INTO v_weights
  FROM public.organization_performance_settings
  WHERE organization_id = p_organization_id;

  IF NOT FOUND THEN
    v_weights.weight_management := 50;
    v_weights.weight_audit := 35;
    v_weights.weight_guest := 15;
    v_weights.threshold_score := 70;
  END IF;

  WITH base AS (
    SELECT
      s.id AS staff_id,
      s.full_name,
      s.department,
      s.profile_image,
      s.achievements,
      s.average_rating,
      s.evaluation_management,
      s.evaluation_audit,
      s.evaluation_guest,
      s.evaluation_combined,
      s.evaluation_combined_updated_at
    FROM public.staff s
    WHERE s.organization_id = p_organization_id
      AND s.deleted_at IS NULL
      AND s.is_active = true
  ),
  month_audit AS (
    SELECT
      l.staff_id,
      COUNT(*)::int AS audit_count,
      ROUND(AVG(l.session_score))::int AS month_audit_avg,
      COALESCE(SUM(l.delta_points), 0)::int AS audit_delta_sum
    FROM public.staff_audit_ledger l
    WHERE l.organization_id = p_organization_id
      AND l.month_key = v_month
    GROUP BY l.staff_id
  ),
  ranked AS (
    SELECT
      b.*,
      COALESCE(ma.audit_count, 0) AS audit_count_month,
      ma.month_audit_avg,
      COALESCE(ma.audit_delta_sum, 0) AS audit_delta_sum,
      ROW_NUMBER() OVER (
        ORDER BY b.evaluation_combined DESC NULLS LAST, b.full_name ASC NULLS LAST
      ) AS rn
    FROM base b
    LEFT JOIN month_audit ma ON ma.staff_id = b.staff_id
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'staff_id', r.staff_id,
        'full_name', r.full_name,
        'department', r.department,
        'profile_image', r.profile_image,
        'achievements', COALESCE(r.achievements, ARRAY[]::text[]),
        'average_rating', r.average_rating,
        'evaluation_management', r.evaluation_management,
        'evaluation_audit', r.evaluation_audit,
        'evaluation_guest', r.evaluation_guest,
        'evaluation_combined', r.evaluation_combined,
        'evaluation_combined_updated_at', r.evaluation_combined_updated_at,
        'rank', r.rn::int,
        'audit_count_month', r.audit_count_month,
        'month_audit_avg', r.month_audit_avg,
        'audit_delta_sum', r.audit_delta_sum,
        'weighted_management', CASE
          WHEN r.evaluation_management IS NOT NULL
            THEN ROUND(r.evaluation_management::numeric * v_weights.weight_management / 100.0, 1)
          ELSE NULL
        END,
        'weighted_audit', CASE
          WHEN r.evaluation_audit IS NOT NULL
            THEN ROUND(r.evaluation_audit::numeric * v_weights.weight_audit / 100.0, 1)
          ELSE NULL
        END,
        'weighted_guest', CASE
          WHEN r.evaluation_guest IS NOT NULL
            THEN ROUND(r.evaluation_guest::numeric * v_weights.weight_guest / 100.0, 1)
          ELSE NULL
        END
      )
      ORDER BY r.rn
    ),
    '[]'::jsonb
  )
  INTO v_staff
  FROM ranked r;

  SELECT elem
  INTO v_winner
  FROM jsonb_array_elements(v_staff) elem
  WHERE (elem->>'rank')::int = 1
  LIMIT 1;

  RETURN jsonb_build_object(
    'month_key', v_month,
    'organization_id', p_organization_id,
    'weights', jsonb_build_object(
      'management', v_weights.weight_management,
      'audit', v_weights.weight_audit,
      'guest', v_weights.weight_guest
    ),
    'threshold_score', v_weights.threshold_score,
    'employee_of_month', v_winner,
    'staff', v_staff
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_staff_performance_board(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.get_organization_staff_performance_board(uuid, text) IS
  'Kurumsal performans panosu: personel sıralaması, puan bileşenleri, ay içi denetim özeti, başarılar.';
