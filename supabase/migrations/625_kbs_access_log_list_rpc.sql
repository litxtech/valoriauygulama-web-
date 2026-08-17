-- Kimlik erişim logları: public RPC ile okuma (ops Accept-Profile / RLS / uzun URL sorunları).

BEGIN;

CREATE OR REPLACE FUNCTION public.caller_can_read_kbs_document_access_logs()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, ops
AS $$
  SELECT
    public.kbs_web_can_view_all_hotels()
    OR public.staff_has_app_permission('id_capture')
    OR public.staff_has_app_permission('super_admin')
    OR COALESCE(public.current_user_is_staff_admin(), false)
    OR EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.is_active = true
        AND s.deleted_at IS NULL
        AND s.role IN ('admin', 'manager', 'reception_chief')
    );
$$;

COMMENT ON FUNCTION public.caller_can_read_kbs_document_access_logs() IS
  'Kimlik erişim günlüğü okuma yetkisi (KBS admin / id_capture / yönetici roller).';

CREATE OR REPLACE FUNCTION public.list_kbs_document_access_events(p_limit integer DEFAULT 200)
RETURNS TABLE (
  id uuid,
  hotel_id uuid,
  guest_document_id uuid,
  actor_auth_id uuid,
  actor_staff_id uuid,
  actor_staff_name text,
  actor_staff_role text,
  session_id uuid,
  event_type text,
  reason_code text,
  reason_text text,
  dwell_ms integer,
  guest_name_snapshot text,
  document_number_snapshot text,
  client text,
  pathname text,
  metadata jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.caller_can_read_kbs_document_access_logs() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.hotel_id,
    e.guest_document_id,
    e.actor_auth_id,
    e.actor_staff_id,
    COALESCE(
      NULLIF(btrim(e.actor_staff_name), ''),
      NULLIF(btrim(s_by_id.full_name), ''),
      NULLIF(btrim(s_by_auth.full_name), '')
    ) AS actor_staff_name,
    COALESCE(s_by_id.role, s_by_auth.role) AS actor_staff_role,
    e.session_id,
    e.event_type,
    e.reason_code,
    e.reason_text,
    e.dwell_ms,
    e.guest_name_snapshot,
    e.document_number_snapshot,
    e.client,
    e.pathname,
    e.metadata,
    e.created_at
  FROM ops.guest_document_access_events e
  LEFT JOIN public.staff s_by_id
    ON s_by_id.id = e.actor_staff_id
   AND s_by_id.deleted_at IS NULL
  LEFT JOIN public.staff s_by_auth
    ON e.actor_staff_id IS NULL
   AND s_by_auth.auth_id = e.actor_auth_id
   AND s_by_auth.deleted_at IS NULL
  WHERE
    public.kbs_web_can_view_all_hotels()
    OR e.hotel_id = ops.current_hotel_id()
    OR EXISTS (
      SELECT 1
      FROM ops.app_users au
      WHERE au.id = auth.uid()
        AND au.hotel_id = e.hotel_id
    )
  ORDER BY e.created_at DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.list_kbs_document_access_events(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_kbs_document_access_events(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_can_read_kbs_document_access_logs() TO authenticated;

-- RLS: id_capture + staff admin ile uyumlu okuma (doğrudan ops sorgusu yedek yolu).
DROP POLICY IF EXISTS "ops_gdae_select_managers" ON ops.guest_document_access_events;
CREATE POLICY "ops_gdae_select_managers" ON ops.guest_document_access_events
  FOR SELECT TO authenticated
  USING (
    public.caller_can_read_kbs_document_access_logs()
    AND (
      public.kbs_web_can_view_all_hotels()
      OR hotel_id = ops.current_hotel_id()
      OR EXISTS (
        SELECT 1
        FROM ops.app_users au
        WHERE au.id = auth.uid()
          AND au.hotel_id = guest_document_access_events.hotel_id
      )
    )
  );

COMMENT ON FUNCTION public.list_kbs_document_access_events(integer) IS
  'KBS kimlik erişim günlüğü — public RPC; ops şeması expose edilmese de çalışır.';

-- Yazma: istemci ops şemasına erişemese bile log RPC çalışsın.
CREATE OR REPLACE FUNCTION public.log_kbs_document_access(
  p_guest_document_id uuid,
  p_event_type text,
  p_session_id uuid DEFAULT NULL,
  p_reason_code text DEFAULT NULL,
  p_reason_text text DEFAULT NULL,
  p_dwell_ms integer DEFAULT NULL,
  p_guest_name text DEFAULT NULL,
  p_document_number text DEFAULT NULL,
  p_client text DEFAULT 'staff_app',
  p_pathname text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_actor_staff_id uuid DEFAULT NULL,
  p_actor_staff_name text DEFAULT NULL,
  p_hotel_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ops, public
AS $$
  SELECT ops.log_guest_document_access(
    p_guest_document_id,
    p_event_type,
    p_session_id,
    p_reason_code,
    p_reason_text,
    p_dwell_ms,
    p_guest_name,
    p_document_number,
    p_client,
    p_pathname,
    p_metadata,
    p_actor_staff_id,
    p_actor_staff_name,
    p_hotel_id
  );
$$;

REVOKE ALL ON FUNCTION public.log_kbs_document_access(
  uuid, text, uuid, text, text, integer, text, text, text, text, jsonb, uuid, text, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_kbs_document_access(
  uuid, text, uuid, text, text, integer, text, text, text, text, jsonb, uuid, text, uuid
) TO authenticated, service_role;

COMMIT;
