-- Mutfak eksik listesi onayında yalnızca mutfak personeli ve yöneticilere bildirim; mutfak modülü URL.

BEGIN;

CREATE OR REPLACE FUNCTION public.staff_ids_kitchen_shortage_notify(p_org_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT s.id), ARRAY[]::uuid[])
  FROM public.staff s
  WHERE s.organization_id = p_org_id
    AND s.is_active = true
    AND s.deleted_at IS NULL
    AND (
      EXISTS (SELECT 1 FROM public.admin_auth_ids a WHERE a.auth_id = s.auth_id)
      OR s.role = 'admin'
      OR (s.app_permissions->>'gorev_ata')::boolean IS TRUE
      OR (s.app_permissions->>'mutfak_operasyon')::boolean IS TRUE
      OR lower(coalesce(s.department, '')) IN (
        'kitchen', 'kitchen_staff', 'mutfak', 'chef', 'head_chef', 'pastry'
      )
    );
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

COMMIT;
