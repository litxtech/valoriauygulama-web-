-- Mutfak hasılat bildirimi: admin panelinden seçilen personele (personel bildirimi gibi)

BEGIN;

ALTER TABLE public.kitchen_ops_settings
  ADD COLUMN IF NOT EXISTS revenue_notify_staff_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.kitchen_ops_settings.revenue_notify_staff_ids IS
  'Hasılat girildiğinde bildirim alacak personel (işletme bazlı seçim). Boşsa bildirim gönderilmez.';

CREATE OR REPLACE FUNCTION public.staff_ids_kitchen_revenue_notify(p_org_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT s.id), ARRAY[]::uuid[])
  FROM public.kitchen_ops_settings kos
  JOIN public.staff s ON s.id = ANY (kos.revenue_notify_staff_ids)
  WHERE kos.organization_id = p_org_id
    AND s.organization_id = p_org_id
    AND s.is_active = true
    AND s.deleted_at IS NULL;
$$;

COMMENT ON FUNCTION public.staff_ids_kitchen_revenue_notify(uuid) IS
  'Admin panelinde seçilen mutfak hasılat bildirim alıcıları (aktif personel).';

CREATE OR REPLACE FUNCTION public.notify_kitchen_finance_entry(
  p_kind text,
  p_record_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_created_by uuid;
  v_amount numeric;
  v_description text;
  v_category text;
  v_entry_date date;
  v_creator_name text;
  v_staff_ids uuid[];
  v_filtered uuid[];
  v_title text;
  v_body text;
  v_notification_type text;
  v_url text;
  v_payload jsonb;
BEGIN
  IF p_kind = 'revenue' THEN
    SELECT r.organization_id, r.created_by, r.amount, r.description, r.entry_date
    INTO v_org_id, v_created_by, v_amount, v_description, v_entry_date
    FROM public.kitchen_revenues r
    WHERE r.id = p_record_id;
    v_notification_type := 'kitchen_revenue_entry';
    v_url := '/staff/kitchen-ops/revenue';
    v_title := 'Yeni hasılat kaydı';
    v_body := coalesce(v_description, 'Hasılat') || ' · ' ||
      trim(to_char(coalesce(v_amount, 0), 'FM999G999G990D00')) || ' ₺';
  ELSIF p_kind = 'expense' THEN
    SELECT e.organization_id, e.created_by, e.amount, e.description, e.category, e.entry_date
    INTO v_org_id, v_created_by, v_amount, v_description, v_category, v_entry_date
    FROM public.kitchen_expenses e
    WHERE e.id = p_record_id;
    v_notification_type := 'kitchen_expense_entry';
    v_url := '/staff/kitchen-ops/expenses';
    v_title := 'Yeni gider kaydı';
    v_body := coalesce(nullif(trim(v_category), ''), nullif(trim(v_description), ''), 'Gider') || ' · ' ||
      trim(to_char(coalesce(v_amount, 0), 'FM999G999G990D00')) || ' ₺';
  ELSE
    RETURN;
  END IF;

  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  SELECT coalesce(s.full_name, s.email, 'Personel')
  INTO v_creator_name
  FROM public.staff s
  WHERE s.id = v_created_by;

  IF p_kind = 'revenue' THEN
    v_staff_ids := public.staff_ids_kitchen_revenue_notify(v_org_id);
  ELSE
    v_staff_ids := public.staff_ids_kitchen_ops_notify(v_org_id);
  END IF;

  IF v_created_by IS NOT NULL THEN
    v_staff_ids := array_remove(v_staff_ids, v_created_by);
  END IF;

  IF v_staff_ids IS NULL OR array_length(v_staff_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  SELECT array_agg(f.staff_id)
  INTO v_filtered
  FROM public.filter_staff_notification_recipients(v_staff_ids, v_notification_type) f;

  IF v_filtered IS NULL OR array_length(v_filtered, 1) IS NULL THEN
    RETURN;
  END IF;

  IF v_creator_name IS NOT NULL AND length(trim(v_creator_name)) > 0 THEN
    v_body := v_body || E'\n' || 'Giren: ' || v_creator_name;
  END IF;

  v_payload := jsonb_build_object(
    'kind', v_notification_type,
    'notificationType', v_notification_type,
    'notification_type', v_notification_type,
    'feature_key', 'kitchen_finance',
    'url', v_url,
    'screen', v_url,
    'entryDate', v_entry_date::text,
    'recordId', p_record_id::text
  );

  INSERT INTO public.notifications (
    staff_id, guest_id, title, body, category, notification_type, data, created_by, sent_via, sent_at
  )
  SELECT sid, NULL, v_title, v_body, 'staff', v_notification_type, v_payload, v_created_by, 'both', now()
  FROM unnest(v_filtered) sid;

  PERFORM net.http_post(
    url := 'https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/send-expo-push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'staffIds', to_jsonb(v_filtered),
      'title', v_title,
      'body', left(v_body, 240),
      'data', v_payload
    ),
    timeout_milliseconds := 10000
  );
END;
$$;

COMMIT;
