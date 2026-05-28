BEGIN;

ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS check_in_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contract_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contract_approved_at timestamptz;

CREATE TABLE IF NOT EXISTS public.guest_contract_operation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_acceptance_id uuid NOT NULL UNIQUE REFERENCES public.contract_acceptances(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  organization_id uuid,
  event_type text NOT NULL DEFAULT 'guest_contract_approved',
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guest_contract_operation_events_org_created
  ON public.guest_contract_operation_events(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.operations_daily_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  operation_date date NOT NULL DEFAULT CURRENT_DATE,
  source_event_id uuid REFERENCES public.guest_contract_operation_events(id) ON DELETE SET NULL,
  operation_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operations_daily_activity_log_org_date
  ON public.operations_daily_activity_log(organization_id, operation_date DESC);

CREATE TABLE IF NOT EXISTS public.night_operation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  source_event_id uuid REFERENCES public.guest_contract_operation_events(id) ON DELETE SET NULL,
  queue_type text NOT NULL DEFAULT 'guest_contract_approved',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_night_operation_queue_status_created
  ON public.night_operation_queue(status, created_at);

ALTER TABLE public.guest_contract_operation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations_daily_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.night_operation_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guest_contract_operation_events_select_auth" ON public.guest_contract_operation_events;
CREATE POLICY "guest_contract_operation_events_select_auth"
ON public.guest_contract_operation_events
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "operations_daily_activity_log_select_auth" ON public.operations_daily_activity_log;
CREATE POLICY "operations_daily_activity_log_select_auth"
ON public.operations_daily_activity_log
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "night_operation_queue_select_auth" ON public.night_operation_queue;
CREATE POLICY "night_operation_queue_select_auth"
ON public.night_operation_queue
FOR SELECT TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.process_guest_contract_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest record;
  v_event_id uuid;
  v_title text;
  v_body text;
  v_payload jsonb;
  v_staff_ids uuid[];
  v_filtered_staff_ids uuid[];
  v_hk_task_title text;
  v_hk_task_body text;
  v_total_people int;
  v_base_url text;
BEGIN
  IF NEW.guest_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    g.id,
    g.full_name,
    g.organization_id,
    g.room_id,
    g.adults,
    g.children,
    r.room_number
  INTO v_guest
  FROM public.guests g
  LEFT JOIN public.rooms r ON r.id = g.room_id
  WHERE g.id = NEW.guest_id
  LIMIT 1;

  IF v_guest.id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.guest_contract_operation_events (
    contract_acceptance_id,
    guest_id,
    room_id,
    organization_id,
    event_type,
    event_payload
  )
  VALUES (
    NEW.id,
    NEW.guest_id,
    COALESCE(NEW.room_id, v_guest.room_id),
    v_guest.organization_id,
    'guest_contract_approved',
    jsonb_build_object(
      'contractAcceptanceId', NEW.id,
      'guestId', NEW.guest_id,
      'roomId', COALESCE(NEW.room_id, v_guest.room_id),
      'acceptedAt', NEW.accepted_at,
      'contractLang', NEW.contract_lang
    )
  )
  ON CONFLICT (contract_acceptance_id) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.guests
  SET
    check_in_completed = true,
    contract_approved = true,
    contract_approved_at = COALESCE(contract_approved_at, NEW.accepted_at),
    status = CASE WHEN status = 'pending' THEN 'checked_in' ELSE status END,
    updated_at = now()
  WHERE id = NEW.guest_id;

  IF COALESCE(NEW.room_id, v_guest.room_id) IS NOT NULL THEN
    UPDATE public.rooms
    SET status = 'occupied', updated_at = now()
    WHERE id = COALESCE(NEW.room_id, v_guest.room_id);
  END IF;

  v_total_people := GREATEST(1, COALESCE(v_guest.adults, 1) + COALESCE(v_guest.children, 0));

  INSERT INTO public.operations_daily_activity_log (
    organization_id,
    operation_date,
    source_event_id,
    operation_type,
    details
  )
  VALUES (
    v_guest.organization_id,
    CURRENT_DATE,
    v_event_id,
    'guest_contract_approved',
    jsonb_build_object(
      'guestId', NEW.guest_id,
      'guestName', COALESCE(v_guest.full_name, 'Misafir'),
      'roomId', COALESCE(NEW.room_id, v_guest.room_id),
      'roomNumber', v_guest.room_number,
      'breakfastPersonDelta', v_total_people
    )
  );

  INSERT INTO public.night_operation_queue (
    organization_id,
    source_event_id,
    queue_type,
    payload
  )
  VALUES (
    v_guest.organization_id,
    v_event_id,
    'guest_contract_approved',
    jsonb_build_object(
      'guestId', NEW.guest_id,
      'roomId', COALESCE(NEW.room_id, v_guest.room_id),
      'roomNumber', v_guest.room_number,
      'acceptedAt', NEW.accepted_at
    )
  );

  v_hk_task_title := 'Check-in oda hazirlik kontrolu';
  v_hk_task_body := COALESCE(v_guest.full_name, 'Misafir') || ' sozlesmeyi onayladi. Oda ' ||
    COALESCE(v_guest.room_number, '-') || ' icin housekeeping final hazirlik kontrolu yapin.';

  INSERT INTO public.staff_assignments (
    title,
    body,
    task_type,
    priority,
    status,
    assigned_staff_id,
    created_by_staff_id,
    room_ids,
    due_at
  )
  SELECT
    v_hk_task_title,
    v_hk_task_body,
    'housekeeping',
    'high',
    'pending',
    s.id,
    NULL,
    CASE WHEN COALESCE(NEW.room_id, v_guest.room_id) IS NULL THEN '{}'::uuid[] ELSE ARRAY[COALESCE(NEW.room_id, v_guest.room_id)] END,
    now() + interval '30 minutes'
  FROM public.staff s
  WHERE s.is_active = true
    AND s.deleted_at IS NULL
    AND s.organization_id IS NOT DISTINCT FROM v_guest.organization_id
    AND s.role = 'housekeeping';

  v_title := 'Yeni Konaklama Onayi';
  v_body := COALESCE(v_guest.full_name, 'Misafir') || ' sozlesmeyi onayladi. Oda ' ||
    COALESCE(v_guest.room_number, '-') || ' operasyon akisi baslatildi.';
  v_payload := jsonb_build_object(
    'notificationType', 'guest_contract_approved',
    'eventType', 'guest_contract_approved',
    'screen', '/admin/contracts/acceptances',
    'url', '/admin/contracts/acceptances',
    'guestId', NEW.guest_id,
    'roomId', COALESCE(NEW.room_id, v_guest.room_id),
    'roomNumber', v_guest.room_number
  );

  SELECT array_agg(s.id)
  INTO v_staff_ids
  FROM public.staff s
  WHERE s.is_active = true
    AND s.deleted_at IS NULL
    AND s.organization_id IS NOT DISTINCT FROM v_guest.organization_id
    AND (
      s.role IN ('admin', 'reception_chief', 'receptionist', 'housekeeping')
      OR s.department = 'kitchen'
    );

  IF v_staff_ids IS NOT NULL AND array_length(v_staff_ids, 1) IS NOT NULL THEN
    SELECT array_agg(f.staff_id)
    INTO v_filtered_staff_ids
    FROM public.filter_staff_notification_recipients(v_staff_ids, 'guest_contract_approved') f;

    IF v_filtered_staff_ids IS NOT NULL AND array_length(v_filtered_staff_ids, 1) IS NOT NULL THEN
      INSERT INTO public.notifications (
        staff_id, guest_id, title, body, category, notification_type, data, created_by, sent_via, sent_at
      )
      SELECT sid, NULL, v_title, v_body, 'staff', 'guest_contract_approved', v_payload, NULL, 'both', now()
      FROM unnest(v_filtered_staff_ids) AS sid;

      v_base_url := NULLIF(current_setting('app.settings.supabase_url', true), '');
      IF v_base_url IS NULL THEN
        v_base_url := 'https://sbydlcujsiqmifybqzsi.supabase.co';
      END IF;

      PERFORM net.http_post(
        url := v_base_url || '/functions/v1/send-expo-push',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'staffIds', to_jsonb(v_filtered_staff_ids),
          'title', v_title,
          'body', v_body,
          'data', v_payload
        ),
        timeout_milliseconds := 10000
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_acceptance_operations ON public.contract_acceptances;
CREATE TRIGGER trg_contract_acceptance_operations
  AFTER INSERT ON public.contract_acceptances
  FOR EACH ROW
  EXECUTE FUNCTION public.process_guest_contract_acceptance();

COMMIT;
