-- Valoria Hotel - Personel Denetim ve Performans Sistemi
-- Tek performans puani (0-100, baslangic 100). Tum olaylar bu puana etki eder.
-- Denetim gecmisi ve puan loglari silinmez.

BEGIN;

-- ---------- Personel: tek resmi performans puani + dosya alanlari ----------
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS performance_score smallint NOT NULL DEFAULT 100
    CHECK (performance_score >= 0 AND performance_score <= 100),
  ADD COLUMN IF NOT EXISTS performance_score_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS family_mother text,
  ADD COLUMN IF NOT EXISTS family_father text,
  ADD COLUMN IF NOT EXISTS family_spouse text,
  ADD COLUMN IF NOT EXISTS family_children text,
  ADD COLUMN IF NOT EXISTS education_detail text,
  ADD COLUMN IF NOT EXISTS certificates_detail text,
  ADD COLUMN IF NOT EXISTS dossier_notes text;

COMMENT ON COLUMN public.staff.performance_score IS
  'Tek resmi performans puani (0-100). Tum denetim/davranis olaylari bu puana etki eder.';
COMMENT ON COLUMN public.staff.evaluation_combined IS
  'Geriye uyum: performance_score ile senkron tutulur.';

UPDATE public.staff
SET
  performance_score = COALESCE(evaluation_combined, evaluation_score, 100),
  performance_score_updated_at = COALESCE(evaluation_combined_updated_at, now())
WHERE performance_score = 100
  AND (evaluation_combined IS NOT NULL OR evaluation_score IS NOT NULL);

