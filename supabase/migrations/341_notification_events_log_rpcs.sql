BEGIN;

ALTER TABLE public.notification_events
  ADD COLUMN IF NOT EXISTS notification_id uuid,
  ADD COLUMN IF NOT EXISTS delivery_group_id text,
  ADD COLUMN IF NOT EXISTS staff_display_name text;

CREATE INDEX IF NOT EXISTS idx_notification_events_feature_created
  ON public.notification_events (organization_id, feature_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_events_user
  ON public.notification_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_events_delivery_group
  ON public.notification_events (delivery_group_id)
  WHERE delivery_group_id IS NOT NULL;

-- Edge function / servis: toplu push öncesi log satırları
CREATE OR REPLACE FUNCTION public.insert_notification_events_batch(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_ids jsonb := '[]'::jsonb;
  v_id uuid;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN '[]'::jsonb;
  END IF;
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO public.notification_events (
      organization_id,
      user_id,
      user_kind,
      feature_key,
      notification_title,
      notification_body,
      sound_key,
      sound_file_name,
      delivery_status,
      delivery_group_id,
      notification_id,
      staff_display_name,
      metadata
    )
    VALUES (
      (v_row->>'organization_id')::uuid,
      (v_row->>'user_id')::uuid,
      nullif(v_row->>'user_kind', ''),
      nullif(v_row->>'feature_key', ''),
      nullif(v_row->>'notification_title', ''),
      nullif(v_row->>'notification_body', ''),
      nullif(v_row->>'sound_key', ''),
      nullif(v_row->>'sound_file_name', ''),
      coalesce(nullif(v_row->>'delivery_status', ''), 'sent'),
      nullif(v_row->>'delivery_group_id', ''),
      (v_row->>'notification_id')::uuid,
      nullif(v_row->>'staff_display_name', ''),
      coalesce(v_row->'metadata', '{}'::jsonb)
    )
    RETURNING id INTO v_id;
    v_ids := v_ids || jsonb_build_array(v_id::text);
  END LOOP;
  RETURN v_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_notification_events_batch(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_notification_events_batch(jsonb) TO service_role;

-- Admin liste + özet
CREATE OR REPLACE FUNCTION public.list_admin_notification_events(
  p_organization_id uuid,
  p_feature_key text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  user_id uuid,
  user_kind text,
  feature_key text,
  notification_title text,
  notification_body text,
  sound_key text,
  sound_file_name text,
  delivery_status text,
  opened_at timestamptz,
  acknowledged_at timestamptz,
  delivery_group_id text,
  staff_display_name text,
  staff_name text,
  created_at timestamptz,
  metadata jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.organization_id,
    e.user_id,
    e.user_kind,
    e.feature_key,
    e.notification_title,
    e.notification_body,
    e.sound_key,
    e.sound_file_name,
    e.delivery_status,
    e.opened_at,
    e.acknowledged_at,
    e.delivery_group_id,
    e.staff_display_name,
    coalesce(
      e.staff_display_name,
      nullif(trim(s.full_name), '')
    ) AS staff_name,
    e.created_at,
    e.metadata
  FROM public.notification_events e
  LEFT JOIN public.staff s ON s.id = e.user_id AND e.user_kind = 'staff'
  WHERE public.current_user_is_staff_admin()
    AND (p_organization_id IS NULL OR e.organization_id = p_organization_id)
    AND (p_feature_key IS NULL OR p_feature_key = '' OR e.feature_key = p_feature_key)
  ORDER BY e.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 100), 500))
  OFFSET greatest(0, coalesce(p_offset, 0));
$$;

REVOKE ALL ON FUNCTION public.list_admin_notification_events(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_admin_notification_events(uuid, text, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_notification_events_summary(
  p_organization_id uuid,
  p_hours integer DEFAULT 24
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total', count(*)::int,
    'opened', count(*) FILTER (WHERE opened_at IS NOT NULL)::int,
    'acknowledged', count(*) FILTER (WHERE acknowledged_at IS NOT NULL)::int,
    'pending_ack', count(*) FILTER (
      WHERE feature_key = 'emergency_alert' AND acknowledged_at IS NULL
    )::int,
    'emergency', count(*) FILTER (WHERE feature_key = 'emergency_alert')::int
  )
  FROM public.notification_events e
  WHERE public.current_user_is_staff_admin()
    AND (p_organization_id IS NULL OR e.organization_id = p_organization_id)
    AND e.created_at >= now() - make_interval(hours => greatest(1, coalesce(p_hours, 24)));
$$;

REVOKE ALL ON FUNCTION public.admin_notification_events_summary(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_notification_events_summary(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_notification_event_opened(p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_event_id IS NULL THEN RETURN false; END IF;
  UPDATE public.notification_events
  SET
    opened_at = coalesce(opened_at, now()),
    delivery_status = CASE
      WHEN delivery_status IN ('sent', 'delivered') THEN 'opened'
      ELSE delivery_status
    END
  WHERE id = p_event_id
    AND (
      user_id = public.current_staff_id()
      OR public.current_user_is_staff_admin()
    );
  RETURN found;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_notification_event_opened(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_notification_event_opened(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_notification_event_acknowledged(
  p_event_id uuid,
  p_note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_event_id IS NULL THEN RETURN false; END IF;
  UPDATE public.notification_events
  SET
    acknowledged_at = coalesce(acknowledged_at, now()),
    opened_at = coalesce(opened_at, now()),
    delivery_status = 'acknowledged',
    metadata = metadata || CASE
      WHEN p_note IS NOT NULL AND trim(p_note) <> '' THEN jsonb_build_object('ack_note', trim(p_note))
      ELSE '{}'::jsonb
    END
  WHERE id = p_event_id
    AND user_id = public.current_staff_id();
  RETURN found;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_notification_event_acknowledged(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_notification_event_acknowledged(uuid, text) TO authenticated;

COMMIT;
