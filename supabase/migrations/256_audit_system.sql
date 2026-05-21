-- Denetim modülü: bölüm kategorileri, kriterler, oturumlar, medya, pano RPC.

BEGIN;

-- ---------- Tablolar ----------
CREATE TABLE IF NOT EXISTS public.audit_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'layers-outline',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_categories_slug_org UNIQUE (organization_id, slug),
  CONSTRAINT audit_categories_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS public.audit_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.audit_categories(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  max_points smallint NOT NULL DEFAULT 10 CHECK (max_points > 0 AND max_points <= 100),
  weight smallint NOT NULL DEFAULT 1 CHECK (weight > 0 AND weight <= 10),
  is_critical boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_criteria_title_not_blank CHECK (length(trim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_audit_criteria_category
  ON public.audit_criteria (category_id, sort_order);

CREATE TABLE IF NOT EXISTS public.audit_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  category_id uuid NOT NULL REFERENCES public.audit_categories(id) ON DELETE RESTRICT,
  auditor_staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  area_note text,
  session_score smallint CHECK (session_score IS NULL OR (session_score >= 0 AND session_score <= 100)),
  month_key text NOT NULL,
  conducted_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_sessions_org_month
  ON public.audit_sessions (organization_id, month_key, status, conducted_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_sessions_category
  ON public.audit_sessions (category_id, conducted_at DESC);

CREATE TABLE IF NOT EXISTS public.audit_session_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.audit_sessions(id) ON DELETE CASCADE,
  criterion_id uuid NOT NULL REFERENCES public.audit_criteria(id) ON DELETE RESTRICT,
  points_awarded smallint NOT NULL DEFAULT 0 CHECK (points_awarded >= 0),
  max_points smallint NOT NULL CHECK (max_points > 0),
  weight smallint NOT NULL DEFAULT 1 CHECK (weight > 0),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_session_items_session_criterion UNIQUE (session_id, criterion_id)
);

CREATE TABLE IF NOT EXISTS public.audit_session_staff (
  session_id uuid NOT NULL REFERENCES public.audit_sessions(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'responsible' CHECK (role IN ('responsible', 'assistant')),
  PRIMARY KEY (session_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_audit_session_staff_staff
  ON public.audit_session_staff (staff_id);

CREATE TABLE IF NOT EXISTS public.audit_session_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.audit_sessions(id) ON DELETE CASCADE,
  session_item_id uuid REFERENCES public.audit_session_items(id) ON DELETE SET NULL,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  url text NOT NULL,
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_audit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.audit_sessions(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.audit_categories(id) ON DELETE RESTRICT,
  session_score smallint NOT NULL CHECK (session_score >= 0 AND session_score <= 100),
  month_key text NOT NULL,
  delta_points smallint NOT NULL DEFAULT 0,
  reason_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_audit_ledger_staff_month
  ON public.staff_audit_ledger (staff_id, month_key, created_at DESC);

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS evaluation_audit smallint
    CHECK (evaluation_audit IS NULL OR (evaluation_audit >= 0 AND evaluation_audit <= 100)),
  ADD COLUMN IF NOT EXISTS evaluation_audit_updated_at timestamptz;

COMMENT ON COLUMN public.staff.evaluation_audit IS 'Son 90 gün denetim oturumları ortalaması (0–100).';

-- ---------- Yardımcılar ----------
CREATE OR REPLACE FUNCTION public.audit_month_key(p_ts timestamptz DEFAULT now())
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT to_char(p_ts AT TIME ZONE 'UTC', 'YYYY-MM');
$$;

CREATE OR REPLACE FUNCTION public.audit_compute_session_score(p_session_id uuid)
RETURNS smallint
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_num numeric := 0;
  v_den numeric := 0;
  v_score numeric;
  v_has_critical_fail boolean := false;
BEGIN
  SELECT
    COALESCE(SUM(i.points_awarded::numeric * i.weight), 0),
    COALESCE(SUM(i.max_points::numeric * i.weight), 0),
    bool_or(c.is_critical AND i.points_awarded < i.max_points * 0.5)
  INTO v_num, v_den, v_has_critical_fail
  FROM public.audit_session_items i
  JOIN public.audit_criteria c ON c.id = i.criterion_id
  WHERE i.session_id = p_session_id;

  IF v_den <= 0 THEN
    RETURN 0;
  END IF;

  v_score := (v_num / v_den) * 100.0;
  IF v_has_critical_fail THEN
    v_score := LEAST(v_score, 40);
  END IF;

  RETURN LEAST(100, GREATEST(0, ROUND(v_score)::smallint));
END;
$$;

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
  FROM public.audit_session_staff ss
  JOIN public.audit_sessions s ON s.id = ss.session_id
  WHERE ss.staff_id = p_staff_id
    AND s.status = 'submitted'
    AND s.conducted_at >= (now() - interval '90 days');

  UPDATE public.staff
  SET
    evaluation_audit = v_avg,
    evaluation_audit_updated_at = CASE WHEN v_avg IS NULL THEN NULL ELSE now() END,
    updated_at = now()
  WHERE id = p_staff_id;
END;
$$;

-- ---------- Varsayılan kategori + kriter seed ----------
CREATE OR REPLACE FUNCTION public.seed_audit_defaults_for_org(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.audit_categories WHERE organization_id = p_org_id LIMIT 1) THEN
    RETURN;
  END IF;

  INSERT INTO public.audit_categories (organization_id, slug, name, icon, sort_order)
  VALUES (p_org_id, 'reception', 'Reception', 'desktop-outline', 10)
  RETURNING id INTO v_cat_id;
  INSERT INTO public.audit_criteria (category_id, title, max_points, weight, sort_order) VALUES
    (v_cat_id, 'Karşılama & iletişim', 20, 1, 10),
    (v_cat_id, 'Resepsiyon düzeni', 20, 1, 20),
    (v_cat_id, 'Bekleme alanı', 20, 1, 30),
    (v_cat_id, 'Kayıt süreçleri', 20, 1, 40),
    (v_cat_id, 'Genel görünüm', 20, 1, 50);

  INSERT INTO public.audit_categories (organization_id, slug, name, icon, sort_order)
  VALUES (p_org_id, 'kitchen', 'Mutfak', 'restaurant-outline', 20)
  RETURNING id INTO v_cat_id;
  INSERT INTO public.audit_criteria (category_id, title, description, max_points, weight, is_critical, sort_order) VALUES
    (v_cat_id, 'Yüzey hijyeni', 'Tezgâh, zemin, ekipman temizliği', 25, 1, false, 10),
    (v_cat_id, 'Soğuk zincir', 'Sıcaklık ve saklama kuralları', 20, 1, true, 20),
    (v_cat_id, 'Personel kıyafeti', NULL, 15, 1, false, 30),
    (v_cat_id, 'Atık ayrıştırma', NULL, 15, 1, false, 40),
    (v_cat_id, 'Ekipman bakımı', NULL, 15, 1, false, 50),
    (v_cat_id, 'Genel düzen', NULL, 10, 1, false, 60);

  INSERT INTO public.audit_categories (organization_id, slug, name, icon, sort_order)
  VALUES (p_org_id, 'office', 'Ofis', 'business-outline', 30)
  RETURNING id INTO v_cat_id;
  INSERT INTO public.audit_criteria (category_id, title, max_points, weight, sort_order) VALUES
    (v_cat_id, 'Çalışma düzeni', 25, 1, 10),
    (v_cat_id, 'Dosyalama', 25, 1, 20),
    (v_cat_id, 'Temizlik', 25, 1, 30),
    (v_cat_id, 'Ekipman & IT', 25, 1, 40);

  INSERT INTO public.audit_categories (organization_id, slug, name, icon, sort_order)
  VALUES (p_org_id, 'housekeeping', 'Kat hizmetleri', 'bed-outline', 40)
  RETURNING id INTO v_cat_id;
  INSERT INTO public.audit_criteria (category_id, title, max_points, weight, sort_order) VALUES
    (v_cat_id, 'Oda standardı', 30, 1, 10),
    (v_cat_id, 'Koridor & ortak alan', 25, 1, 20),
    (v_cat_id, 'Çamaşırhane', 25, 1, 30),
    (v_cat_id, 'Depo & malzeme', 20, 1, 40);
END;
$$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_audit_defaults_for_org(r.id);
  END LOOP;
END;
$$;

-- ---------- Oturum gönderimi ----------
CREATE OR REPLACE FUNCTION public.submit_audit_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess public.audit_sessions%ROWTYPE;
  v_score smallint;
  v_cat_name text;
  v_staff_id uuid;
  v_summary text;
  v_payload jsonb;
BEGIN
  IF NOT public.staff_is_admin_active() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_sess FROM public.audit_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found';
  END IF;
  IF v_sess.status <> 'draft' THEN
    RAISE EXCEPTION 'session already submitted';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.audit_session_items WHERE session_id = p_session_id) THEN
    RAISE EXCEPTION 'en az bir kriter puanlanmalı';
  END IF;

  v_score := public.audit_compute_session_score(p_session_id);

  UPDATE public.audit_sessions
  SET status = 'submitted',
      session_score = v_score,
      submitted_at = now(),
      updated_at = now()
  WHERE id = p_session_id;

  SELECT name INTO v_cat_name FROM public.audit_categories WHERE id = v_sess.category_id;

  SELECT string_agg(
    c.title || ': ' || i.points_awarded::text || '/' || i.max_points::text,
    '; ' ORDER BY c.sort_order
  )
  INTO v_summary
  FROM public.audit_session_items i
  JOIN public.audit_criteria c ON c.id = i.criterion_id
  WHERE i.session_id = p_session_id AND i.points_awarded < i.max_points;

  FOR v_staff_id IN
    SELECT staff_id FROM public.audit_session_staff WHERE session_id = p_session_id
  LOOP
    INSERT INTO public.staff_audit_ledger (
      organization_id, staff_id, session_id, category_id, session_score, month_key, delta_points, reason_summary
    ) VALUES (
      v_sess.organization_id,
      v_staff_id,
      p_session_id,
      v_sess.category_id,
      v_score,
      v_sess.month_key,
      v_score - 100,
      COALESCE(v_summary, 'Tam puan')
    );

    PERFORM public.audit_sync_staff_evaluation(v_staff_id);

    v_payload := jsonb_build_object(
      'kind', 'audit_session_submitted',
      'sessionId', p_session_id::text,
      'score', v_score,
      'categoryName', v_cat_name,
      'url', '/staff/evaluation'
    );

    INSERT INTO public.notifications (
      staff_id, guest_id, title, body, category, notification_type, data, created_by, sent_via, sent_at
    ) VALUES (
      v_staff_id,
      NULL,
      'Denetim: ' || COALESCE(v_cat_name, 'Bölüm') || ' — ' || v_score::text || '/100',
      COALESCE(
        CASE WHEN v_score < 70 THEN 'Skorunuz 70 altında. Yönetim ile görüşmeniz gerekebilir. ' ELSE '' END,
        ''
      ) || COALESCE(v_summary, 'Denetim tamamlandı.'),
      'staff',
      'audit_session_submitted',
      v_payload,
      v_sess.auditor_staff_id,
      'both',
      now()
    );
  END LOOP;

  RETURN jsonb_build_object('session_id', p_session_id, 'session_score', v_score);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_audit_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_audit_defaults_for_org(uuid) TO authenticated;

-- ---------- Pano: bölüm sıralaması ----------
CREATE OR REPLACE FUNCTION public.get_audit_department_leaderboard(
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
  v_prev_month text;
  v_result jsonb;
BEGIN
  IF NOT (
    public.staff_is_admin_active()
    OR p_organization_id = ANY (public.staff_org_ids_for_auth())
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_month := COALESCE(p_month_key, public.audit_month_key(now()));

  v_prev_month := to_char(
    (to_date(v_month || '-01', 'YYYY-MM-DD') - interval '1 month')::date,
    'YYYY-MM'
  );

  WITH cur AS (
    SELECT
      c.id AS category_id,
      c.name,
      c.slug,
      c.icon,
      ROUND(AVG(s.session_score))::int AS avg_score,
      COUNT(s.id)::int AS audit_count
    FROM public.audit_categories c
    LEFT JOIN public.audit_sessions s
      ON s.category_id = c.id
      AND s.organization_id = c.organization_id
      AND s.status = 'submitted'
      AND s.month_key = v_month
    WHERE c.organization_id = p_organization_id
      AND c.is_active = true
    GROUP BY c.id, c.name, c.slug, c.icon, c.sort_order
  ),
  prev AS (
    SELECT
      s.category_id,
      ROUND(AVG(s.session_score))::int AS prev_avg
    FROM public.audit_sessions s
    WHERE s.organization_id = p_organization_id
      AND s.status = 'submitted'
      AND s.month_key = v_prev_month
    GROUP BY s.category_id
  ),
  ranked AS (
    SELECT
      cur.*,
      prev.prev_avg,
      (cur.avg_score - COALESCE(prev.prev_avg, cur.avg_score)) AS trend_delta,
      ROW_NUMBER() OVER (
        ORDER BY COALESCE(cur.avg_score, 0) DESC, cur.audit_count DESC, cur.name
      )::int AS rank
    FROM cur
    LEFT JOIN prev ON prev.category_id = cur.category_id
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'category_id', category_id,
      'name', name,
      'slug', slug,
      'icon', icon,
      'avg_score', avg_score,
      'audit_count', audit_count,
      'rank', rank,
      'trend_delta', trend_delta,
      'prev_avg', prev_avg
    ) ORDER BY rank
  ), '[]'::jsonb)
  INTO v_result
  FROM ranked;

  RETURN jsonb_build_object('month_key', v_month, 'departments', v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_audit_department_leaderboard(uuid, text) TO authenticated;

-- Personel özeti
CREATE OR REPLACE FUNCTION public.get_staff_audit_summary(p_staff_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_org uuid;
  v_month text;
  v_auth_staff uuid;
  v_result jsonb;
  v_recent jsonb;
  v_dept_rank jsonb;
BEGIN
  v_auth_staff := public.current_staff_id();
  IF v_auth_staff IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_staff_id <> v_auth_staff AND NOT public.staff_is_admin_active() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT organization_id INTO v_org FROM public.staff WHERE id = p_staff_id;
  v_month := public.audit_month_key(now());

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.conducted_at DESC), '[]'::jsonb)
  INTO v_recent
  FROM (
    SELECT
      s.id,
      s.session_score,
      s.conducted_at,
      s.month_key,
      c.name AS category_name,
      c.slug AS category_slug,
      l.reason_summary
    FROM public.staff_audit_ledger l
    JOIN public.audit_sessions s ON s.id = l.session_id
    JOIN public.audit_categories c ON c.id = l.category_id
    WHERE l.staff_id = p_staff_id
    ORDER BY s.conducted_at DESC
    LIMIT 12
  ) t;

  SELECT jsonb_build_object(
    'evaluation_audit', st.evaluation_audit,
    'evaluation_audit_updated_at', st.evaluation_audit_updated_at
  )
  INTO v_dept_rank
  FROM public.staff st
  WHERE st.id = p_staff_id;

  RETURN jsonb_build_object(
    'month_key', v_month,
    'evaluation_audit', (v_dept_rank->>'evaluation_audit')::int,
    'evaluation_audit_updated_at', v_dept_rank->>'evaluation_audit_updated_at',
    'recent', v_recent,
    'below_threshold', COALESCE((v_dept_rank->>'evaluation_audit')::int, 100) < 70
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_audit_summary(uuid) TO authenticated;

-- ---------- RLS ----------
ALTER TABLE public.audit_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_session_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_session_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_session_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_audit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_categories_select ON public.audit_categories;
CREATE POLICY audit_categories_select ON public.audit_categories
  FOR SELECT TO authenticated
  USING (organization_id = ANY (public.staff_org_ids_for_auth()));

DROP POLICY IF EXISTS audit_categories_write ON public.audit_categories;
CREATE POLICY audit_categories_write ON public.audit_categories
  FOR ALL TO authenticated
  USING (public.staff_is_admin_active() AND organization_id = ANY (public.staff_org_ids_for_auth()))
  WITH CHECK (public.staff_is_admin_active() AND organization_id = ANY (public.staff_org_ids_for_auth()));

DROP POLICY IF EXISTS audit_criteria_select ON public.audit_criteria;
CREATE POLICY audit_criteria_select ON public.audit_criteria
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.audit_categories c
      WHERE c.id = category_id AND c.organization_id = ANY (public.staff_org_ids_for_auth())
    )
  );

DROP POLICY IF EXISTS audit_criteria_write ON public.audit_criteria;
CREATE POLICY audit_criteria_write ON public.audit_criteria
  FOR ALL TO authenticated
  USING (
    public.staff_is_admin_active()
    AND EXISTS (
      SELECT 1 FROM public.audit_categories c
      WHERE c.id = category_id AND c.organization_id = ANY (public.staff_org_ids_for_auth())
    )
  )
  WITH CHECK (
    public.staff_is_admin_active()
    AND EXISTS (
      SELECT 1 FROM public.audit_categories c
      WHERE c.id = category_id AND c.organization_id = ANY (public.staff_org_ids_for_auth())
    )
  );

DROP POLICY IF EXISTS audit_sessions_select ON public.audit_sessions;
CREATE POLICY audit_sessions_select ON public.audit_sessions
  FOR SELECT TO authenticated
  USING (organization_id = ANY (public.staff_org_ids_for_auth()));

DROP POLICY IF EXISTS audit_sessions_write ON public.audit_sessions;
CREATE POLICY audit_sessions_write ON public.audit_sessions
  FOR ALL TO authenticated
  USING (public.staff_is_admin_active() AND organization_id = ANY (public.staff_org_ids_for_auth()))
  WITH CHECK (public.staff_is_admin_active() AND organization_id = ANY (public.staff_org_ids_for_auth()));

DROP POLICY IF EXISTS audit_session_items_all ON public.audit_session_items;
CREATE POLICY audit_session_items_all ON public.audit_session_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.audit_sessions s
      WHERE s.id = session_id AND s.organization_id = ANY (public.staff_org_ids_for_auth())
    )
  )
  WITH CHECK (
    public.staff_is_admin_active()
    AND EXISTS (
      SELECT 1 FROM public.audit_sessions s
      WHERE s.id = session_id AND s.organization_id = ANY (public.staff_org_ids_for_auth())
    )
  );

DROP POLICY IF EXISTS audit_session_staff_select ON public.audit_session_staff;
CREATE POLICY audit_session_staff_select ON public.audit_session_staff
  FOR SELECT TO authenticated
  USING (
    staff_id = public.current_staff_id()
    OR EXISTS (
      SELECT 1 FROM public.audit_sessions s
      WHERE s.id = session_id AND s.organization_id = ANY (public.staff_org_ids_for_auth())
    )
  );

DROP POLICY IF EXISTS audit_session_staff_write ON public.audit_session_staff;
CREATE POLICY audit_session_staff_write ON public.audit_session_staff
  FOR ALL TO authenticated
  USING (
    public.staff_is_admin_active()
    AND EXISTS (
      SELECT 1 FROM public.audit_sessions s
      WHERE s.id = session_id AND s.organization_id = ANY (public.staff_org_ids_for_auth())
    )
  )
  WITH CHECK (
    public.staff_is_admin_active()
    AND EXISTS (
      SELECT 1 FROM public.audit_sessions s
      WHERE s.id = session_id AND s.organization_id = ANY (public.staff_org_ids_for_auth())
    )
  );

DROP POLICY IF EXISTS audit_session_media_all ON public.audit_session_media;
CREATE POLICY audit_session_media_all ON public.audit_session_media
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.audit_sessions s
      WHERE s.id = session_id AND s.organization_id = ANY (public.staff_org_ids_for_auth())
    )
  )
  WITH CHECK (
    public.staff_is_admin_active()
    AND EXISTS (
      SELECT 1 FROM public.audit_sessions s
      WHERE s.id = session_id AND s.organization_id = ANY (public.staff_org_ids_for_auth())
    )
  );

DROP POLICY IF EXISTS staff_audit_ledger_select ON public.staff_audit_ledger;
CREATE POLICY staff_audit_ledger_select ON public.staff_audit_ledger
  FOR SELECT TO authenticated
  USING (
    staff_id = public.current_staff_id()
    OR (public.staff_is_admin_active() AND organization_id = ANY (public.staff_org_ids_for_auth()))
  );

DROP POLICY IF EXISTS staff_audit_ledger_insert ON public.staff_audit_ledger;
CREATE POLICY staff_audit_ledger_insert ON public.staff_audit_ledger
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- ---------- Storage ----------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audit-media',
  'audit-media',
  true,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS audit_media_insert ON storage.objects;
CREATE POLICY audit_media_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'audit-media');

DROP POLICY IF EXISTS audit_media_select ON storage.objects;
CREATE POLICY audit_media_select ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'audit-media');

COMMIT;