-- ---------- Kategoriler (10 denetim basligi) ----------
CREATE TABLE IF NOT EXISTS public.staff_perf_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'clipboard-outline',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_perf_categories_slug_org UNIQUE (organization_id, slug),
  CONSTRAINT staff_perf_categories_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS public.staff_perf_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.staff_perf_categories(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  default_delta smallint NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_perf_criteria_title_not_blank CHECK (length(trim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_staff_perf_criteria_category
  ON public.staff_perf_criteria (category_id, sort_order);

-- ---------- Olay defteri (silinmez) ----------
CREATE TABLE IF NOT EXISTS public.staff_perf_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  category_id uuid REFERENCES public.staff_perf_categories(id) ON DELETE RESTRICT,
  criterion_id uuid REFERENCES public.staff_perf_criteria(id) ON DELETE RESTRICT,
  auditor_staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  report_number text NOT NULL,
  title text NOT NULL,
  note text,
  delta_points smallint NOT NULL CHECK (delta_points <> 0 AND delta_points BETWEEN -50 AND 50),
  score_before smallint NOT NULL CHECK (score_before >= 0 AND score_before <= 100),
  score_after smallint NOT NULL CHECK (score_after >= 0 AND score_after <= 100),
  conducted_at timestamptz NOT NULL DEFAULT now(),
  photo_urls text[] NOT NULL DEFAULT '{}',
  video_urls text[] NOT NULL DEFAULT '{}',
  evidence_urls text[] NOT NULL DEFAULT '{}',
  signature_data text,
  signature_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_perf_events_title_not_blank CHECK (length(trim(title)) > 0),
  CONSTRAINT staff_perf_events_report_unique UNIQUE (organization_id, report_number)
);

CREATE INDEX IF NOT EXISTS idx_staff_perf_events_staff
  ON public.staff_perf_events (staff_id, conducted_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_perf_events_org
  ON public.staff_perf_events (organization_id, conducted_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_perf_events_category
  ON public.staff_perf_events (category_id, conducted_at DESC);

-- ---------- Puan degisim logu (silinmez) ----------
CREATE TABLE IF NOT EXISTS public.staff_perf_score_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  event_id uuid REFERENCES public.staff_perf_events(id) ON DELETE RESTRICT,
  auditor_staff_id uuid REFERENCES public.staff(id) ON DELETE RESTRICT,
  score_before smallint NOT NULL CHECK (score_before >= 0 AND score_before <= 100),
  score_after smallint NOT NULL CHECK (score_after >= 0 AND score_after <= 100),
  delta_points smallint NOT NULL,
  reason text NOT NULL,
  logged_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_perf_score_log_reason_not_blank CHECK (length(trim(reason)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_staff_perf_score_log_staff
  ON public.staff_perf_score_log (staff_id, logged_at DESC);

-- ---------- AI / gelecek yil degerlendirme ----------
CREATE TABLE IF NOT EXISTS public.staff_perf_ai_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  evaluation_year integer NOT NULL,
  report_number text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  overall_recommendation text,
  prepared_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  approved_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_perf_ai_eval_year_unique UNIQUE (staff_id, evaluation_year),
  CONSTRAINT staff_perf_ai_eval_report_unique UNIQUE (organization_id, report_number)
);

CREATE INDEX IF NOT EXISTS idx_staff_perf_ai_eval_staff
  ON public.staff_perf_ai_evaluations (staff_id, evaluation_year DESC);

-- ---------- Rapor numarasi ----------
CREATE OR REPLACE FUNCTION public.staff_perf_next_report_number(p_org_id uuid, p_prefix text DEFAULT 'VPD')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year text := to_char(now() AT TIME ZONE 'Europe/Istanbul', 'YYYY');
  v_count int;
BEGIN
  SELECT COUNT(*)::int + 1 INTO v_count
  FROM public.staff_perf_events e
  WHERE e.organization_id = p_org_id
    AND e.report_number LIKE (p_prefix || '-' || v_year || '-%');

  RETURN p_prefix || '-' || v_year || '-' || lpad(v_count::text, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_perf_next_ai_report_number(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year text := to_char(now() AT TIME ZONE 'Europe/Istanbul', 'YYYY');
  v_count int;
BEGIN
  SELECT COUNT(*)::int + 1 INTO v_count
  FROM public.staff_perf_ai_evaluations e
  WHERE e.organization_id = p_org_id
    AND e.report_number LIKE ('VPAI-' || v_year || '-%');

  RETURN 'VPAI-' || v_year || '-' || lpad(v_count::text, 5, '0');
END;
$$;

-- ---------- Olay uygula: puan guncelle + log (tek kaynak) ----------
CREATE OR REPLACE FUNCTION public.apply_staff_perf_event(
  p_organization_id uuid,
  p_staff_id uuid,
  p_auditor_staff_id uuid,
  p_title text,
  p_delta_points smallint,
  p_note text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_criterion_id uuid DEFAULT NULL,
  p_conducted_at timestamptz DEFAULT now(),
  p_photo_urls text[] DEFAULT '{}',
  p_video_urls text[] DEFAULT '{}',
  p_evidence_urls text[] DEFAULT '{}',
  p_signature_data text DEFAULT NULL,
  p_signature_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before smallint;
  v_after smallint;
  v_report text;
  v_event_id uuid;
  v_org uuid;
BEGIN
  IF p_delta_points IS NULL OR p_delta_points = 0 THEN
    RAISE EXCEPTION 'delta_points sifir olamaz';
  END IF;
  IF length(trim(COALESCE(p_title, ''))) = 0 THEN
    RAISE EXCEPTION 'title zorunlu';
  END IF;

  SELECT organization_id, performance_score
  INTO v_org, v_before
  FROM public.staff
  WHERE id = p_staff_id
  FOR UPDATE;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Personel bulunamadi';
  END IF;
  IF v_org <> p_organization_id THEN
    RAISE EXCEPTION 'Organizasyon uyusmazligi';
  END IF;

  v_after := LEAST(100, GREATEST(0, v_before + p_delta_points));
  v_report := public.staff_perf_next_report_number(p_organization_id, 'VPD');

  INSERT INTO public.staff_perf_events (
    organization_id, staff_id, category_id, criterion_id, auditor_staff_id,
    report_number, title, note, delta_points, score_before, score_after,
    conducted_at, photo_urls, video_urls, evidence_urls, signature_data, signature_name
  ) VALUES (
    p_organization_id, p_staff_id, p_category_id, p_criterion_id, p_auditor_staff_id,
    v_report, trim(p_title), nullif(trim(COALESCE(p_note, '')), ''),
    p_delta_points, v_before, v_after,
    COALESCE(p_conducted_at, now()),
    COALESCE(p_photo_urls, '{}'), COALESCE(p_video_urls, '{}'), COALESCE(p_evidence_urls, '{}'),
    p_signature_data, nullif(trim(COALESCE(p_signature_name, '')), '')
  )
  RETURNING id INTO v_event_id;

  INSERT INTO public.staff_perf_score_log (
    organization_id, staff_id, event_id, auditor_staff_id,
    score_before, score_after, delta_points, reason
  ) VALUES (
    p_organization_id, p_staff_id, v_event_id, p_auditor_staff_id,
    v_before, v_after, p_delta_points,
    trim(p_title) || CASE WHEN p_note IS NOT NULL AND length(trim(p_note)) > 0 THEN ' - ' || trim(p_note) ELSE '' END
  );

  UPDATE public.staff
  SET
    performance_score = v_after,
    performance_score_updated_at = now(),
    evaluation_combined = v_after,
    evaluation_combined_updated_at = now(),
    evaluation_score = v_after,
    evaluation_audit = v_after,
    evaluation_audit_updated_at = now(),
    updated_at = now()
  WHERE id = p_staff_id;

  IF v_after < 70 AND v_before >= 70 THEN
    INSERT INTO public.staff_performance_notices (
      organization_id, staff_id, notice_type, threshold_score, score_at_trigger, message, created_by_staff_id
    ) VALUES (
      p_organization_id, p_staff_id,
      CASE WHEN v_after < 50 THEN 'termination_review' ELSE 'warning' END,
      70, v_after,
      'Performans puani ' || v_after::text || '/100 seviyesine dustu. Resmi inceleme gerekir.',
      p_auditor_staff_id
    );
  END IF;

  RETURN jsonb_build_object(
    'event_id', v_event_id,
    'report_number', v_report,
    'score_before', v_before,
    'score_after', v_after,
    'delta_points', p_delta_points
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_staff_perf_event(
  uuid, uuid, uuid, text, smallint, text, uuid, uuid, timestamptz, text[], text[], text[], text, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.staff_perf_next_report_number(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_perf_next_ai_report_number(uuid) TO authenticated;

-- ---------- Seed: 10 kategori + kriterler ----------
CREATE OR REPLACE FUNCTION public.seed_staff_perf_defaults_for_org(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.staff_perf_categories WHERE organization_id = p_org_id LIMIT 1) THEN
    RETURN;
  END IF;

  INSERT INTO public.staff_perf_categories (organization_id, slug, name, icon, sort_order)
  VALUES (p_org_id, 'discipline', 'Disiplin', 'time-outline', 10) RETURNING id INTO v_cat;
  INSERT INTO public.staff_perf_criteria (category_id, title, default_delta, sort_order) VALUES
    (v_cat, 'Mesaiye zamaninda gelme', 1, 10),
    (v_cat, 'Erken cikis', -2, 20),
    (v_cat, 'Devamsizlik', -5, 30),
    (v_cat, 'Izinsiz ayrilma', -5, 40),
    (v_cat, 'Telefon kullanimi', -2, 50),
    (v_cat, 'Sigara molalari', -1, 60),
    (v_cat, 'Uniforma', -1, 70),
    (v_cat, 'Personel karti', -1, 80);

  INSERT INTO public.staff_perf_categories (organization_id, slug, name, icon, sort_order)
  VALUES (p_org_id, 'cleanliness', 'Temizlik', 'sparkles-outline', 20) RETURNING id INTO v_cat;
  INSERT INTO public.staff_perf_criteria (category_id, title, default_delta, sort_order) VALUES
    (v_cat, 'Oda temizligi', -3, 10),
    (v_cat, 'Ortak alan', -2, 20),
    (v_cat, 'Malzeme duzeni', -1, 30),
    (v_cat, 'Hijyen kurallari', -3, 40),
    (v_cat, 'Kimyasal kullanimi', -2, 50);

  INSERT INTO public.staff_perf_categories (organization_id, slug, name, icon, sort_order)
  VALUES (p_org_id, 'guest_satisfaction', 'Misafir Memnuniyeti', 'happy-outline', 30) RETURNING id INTO v_cat;
  INSERT INTO public.staff_perf_criteria (category_id, title, default_delta, sort_order) VALUES
    (v_cat, 'Guler yuz', 1, 10),
    (v_cat, 'Karsilama', 1, 20),
    (v_cat, 'Sikayet cozumu', 2, 30),
    (v_cat, 'Misafir yorumu', 2, 40),
    (v_cat, 'Tesekkur alma', 2, 50);

  INSERT INTO public.staff_perf_categories (organization_id, slug, name, icon, sort_order)
  VALUES (p_org_id, 'work_quality', 'Is Kalitesi', 'checkmark-done-outline', 40) RETURNING id INTO v_cat;
  INSERT INTO public.staff_perf_criteria (category_id, title, default_delta, sort_order) VALUES
    (v_cat, 'Hata orani', -3, 10),
    (v_cat, 'Hiz', 1, 20),
    (v_cat, 'Dogruluk', 1, 30),
    (v_cat, 'Kontrol', 1, 40),
    (v_cat, 'Sorumluluk', 1, 50);

  INSERT INTO public.staff_perf_categories (organization_id, slug, name, icon, sort_order)
  VALUES (p_org_id, 'teamwork', 'Takim Calismasi', 'people-outline', 50) RETURNING id INTO v_cat;
  INSERT INTO public.staff_perf_criteria (category_id, title, default_delta, sort_order) VALUES
    (v_cat, 'Yardimlasma', 1, 10),
    (v_cat, 'Amir talimatina uyma', 1, 20),
    (v_cat, 'Iletisim', 1, 30),
    (v_cat, 'Saygi', 1, 40),
    (v_cat, 'Problem cozme', 2, 50);

  INSERT INTO public.staff_perf_categories (organization_id, slug, name, icon, sort_order)
  VALUES (p_org_id, 'security', 'Guvenlik', 'shield-checkmark-outline', 60) RETURNING id INTO v_cat;
  INSERT INTO public.staff_perf_criteria (category_id, title, default_delta, sort_order) VALUES
    (v_cat, 'Is guvenligi', -5, 10),
    (v_cat, 'Yangin kurallari', -5, 20),
    (v_cat, 'Acil durum bilgisi', -2, 30),
    (v_cat, 'Otel guvenligi', -5, 40),
    (v_cat, 'Anahtar guvenligi', -5, 50);

  INSERT INTO public.staff_perf_categories (organization_id, slug, name, icon, sort_order)
  VALUES (p_org_id, 'training', 'Egitim', 'school-outline', 70) RETURNING id INTO v_cat;
  INSERT INTO public.staff_perf_criteria (category_id, title, default_delta, sort_order) VALUES
    (v_cat, 'Egitimlere katilim', 2, 10),
    (v_cat, 'Sertifikalar', 2, 20),
    (v_cat, 'Yeni ogrenme', 1, 30),
    (v_cat, 'Kendini gelistirme', 1, 40);

  INSERT INTO public.staff_perf_categories (organization_id, slug, name, icon, sort_order)
  VALUES (p_org_id, 'hotel_contribution', 'Otel Katkisi', 'bulb-outline', 80) RETURNING id INTO v_cat;
  INSERT INTO public.staff_perf_criteria (category_id, title, default_delta, sort_order) VALUES
    (v_cat, 'Fikir onerileri', 2, 10),
    (v_cat, 'Maliyet tasarrufu', 3, 20),
    (v_cat, 'Enerji tasarrufu', 2, 30),
    (v_cat, 'Gelir artirici oneriler', 3, 40),
    (v_cat, 'Misafir memnuniyetine katki', 2, 50);

  INSERT INTO public.staff_perf_categories (organization_id, slug, name, icon, sort_order)
  VALUES (p_org_id, 'manager_review', 'Yonetici Degerlendirmesi', 'briefcase-outline', 90) RETURNING id INTO v_cat;
  INSERT INTO public.staff_perf_criteria (category_id, title, default_delta, sort_order) VALUES
    (v_cat, 'Genel gozlem', 1, 10),
    (v_cat, 'Liderlik', 2, 20),
    (v_cat, 'Guvenilirlik', 2, 30),
    (v_cat, 'Sorumluluk', 1, 40);

  INSERT INTO public.staff_perf_categories (organization_id, slug, name, icon, sort_order)
  VALUES (p_org_id, 'behavior', 'Davranis', 'hand-left-outline', 100) RETURNING id INTO v_cat;
  INSERT INTO public.staff_perf_criteria (category_id, title, default_delta, sort_order) VALUES
    (v_cat, 'Saygi', 1, 10),
    (v_cat, 'Durustluk', 2, 20),
    (v_cat, 'Gizlilik', -5, 30),
    (v_cat, 'Kurallara uyum', 1, 40),
    (v_cat, 'Kriz yonetimi', 2, 50);
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_staff_perf_defaults_for_org(uuid) TO authenticated;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_staff_perf_defaults_for_org(r.id);
  END LOOP;
END $$;

-- ---------- Dashboard RPC ----------
CREATE OR REPLACE FUNCTION public.get_staff_perf_dossier(p_staff_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff jsonb;
  v_events jsonb;
  v_logs jsonb;
  v_ai jsonb;
  v_warnings jsonb;
  v_salary jsonb;
BEGIN
  SELECT to_jsonb(s) - 'password_hash' INTO v_staff
  FROM public.staff s WHERE s.id = p_staff_id;
  IF v_staff IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.conducted_at DESC), '[]'::jsonb)
  INTO v_events
  FROM public.staff_perf_events e
  WHERE e.staff_id = p_staff_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.logged_at DESC), '[]'::jsonb)
  INTO v_logs
  FROM public.staff_perf_score_log l
  WHERE l.staff_id = p_staff_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.evaluation_year DESC), '[]'::jsonb)
  INTO v_ai
  FROM public.staff_perf_ai_evaluations a
  WHERE a.staff_id = p_staff_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(w) ORDER BY w.created_at DESC), '[]'::jsonb)
  INTO v_warnings
  FROM public.staff_personnel_warnings w
  WHERE w.subject_staff_id = p_staff_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC), '[]'::jsonb)
  INTO v_salary
  FROM (
    SELECT * FROM public.salary_payments sp
    WHERE sp.staff_id = p_staff_id
    ORDER BY sp.created_at DESC
    LIMIT 24
  ) p;

  RETURN jsonb_build_object(
    'staff', v_staff,
    'events', v_events,
    'score_log', v_logs,
    'ai_evaluations', v_ai,
    'warnings', COALESCE(v_warnings, '[]'::jsonb),
    'salary_history', COALESCE(v_salary, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_perf_dossier(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_organization_staff_perf_board(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.performance_score DESC, t.full_name ASC)
    FROM (
      SELECT
        s.id AS staff_id,
        s.full_name,
        s.department,
        s.role,
        s.profile_image,
        s.performance_score,
        s.performance_score_updated_at,
        (
          SELECT COUNT(*)::int FROM public.staff_perf_events e WHERE e.staff_id = s.id
        ) AS event_count,
        (
          SELECT COUNT(*)::int FROM public.staff_perf_events e
          WHERE e.staff_id = s.id AND e.delta_points > 0
        ) AS positive_count,
        (
          SELECT COUNT(*)::int FROM public.staff_perf_events e
          WHERE e.staff_id = s.id AND e.delta_points < 0
        ) AS negative_count
      FROM public.staff s
      WHERE s.organization_id = p_organization_id
        AND s.is_active = true
    ) t
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_staff_perf_board(uuid) TO authenticated;

-- ---------- RLS (auth_id) ----------
ALTER TABLE public.staff_perf_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_perf_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_perf_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_perf_score_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_perf_ai_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_perf_categories_select ON public.staff_perf_categories;
CREATE POLICY staff_perf_categories_select ON public.staff_perf_categories
  FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM public.staff WHERE auth_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.staff st WHERE st.auth_id = auth.uid() AND st.role = 'admin')
  );

DROP POLICY IF EXISTS staff_perf_categories_write ON public.staff_perf_categories;
CREATE POLICY staff_perf_categories_write ON public.staff_perf_categories
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff st
      WHERE st.auth_id = auth.uid()
        AND st.organization_id = staff_perf_categories.organization_id
        AND (st.role = 'admin' OR COALESCE((st.app_permissions->>'denetim_panosu')::boolean, false))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff st
      WHERE st.auth_id = auth.uid()
        AND st.organization_id = staff_perf_categories.organization_id
        AND (st.role = 'admin' OR COALESCE((st.app_permissions->>'denetim_panosu')::boolean, false))
    )
  );

DROP POLICY IF EXISTS staff_perf_criteria_select ON public.staff_perf_criteria;
CREATE POLICY staff_perf_criteria_select ON public.staff_perf_criteria
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_perf_categories c
      JOIN public.staff st ON st.organization_id = c.organization_id
      WHERE c.id = staff_perf_criteria.category_id AND st.auth_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.staff st WHERE st.auth_id = auth.uid() AND st.role = 'admin')
  );

