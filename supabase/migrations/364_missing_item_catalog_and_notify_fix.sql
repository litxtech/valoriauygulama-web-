-- Özelleştirilebilir eksik listesi kataloğu (otel / mutfak) + push 523 hatasında rapor kaydı bozulmasın.

BEGIN;

CREATE TABLE IF NOT EXISTS public.missing_item_catalog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  area text NOT NULL CHECK (area IN ('kitchen', 'hotel')),
  slug text NOT NULL,
  title text NOT NULL,
  icon text NOT NULL DEFAULT 'cube',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT missing_item_catalog_categories_slug_chk CHECK (length(trim(slug)) > 0),
  CONSTRAINT missing_item_catalog_categories_title_chk CHECK (length(trim(title)) > 0),
  UNIQUE (organization_id, area, slug)
);

CREATE TABLE IF NOT EXISTS public.missing_item_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.missing_item_catalog_categories(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT missing_item_catalog_items_key_chk CHECK (length(trim(item_key)) > 0),
  CONSTRAINT missing_item_catalog_items_label_chk CHECK (length(trim(label)) > 0),
  UNIQUE (category_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_missing_item_catalog_categories_org_area
  ON public.missing_item_catalog_categories (organization_id, area, sort_order);

CREATE INDEX IF NOT EXISTS idx_missing_item_catalog_items_category
  ON public.missing_item_catalog_items (category_id, sort_order);

CREATE OR REPLACE FUNCTION public.missing_item_catalog_can_manage()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.current_user_is_staff_admin()
    OR EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.is_active = true
        AND s.deleted_at IS NULL
        AND (s.app_permissions->>'gorev_ata')::boolean IS TRUE
    );
$$;

ALTER TABLE public.missing_item_catalog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missing_item_catalog_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "missing_item_catalog_categories_select" ON public.missing_item_catalog_categories;
CREATE POLICY "missing_item_catalog_categories_select"
  ON public.missing_item_catalog_categories FOR SELECT TO authenticated
  USING (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS "missing_item_catalog_categories_manage" ON public.missing_item_catalog_categories;
CREATE POLICY "missing_item_catalog_categories_manage"
  ON public.missing_item_catalog_categories FOR ALL TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.missing_item_catalog_can_manage()
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.missing_item_catalog_can_manage()
  );

DROP POLICY IF EXISTS "missing_item_catalog_items_select" ON public.missing_item_catalog_items;
CREATE POLICY "missing_item_catalog_items_select"
  ON public.missing_item_catalog_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.missing_item_catalog_categories c
      WHERE c.id = category_id
        AND c.organization_id = public.current_staff_organization_id()
    )
  );

DROP POLICY IF EXISTS "missing_item_catalog_items_manage" ON public.missing_item_catalog_items;
CREATE POLICY "missing_item_catalog_items_manage"
  ON public.missing_item_catalog_items FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.missing_item_catalog_categories c
      WHERE c.id = category_id
        AND c.organization_id = public.current_staff_organization_id()
        AND public.missing_item_catalog_can_manage()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.missing_item_catalog_categories c
      WHERE c.id = category_id
        AND c.organization_id = public.current_staff_organization_id()
        AND public.missing_item_catalog_can_manage()
    )
  );

