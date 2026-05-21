BEGIN;

-- Mutfak / Otel ayrımı ve toplu eksik bildirimi (rapor + kalemler)
CREATE TABLE IF NOT EXISTS public.missing_item_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  area text NOT NULL CHECK (area IN ('kitchen', 'hotel')),
  note text,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_by_staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  resolved_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  item_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_missing_item_reports_org_area_status
  ON public.missing_item_reports (organization_id, area, status, created_at DESC);

ALTER TABLE public.missing_items
  ADD COLUMN IF NOT EXISTS area text CHECK (area IS NULL OR area IN ('kitchen', 'hotel')),
  ADD COLUMN IF NOT EXISTS report_id uuid REFERENCES public.missing_item_reports(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS item_key text;

CREATE INDEX IF NOT EXISTS idx_missing_items_report
  ON public.missing_items (report_id) WHERE report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_missing_items_org_area_status
  ON public.missing_items (organization_id, area, status, created_at DESC);

-- Eski kayıtlar: alan belirtilmemişse otel sayılır
UPDATE public.missing_items SET area = 'hotel' WHERE area IS NULL;

ALTER TABLE public.missing_items
  ALTER COLUMN area SET DEFAULT 'hotel',
  ALTER COLUMN area SET NOT NULL;

ALTER TABLE public.missing_items
  DROP CONSTRAINT IF EXISTS missing_items_area_check;
ALTER TABLE public.missing_items
  ADD CONSTRAINT missing_items_area_check CHECK (area IN ('kitchen', 'hotel'));

CREATE OR REPLACE FUNCTION public.missing_item_reports_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_missing_item_reports_updated_at ON public.missing_item_reports;
CREATE TRIGGER trg_missing_item_reports_updated_at
  BEFORE UPDATE ON public.missing_item_reports
  FOR EACH ROW EXECUTE FUNCTION public.missing_item_reports_set_updated_at();

CREATE OR REPLACE FUNCTION public.missing_item_reports_set_resolve_meta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  v_staff_id := public.current_staff_id();

  IF NEW.status = 'resolved' THEN
    NEW.resolved_at := now();
    NEW.resolved_by_staff_id := COALESCE(NEW.resolved_by_staff_id, v_staff_id);
  ELSE
    NEW.resolved_at := NULL;
    NEW.resolved_by_staff_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_missing_item_reports_resolve_meta ON public.missing_item_reports;
CREATE TRIGGER trg_missing_item_reports_resolve_meta
  BEFORE UPDATE ON public.missing_item_reports
  FOR EACH ROW EXECUTE FUNCTION public.missing_item_reports_set_resolve_meta();

-- Rapor giderilince kalemleri de kapat
CREATE OR REPLACE FUNCTION public.missing_item_reports_cascade_resolve_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'resolved' AND OLD.status = 'open' THEN
    UPDATE public.missing_items
    SET status = 'resolved',
        resolved_by_staff_id = COALESCE(NEW.resolved_by_staff_id, public.current_staff_id())
    WHERE report_id = NEW.id AND status = 'open';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_missing_item_reports_cascade_resolve ON public.missing_item_reports;
CREATE TRIGGER trg_missing_item_reports_cascade_resolve
  AFTER UPDATE OF status ON public.missing_item_reports
  FOR EACH ROW EXECUTE FUNCTION public.missing_item_reports_cascade_resolve_items();

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

  PERFORM public.notify_missing_item_report_opened(v_report_id);

  RETURN v_report_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_missing_item_report(text, text[], text[], text, text) TO authenticated;

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
BEGIN
  SELECT r.id, r.organization_id, r.area, r.item_count, r.note, r.created_by_staff_id
  INTO v_report
  FROM public.missing_item_reports r
  WHERE r.id = p_report_id;

  IF v_report.id IS NULL THEN
    RETURN;
  END IF;

  SELECT array_agg(s.id)
  INTO v_staff_ids
  FROM public.staff s
  WHERE s.organization_id = v_report.organization_id
    AND s.is_active = true
    AND s.deleted_at IS NULL;

  IF v_staff_ids IS NULL OR array_length(v_staff_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  SELECT string_agg('• ' || mi.title, E'\n' ORDER BY mi.created_at)
  INTO v_items
  FROM public.missing_items mi
  WHERE mi.report_id = p_report_id;

  v_area_label := CASE v_report.area WHEN 'kitchen' THEN 'Mutfak' ELSE 'Otel' END;
  v_title := 'Eksik Var (' || v_area_label || '): ' || v_report.item_count::text || ' kalem';
  v_body := COALESCE(v_items, '');
  IF v_report.note IS NOT NULL AND length(trim(v_report.note)) > 0 THEN
    v_body := v_body || E'\n\nNot: ' || v_report.note;
  END IF;

  v_payload := jsonb_build_object(
    'kind', 'missing_item_report_opened',
    'missingItemReportId', p_report_id::text,
    'area', v_report.area,
    'url', '/staff/missing-items/' || v_report.area
  );

  INSERT INTO public.notifications (
    staff_id, guest_id, title, body, category, notification_type, data, created_by, sent_via, sent_at
  )
  SELECT sid, NULL, v_title, v_body, 'staff', 'missing_item_report_opened', v_payload, v_report.created_by_staff_id, 'both', now()
  FROM unnest(v_staff_ids) sid;

  PERFORM net.http_post(
    url := 'https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/send-expo-push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'staffIds', to_jsonb(v_staff_ids),
      'title', v_title,
      'body', left(v_body, 240),
      'data', v_payload
    ),
    timeout_milliseconds := 10000
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_missing_item_report_opened(uuid) TO authenticated;

-- Bildirim: rapor bazlı tek mesaj
CREATE OR REPLACE FUNCTION public.missing_items_notify_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_ids uuid[];
  v_actor_name text;
  v_title text;
  v_body text;
  v_payload jsonb;
  v_area_label text;
  v_report record;
  v_items text;
BEGIN
  SELECT array_agg(s.id)
  INTO v_staff_ids
  FROM public.staff s
  WHERE s.organization_id = NEW.organization_id
    AND s.is_active = true
    AND s.deleted_at IS NULL;

  IF v_staff_ids IS NULL OR array_length(v_staff_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT st.full_name INTO v_actor_name
  FROM public.staff st
  WHERE st.id = COALESCE(NEW.resolved_by_staff_id, NEW.created_by_staff_id)
  LIMIT 1;

  v_area_label := CASE NEW.area WHEN 'kitchen' THEN 'Mutfak' ELSE 'Otel' END;

  IF TG_OP = 'INSERT' THEN
    -- Toplu rapor kalemleri: bildirim create_missing_item_report sonunda tek sefer gider
    IF NEW.report_id IS NOT NULL THEN
      RETURN NEW;
    END IF;

    v_title := 'Eksik Var (' || v_area_label || '): ' || NEW.title;
    v_body := COALESCE(NULLIF(trim(NEW.description), ''), 'Yeni eksik kaydi olusturuldu.');
    v_payload := jsonb_build_object(
      'kind', 'missing_item_opened',
      'missingItemId', NEW.id::text,
      'area', NEW.area,
      'url', '/staff/missing-items/' || NEW.area
    );

    INSERT INTO public.notifications (
      staff_id, guest_id, title, body, category, notification_type, data, created_by, sent_via, sent_at
    )
    SELECT sid, NULL, v_title, v_body, 'staff', 'missing_item_opened', v_payload, NEW.created_by_staff_id, 'both', now()
    FROM unnest(v_staff_ids) sid;

    PERFORM net.http_post(
      url := 'https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/send-expo-push',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'staffIds', to_jsonb(v_staff_ids),
        'title', v_title,
        'body', v_body,
        'data', v_payload
      ),
      timeout_milliseconds := 10000
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'open' AND NEW.status = 'resolved' THEN
    v_title := 'Eksik Var (' || v_area_label || ') giderildi: ' || NEW.title;
    v_body := COALESCE(NULLIF(trim(v_actor_name), ''), 'Bir personel') || ' eksigi giderildi olarak isaretledi.';
    v_payload := jsonb_build_object(
      'kind', 'missing_item_resolved',
      'missingItemId', NEW.id::text,
      'area', NEW.area,
      'url', '/staff/missing-items/' || NEW.area
    );

    INSERT INTO public.notifications (
      staff_id, guest_id, title, body, category, notification_type, data, created_by, sent_via, sent_at
    )
    SELECT sid, NULL, v_title, v_body, 'staff', 'missing_item_resolved', v_payload, NEW.resolved_by_staff_id, 'both', now()
    FROM unnest(v_staff_ids) sid;

    PERFORM net.http_post(
      url := 'https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/send-expo-push',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'staffIds', to_jsonb(v_staff_ids),
        'title', v_title,
        'body', v_body,
        'data', v_payload
      ),
      timeout_milliseconds := 10000
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.missing_item_reports_notify_resolve()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_ids uuid[];
  v_actor_name text;
  v_title text;
  v_body text;
  v_payload jsonb;
  v_area_label text;
BEGIN
  IF TG_OP <> 'UPDATE' OR OLD.status <> 'open' OR NEW.status <> 'resolved' THEN
    RETURN NEW;
  END IF;

  SELECT array_agg(s.id)
  INTO v_staff_ids
  FROM public.staff s
  WHERE s.organization_id = NEW.organization_id
    AND s.is_active = true
    AND s.deleted_at IS NULL;

  IF v_staff_ids IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT st.full_name INTO v_actor_name
  FROM public.staff st
  WHERE st.id = NEW.resolved_by_staff_id
  LIMIT 1;

  v_area_label := CASE NEW.area WHEN 'kitchen' THEN 'Mutfak' ELSE 'Otel' END;
  v_title := 'Eksik Var (' || v_area_label || ') tamamlandi';
  v_body := COALESCE(NULLIF(trim(v_actor_name), ''), 'Bir personel') || ' ' || NEW.item_count::text || ' kalemlik eksigi giderildi.';

  v_payload := jsonb_build_object(
    'kind', 'missing_item_report_resolved',
    'missingItemReportId', NEW.id::text,
    'area', NEW.area,
    'url', '/staff/missing-items/' || NEW.area
  );

  INSERT INTO public.notifications (
    staff_id, guest_id, title, body, category, notification_type, data, created_by, sent_via, sent_at
  )
  SELECT sid, NULL, v_title, v_body, 'staff', 'missing_item_report_resolved', v_payload, NEW.resolved_by_staff_id, 'both', now()
  FROM unnest(v_staff_ids) sid;

  PERFORM net.http_post(
    url := 'https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/send-expo-push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'staffIds', to_jsonb(v_staff_ids),
      'title', v_title,
      'body', v_body,
      'data', v_payload
    ),
    timeout_milliseconds := 10000
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_missing_item_reports_notify_resolve ON public.missing_item_reports;
CREATE TRIGGER trg_missing_item_reports_notify_resolve
  AFTER UPDATE OF status ON public.missing_item_reports
  FOR EACH ROW EXECUTE FUNCTION public.missing_item_reports_notify_resolve();

ALTER TABLE public.missing_item_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "missing_item_reports_select_staff_org" ON public.missing_item_reports;
CREATE POLICY "missing_item_reports_select_staff_org"
  ON public.missing_item_reports FOR SELECT TO authenticated
  USING (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS "missing_item_reports_insert_staff_org" ON public.missing_item_reports;
CREATE POLICY "missing_item_reports_insert_staff_org"
  ON public.missing_item_reports FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND created_by_staff_id = public.current_staff_id()
  );

DROP POLICY IF EXISTS "missing_item_reports_update_staff_org" ON public.missing_item_reports;
CREATE POLICY "missing_item_reports_update_staff_org"
  ON public.missing_item_reports FOR UPDATE TO authenticated
  USING (organization_id = public.current_staff_organization_id())
  WITH CHECK (organization_id = public.current_staff_organization_id());

COMMIT;