DROP POLICY IF EXISTS staff_perf_criteria_write ON public.staff_perf_criteria;
CREATE POLICY staff_perf_criteria_write ON public.staff_perf_criteria
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_perf_categories c
      JOIN public.staff st ON st.organization_id = c.organization_id
      WHERE c.id = staff_perf_criteria.category_id
        AND st.auth_id = auth.uid()
        AND (st.role = 'admin' OR COALESCE((st.app_permissions->>'denetim_panosu')::boolean, false))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_perf_categories c
      JOIN public.staff st ON st.organization_id = c.organization_id
      WHERE c.id = staff_perf_criteria.category_id
        AND st.auth_id = auth.uid()
        AND (st.role = 'admin' OR COALESCE((st.app_permissions->>'denetim_panosu')::boolean, false))
    )
  );

DROP POLICY IF EXISTS staff_perf_events_select ON public.staff_perf_events;
CREATE POLICY staff_perf_events_select ON public.staff_perf_events
  FOR SELECT TO authenticated
  USING (
    staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.staff st
      WHERE st.auth_id = auth.uid()
        AND st.organization_id = staff_perf_events.organization_id
        AND (st.role = 'admin' OR COALESCE((st.app_permissions->>'denetim_panosu')::boolean, false)
             OR COALESCE((st.app_permissions->>'performans_paneli')::boolean, false)
             OR COALESCE((st.app_permissions->>'personel_listesi')::boolean, false))
    )
  );