-- Push zaman aşımı (523) rapor oluşturmayı başarısız göstermesin
CREATE OR REPLACE FUNCTION public.notify_missing_item_report_opened(p_report_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report record;
  v_staff_ids uuid[];
  v_title text;
  v_body text;
  v_payload jsonb;
  v_area_label text;
  v_items text;
  v_url text;
BEGIN
  SELECT r.id, r.organization_id, r.area, r.item_count, r.note, r.created_by_staff_id
  INTO v_report
  FROM public.missing_item_reports r
  WHERE r.id = p_report_id;

  IF v_report.id IS NULL THEN
    RETURN;
  END IF;

  IF v_report.area = 'kitchen' THEN
    v_staff_ids := public.staff_ids_kitchen_shortage_notify(v_report.organization_id);
    v_url := '/staff/kitchen-ops/shortages';
  ELSE
    SELECT array_agg(s.id)
    INTO v_staff_ids
    FROM public.staff s
    WHERE s.organization_id = v_report.organization_id
      AND s.is_active = true
      AND s.deleted_at IS NULL;
    v_url := '/staff/missing-items/' || v_report.area;
  END IF;

  IF v_staff_ids IS NULL OR array_length(v_staff_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  SELECT string_agg('• ' || mi.title, E'\n' ORDER BY mi.created_at)
  INTO v_items
  FROM public.missing_items mi
  WHERE mi.report_id = p_report_id;

  v_area_label := CASE v_report.area WHEN 'kitchen' THEN 'Mutfak' ELSE 'Otel' END;
  v_title := 'Mutfak eksik listesi (' || v_area_label || '): ' || v_report.item_count::text || ' kalem';
  IF v_report.area <> 'kitchen' THEN
    v_title := 'Eksik Var (' || v_area_label || '): ' || v_report.item_count::text || ' kalem';
  END IF;

  v_body := COALESCE(v_items, '');
  IF v_report.note IS NOT NULL AND length(trim(v_report.note)) > 0 THEN
    v_body := v_body || E'\n\nNot: ' || v_report.note;
  END IF;

  v_payload := jsonb_build_object(
    'kind', 'missing_item_report_opened',
    'missingItemReportId', p_report_id::text,
    'area', v_report.area,
    'url', v_url
  );

  INSERT INTO public.notifications (
    staff_id, guest_id, title, body, category, notification_type, data, created_by, sent_via, sent_at
  )
  SELECT sid, NULL, v_title, v_body, 'staff', 'missing_item_report_opened', v_payload, v_report.created_by_staff_id, 'both', now()
  FROM unnest(v_staff_ids) sid;

  BEGIN
    PERFORM net.http_post(
      url := 'https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/send-expo-push',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'staffIds', to_jsonb(v_staff_ids),
        'title', v_title,
        'body', left(v_body, 240),
        'data', v_payload
      ),
      timeout_milliseconds := 8000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'missing_item_report_opened push skipped: %', SQLERRM;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_missing_item_report(
  p_area text,
  p_titles text[],
  p_item_keys text[] DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_priority text DEFAULT 'medium'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_staff_id uuid;
  v_report_id uuid;
  v_title text;
  v_key text;
  i integer;
BEGIN
  v_staff_id := public.current_staff_id();
  v_org_id := public.current_staff_organization_id();

  IF v_staff_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Oturum gerekli';
  END IF;

  IF p_area NOT IN ('kitchen', 'hotel') THEN
    RAISE EXCEPTION 'Gecersiz alan';
  END IF;

  IF p_titles IS NULL OR array_length(p_titles, 1) IS NULL THEN
    RAISE EXCEPTION 'En az bir eksik secilmeli';
  END IF;

  IF p_priority NOT IN ('low', 'medium', 'high') THEN
    p_priority := 'medium';
  END IF;

  INSERT INTO public.missing_item_reports (
    organization_id, area, note, priority, created_by_staff_id, item_count
  ) VALUES (
    v_org_id, p_area, NULLIF(trim(coalesce(p_note, '')), ''), p_priority, v_staff_id, array_length(p_titles, 1)
  )
  RETURNING id INTO v_report_id;

  FOR i IN 1..array_length(p_titles, 1) LOOP
    v_title := trim(p_titles[i]);
    IF length(v_title) = 0 THEN
      CONTINUE;
    END IF;
    v_key := NULL;
    IF p_item_keys IS NOT NULL AND array_length(p_item_keys, 1) >= i THEN
      v_key := NULLIF(trim(p_item_keys[i]), '');
    END IF;

    INSERT INTO public.missing_items (
      organization_id, area, report_id, item_key, title, description, priority,
      created_by_staff_id
    ) VALUES (
      v_org_id, p_area, v_report_id, v_key, v_title, NULL, p_priority, v_staff_id
    );
  END LOOP;

  BEGIN
    PERFORM public.notify_missing_item_report_opened(v_report_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'missing_item_report notify failed: %', SQLERRM;
  END;

  RETURN v_report_id;
END;
$$;

COMMIT;
