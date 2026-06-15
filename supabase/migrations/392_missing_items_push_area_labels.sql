-- Eksik bildirim başlıkları: push'ta alan adı önce (Mutfak / Otel), karışıklık olmasın.

BEGIN;

CREATE OR REPLACE FUNCTION public.missing_item_notify_area_label(p_area text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN p_area = 'kitchen' THEN 'Mutfak' ELSE 'Otel' END;
$$;

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

  v_area_label := public.missing_item_notify_area_label(v_report.area);
  v_title := v_area_label || ' eksik: ' || v_report.item_count::text || ' kalem';

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
BEGIN
  IF TG_OP = 'INSERT' AND NEW.report_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'open' AND NEW.status = 'resolved' AND NEW.report_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NOT (OLD.status = 'open' AND NEW.status = 'resolved') THEN
    RETURN NEW;
  END IF;

  IF NEW.area = 'kitchen' THEN
    v_staff_ids := public.staff_ids_kitchen_shortage_notify(NEW.organization_id);
  ELSE
    SELECT array_agg(s.id)
    INTO v_staff_ids
    FROM public.staff s
    WHERE s.organization_id = NEW.organization_id
      AND s.is_active = true
      AND s.deleted_at IS NULL;
  END IF;

  IF v_staff_ids IS NULL OR array_length(v_staff_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT st.full_name INTO v_actor_name
  FROM public.staff st
  WHERE st.id = COALESCE(NEW.resolved_by_staff_id, NEW.created_by_staff_id)
  LIMIT 1;

  v_area_label := public.missing_item_notify_area_label(NEW.area);

  IF TG_OP = 'INSERT' THEN
    v_title := v_area_label || ' eksik: ' || NEW.title;
    v_body := COALESCE(NULLIF(trim(NEW.description), ''), 'Yeni eksik kaydi olusturuldu.');
    v_payload := jsonb_build_object(
      'kind', 'missing_item_opened',
      'missingItemId', NEW.id::text,
      'area', NEW.area,
      'url', CASE
        WHEN NEW.area = 'kitchen' THEN '/staff/kitchen-ops/shortages'
        ELSE '/staff/missing-items/' || NEW.area
      END
    );

    INSERT INTO public.notifications (
      staff_id, guest_id, title, body, category, notification_type, data, created_by, sent_via, sent_at
    )
    SELECT sid, NULL, v_title, v_body, 'staff', 'missing_item_opened', v_payload, NEW.created_by_staff_id, 'both', now()
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
      RAISE NOTICE 'missing_item_opened push skipped: %', SQLERRM;
    END;

    RETURN NEW;
  END IF;

  v_title := v_area_label || ' eksik giderildi: ' || NEW.title;
  v_body := COALESCE(NULLIF(trim(v_actor_name), ''), 'Bir personel') || ' eksigi giderildi olarak isaretledi.';
  v_payload := jsonb_build_object(
    'kind', 'missing_item_resolved',
    'missingItemId', NEW.id::text,
    'area', NEW.area,
    'url', CASE
      WHEN NEW.area = 'kitchen' THEN '/staff/kitchen-ops/shortages'
      ELSE '/staff/missing-items/' || NEW.area
    END
  );

  INSERT INTO public.notifications (
    staff_id, guest_id, title, body, category, notification_type, data, created_by, sent_via, sent_at
  )
  SELECT sid, NULL, v_title, v_body, 'staff', 'missing_item_resolved', v_payload, NEW.resolved_by_staff_id, 'both', now()
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
    RAISE NOTICE 'missing_item_resolved push skipped: %', SQLERRM;
  END;

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
  v_items text;
  v_url text;
BEGIN
  IF TG_OP <> 'UPDATE' OR OLD.status <> 'open' OR NEW.status <> 'resolved' THEN
    RETURN NEW;
  END IF;

  IF NEW.area = 'kitchen' THEN
    v_staff_ids := public.staff_ids_kitchen_shortage_notify(NEW.organization_id);
    v_url := '/staff/kitchen-ops/shortages';
  ELSE
    SELECT array_agg(s.id)
    INTO v_staff_ids
    FROM public.staff s
    WHERE s.organization_id = NEW.organization_id
      AND s.is_active = true
      AND s.deleted_at IS NULL;
    v_url := '/staff/missing-items/' || NEW.area;
  END IF;

  IF v_staff_ids IS NULL OR array_length(v_staff_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT st.full_name INTO v_actor_name
  FROM public.staff st
  WHERE st.id = NEW.resolved_by_staff_id
  LIMIT 1;

  SELECT string_agg('• ' || mi.title, E'\n' ORDER BY mi.created_at)
  INTO v_items
  FROM public.missing_items mi
  WHERE mi.report_id = NEW.id;

  v_area_label := public.missing_item_notify_area_label(NEW.area);
  v_title := v_area_label || ' eksik tamamlandi: ' || NEW.item_count::text || ' kalem';
  v_body := COALESCE(NULLIF(trim(v_actor_name), ''), 'Bir personel') || ' eksik listesini giderildi olarak isaretledi.';
  IF v_items IS NOT NULL AND length(trim(v_items)) > 0 THEN
    v_body := v_body || E'\n\n' || v_items;
  END IF;

  v_payload := jsonb_build_object(
    'kind', 'missing_item_report_resolved',
    'missingItemReportId', NEW.id::text,
    'area', NEW.area,
    'url', v_url
  );

  INSERT INTO public.notifications (
    staff_id, guest_id, title, body, category, notification_type, data, created_by, sent_via, sent_at
  )
  SELECT sid, NULL, v_title, v_body, 'staff', 'missing_item_report_resolved', v_payload, NEW.resolved_by_staff_id, 'both', now()
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
    RAISE NOTICE 'missing_item_report_resolved push skipped: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_missing_items_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report record;
  v_row record;
  v_staff_ids uuid[];
  v_title text;
  v_body text;
  v_payload jsonb;
  v_items text;
  v_area_label text;
  v_url text;
  v_sent integer := 0;
BEGIN
  FOR v_report IN
    SELECT
      r.id,
      r.organization_id,
      r.area,
      r.item_count,
      r.note,
      r.created_by_staff_id,
      max(coalesce(mi.last_reminded_at, mi.created_at)) AS last_touch
    FROM public.missing_item_reports r
    JOIN public.missing_items mi ON mi.report_id = r.id AND mi.status = 'open'
    WHERE r.status = 'open'
    GROUP BY r.id
    HAVING max(coalesce(mi.last_reminded_at, mi.created_at)) <= now() - interval '5 hours'
    ORDER BY min(mi.created_at) ASC
    LIMIT 50
  LOOP
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
      CONTINUE;
    END IF;

    SELECT string_agg('• ' || mi.title, E'\n' ORDER BY mi.created_at)
    INTO v_items
    FROM public.missing_items mi
    WHERE mi.report_id = v_report.id AND mi.status = 'open';

    v_area_label := public.missing_item_notify_area_label(v_report.area);
    v_title := v_area_label || ' eksik hatirlatma: ' || v_report.item_count::text || ' kalem';
    v_body := COALESCE(v_items, 'Acik eksik listesi hala cozulmedi.');
    IF v_report.note IS NOT NULL AND length(trim(v_report.note)) > 0 THEN
      v_body := v_body || E'\n\nNot: ' || v_report.note;
    END IF;

    v_payload := jsonb_build_object(
      'kind', 'missing_item_reminder',
      'missingItemReportId', v_report.id::text,
      'area', v_report.area,
      'url', v_url
    );

    INSERT INTO public.notifications (
      staff_id, guest_id, title, body, category, notification_type, data, created_by, sent_via, sent_at
    )
    SELECT sid, NULL, v_title, v_body, 'staff', 'missing_item_reminder', v_payload, v_report.created_by_staff_id, 'both', now()
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
      RAISE NOTICE 'missing_item_reminder push skipped: %', SQLERRM;
    END;

    UPDATE public.missing_items
    SET
      last_reminded_at = now(),
      reminder_count = reminder_count + 1
    WHERE report_id = v_report.id AND status = 'open';

    v_sent := v_sent + 1;
  END LOOP;

  FOR v_row IN
    SELECT mi.id, mi.title, mi.description, mi.organization_id, mi.area, mi.created_by_staff_id
    FROM public.missing_items mi
    WHERE mi.status = 'open'
      AND mi.report_id IS NULL
      AND coalesce(mi.last_reminded_at, mi.created_at) <= now() - interval '5 hours'
    ORDER BY mi.created_at ASC
    LIMIT 100
  LOOP
    IF v_row.area = 'kitchen' THEN
      v_staff_ids := public.staff_ids_kitchen_shortage_notify(v_row.organization_id);
      v_url := '/staff/kitchen-ops/shortages';
    ELSE
      SELECT array_agg(s.id)
      INTO v_staff_ids
      FROM public.staff s
      WHERE s.organization_id = v_row.organization_id
        AND s.is_active = true
        AND s.deleted_at IS NULL;
      v_url := '/staff/missing-items/' || v_row.area;
    END IF;

    IF v_staff_ids IS NULL OR array_length(v_staff_ids, 1) IS NULL THEN
      CONTINUE;
    END IF;

    v_area_label := public.missing_item_notify_area_label(v_row.area);
    v_title := v_area_label || ' eksik hatirlatma: ' || v_row.title;
    v_body := COALESCE(NULLIF(trim(v_row.description), ''), 'Bu eksik kaydi hala acik durumda.');

    v_payload := jsonb_build_object(
      'kind', 'missing_item_reminder',
      'missingItemId', v_row.id::text,
      'area', v_row.area,
      'url', v_url
    );

    INSERT INTO public.notifications (
      staff_id, guest_id, title, body, category, notification_type, data, created_by, sent_via, sent_at
    )
    SELECT sid, NULL, v_title, v_body, 'staff', 'missing_item_reminder', v_payload, v_row.created_by_staff_id, 'both', now()
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
      RAISE NOTICE 'missing_item_reminder legacy push skipped: %', SQLERRM;
    END;

    UPDATE public.missing_items
    SET
      last_reminded_at = now(),
      reminder_count = reminder_count + 1
    WHERE id = v_row.id;

    v_sent := v_sent + 1;
  END LOOP;

  RETURN v_sent;
END;
$$;

COMMIT;