DROP POLICY IF EXISTS staff_perf_score_log_select ON public.staff_perf_score_log;
CREATE POLICY staff_perf_score_log_select ON public.staff_perf_score_log
  FOR SELECT TO authenticated
  USING (
    staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.staff st
      WHERE st.auth_id = auth.uid()
        AND st.organization_id = staff_perf_score_log.organization_id
        AND (st.role = 'admin' OR COALESCE((st.app_permissions->>'denetim_panosu')::boolean, false)
             OR COALESCE((st.app_permissions->>'performans_paneli')::boolean, false)
             OR COALESCE((st.app_permissions->>'personel_listesi')::boolean, false))
    )
  );

DROP POLICY IF EXISTS staff_perf_ai_eval_select ON public.staff_perf_ai_evaluations;
CREATE POLICY staff_perf_ai_eval_select ON public.staff_perf_ai_evaluations
  FOR SELECT TO authenticated
  USING (
    staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.staff st
      WHERE st.auth_id = auth.uid()
        AND st.organization_id = staff_perf_ai_evaluations.organization_id
        AND (st.role = 'admin' OR COALESCE((st.app_permissions->>'denetim_panosu')::boolean, false)
             OR COALESCE((st.app_permissions->>'performans_paneli')::boolean, false)
             OR COALESCE((st.app_permissions->>'personel_listesi')::boolean, false))
    )
  );

