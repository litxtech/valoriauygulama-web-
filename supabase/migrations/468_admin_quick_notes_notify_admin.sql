BEGIN;

-- Personel (admin olmayan) not oluşturduğunda org yöneticilerine in-app + push bildirim.

CREATE OR REPLACE FUNCTION public.admin_quick_notes_notify_admins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator record;
  v_admin_ids uuid[];
  v_title text;
  v_body text;
  v_preview text;
  v_payload jsonb;
  v_tag_label text;
BEGIN
  SELECT s.role, coalesce(nullif(trim(s.full_name), ''), 'Personel') AS full_name
  INTO v_creator
  FROM public.staff s
  WHERE s.id = NEW.created_by_staff_id;

  IF v_creator.role IS NULL OR v_creator.role = 'admin' THEN
    RETURN NEW;
  END IF;

  SELECT array_agg(s.id)
  INTO v_admin_ids
  FROM public.staff s
  WHERE s.organization_id = NEW.organization_id
    AND s.role = 'admin'
    AND s.is_active = true
    AND s.deleted_at IS NULL
    AND s.id IS DISTINCT FROM NEW.created_by_staff_id;

  IF v_admin_ids IS NULL OR array_length(v_admin_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  v_tag_label := CASE NEW.tag
    WHEN 'urgent' THEN 'Acil'
    WHEN 'room' THEN 'Oda'
    WHEN 'staff' THEN 'Personel'
    WHEN 'guest' THEN 'Misafir'
    ELSE 'Genel'
  END;

  v_preview := coalesce(
    nullif(trim(NEW.title), ''),
    nullif(left(trim(NEW.body_text), 100), ''),
    'Not'
  );

  IF NEW.room_label IS NOT NULL AND trim(NEW.room_label) <> '' THEN
    v_preview := v_preview || ' · ' || trim(NEW.room_label);
  END IF;

  IF NEW.tag = 'urgent' THEN
    v_title := 'Acil personel notu — ' || NEW.note_number;
  ELSE
    v_title := 'Yeni personel notu — ' || NEW.note_number;
  END IF;

  v_body := v_creator.full_name || ' (' || v_tag_label || '): ' || v_preview;

  v_payload := jsonb_build_object(
    'kind', 'staff_quick_note',
    'notificationType', 'staff_quick_note',
    'notification_type', 'staff_quick_note',
    'noteId', NEW.id::text,
    'noteNumber', NEW.note_number,
    'tag', NEW.tag,
    'url', '/admin/notes/' || NEW.id::text
  );

  INSERT INTO public.notifications (
    staff_id, guest_id, title, body, category, notification_type, data, created_by, sent_via, sent_at
  )
  SELECT sid, NULL, v_title, v_body, 'admin', 'staff_quick_note', v_payload, NEW.created_by_staff_id, 'both', now()
  FROM unnest(v_admin_ids) AS sid;

  BEGIN
    PERFORM net.http_post(
      url := 'https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/send-expo-push',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'staffIds', to_jsonb(v_admin_ids),
        'title', v_title,
        'body', left(v_body, 240),
        'data', v_payload
      ),
      timeout_milliseconds := 10000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'admin_quick_notes_notify_admins push skipped: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_quick_notes_notify_admins ON public.admin_quick_notes;
CREATE TRIGGER trg_admin_quick_notes_notify_admins
  AFTER INSERT ON public.admin_quick_notes
  FOR EACH ROW EXECUTE FUNCTION public.admin_quick_notes_notify_admins();

COMMENT ON FUNCTION public.admin_quick_notes_notify_admins() IS
  'Personel notu oluşturulunca org adminlerine bildirim gönderir (admin notları hariç).';

COMMIT;
