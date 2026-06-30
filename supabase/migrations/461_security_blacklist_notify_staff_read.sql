BEGIN;

-- Kara liste: tüm org personeli okuyabilir; ekleme/güncelleme yalnızca admin.
-- Yeni kayıtta org personeline in-app + push bildirim.

DROP POLICY IF EXISTS security_blacklist_select ON public.security_blacklist_entries;
CREATE POLICY security_blacklist_select ON public.security_blacklist_entries
  FOR SELECT TO authenticated
  USING (organization_id = public.current_staff_organization_id());

CREATE OR REPLACE FUNCTION public.security_blacklist_entries_notify_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_ids uuid[];
  v_title text;
  v_body text;
  v_payload jsonb;
  v_full_name text;
BEGIN
  v_full_name := trim(NEW.first_name || ' ' || NEW.last_name);

  SELECT array_agg(s.id)
  INTO v_staff_ids
  FROM public.staff s
  WHERE s.organization_id = NEW.organization_id
    AND s.is_active = true
    AND s.deleted_at IS NULL
    AND s.id IS DISTINCT FROM NEW.added_by_staff_id;

  IF v_staff_ids IS NULL OR array_length(v_staff_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  v_title := 'Kara liste — ' || NEW.reference_code;
  v_body := v_full_name || ': ' || left(trim(NEW.incident_description), 120);
  v_payload := jsonb_build_object(
    'kind', 'security_blacklist_added',
    'blacklistEntryId', NEW.id::text,
    'referenceCode', NEW.reference_code,
    'url', '/staff/blacklist/' || NEW.id::text
  );

  INSERT INTO public.notifications (
    staff_id, guest_id, title, body, category, notification_type, data, created_by, sent_via, sent_at
  )
  SELECT sid, NULL, v_title, v_body, 'staff', 'security_blacklist_added', v_payload, NEW.added_by_staff_id, 'both', now()
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

DROP TRIGGER IF EXISTS trg_security_blacklist_entries_notify_insert ON public.security_blacklist_entries;
CREATE TRIGGER trg_security_blacklist_entries_notify_insert
  AFTER INSERT ON public.security_blacklist_entries
  FOR EACH ROW EXECUTE FUNCTION public.security_blacklist_entries_notify_insert();

COMMIT;