DROP POLICY IF EXISTS staff_perf_ai_eval_write ON public.staff_perf_ai_evaluations;
CREATE POLICY staff_perf_ai_eval_write ON public.staff_perf_ai_evaluations
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff st
      WHERE st.auth_id = auth.uid()
        AND st.organization_id = staff_perf_ai_evaluations.organization_id
        AND (st.role = 'admin' OR COALESCE((st.app_permissions->>'denetim_panosu')::boolean, false))
    )
  );

DROP POLICY IF EXISTS staff_perf_ai_eval_update ON public.staff_perf_ai_evaluations;
CREATE POLICY staff_perf_ai_eval_update ON public.staff_perf_ai_evaluations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff st
      WHERE st.auth_id = auth.uid()
        AND st.organization_id = staff_perf_ai_evaluations.organization_id
        AND (st.role = 'admin' OR COALESCE((st.app_permissions->>'denetim_panosu')::boolean, false))
    )
  );

GRANT SELECT ON public.staff_perf_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.staff_perf_categories TO authenticated;
GRANT SELECT ON public.staff_perf_criteria TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.staff_perf_criteria TO authenticated;
GRANT SELECT ON public.staff_perf_events TO authenticated;
GRANT SELECT ON public.staff_perf_score_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.staff_perf_ai_evaluations TO authenticated;

COMMIT;
