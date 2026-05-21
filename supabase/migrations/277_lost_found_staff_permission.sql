BEGIN;

CREATE OR REPLACE FUNCTION public.staff_has_lost_found_permission()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT
        s.role = 'admin'
        OR (s.app_permissions->>'emanet_buluntu') IN ('true', 't', '1', 'True', 'TRUE')
        OR (s.app_permissions->>'lost_found') IN ('true', 't', '1', 'True', 'TRUE')
      FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.is_active = true
        AND s.deleted_at IS NULL
      LIMIT 1
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.staff_has_lost_found_permission() IS
  'Emanet/buluntu modülü: admin veya app_permissions.emanet_buluntu';

DROP POLICY IF EXISTS lost_found_items_select_staff_org ON public.lost_found_items;
CREATE POLICY lost_found_items_select_staff_org ON public.lost_found_items
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_has_lost_found_permission()
  );

DROP POLICY IF EXISTS lost_found_items_insert_staff_org ON public.lost_found_items;
CREATE POLICY lost_found_items_insert_staff_org ON public.lost_found_items
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND registered_by_staff_id = public.current_staff_id()
    AND public.staff_has_lost_found_permission()
  );

DROP POLICY IF EXISTS lost_found_items_update_staff_org ON public.lost_found_items;
CREATE POLICY lost_found_items_update_staff_org ON public.lost_found_items
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_has_lost_found_permission()
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.staff_has_lost_found_permission()
  );

DROP POLICY IF EXISTS lost_found_item_photos_all ON public.lost_found_item_photos;
CREATE POLICY lost_found_item_photos_all ON public.lost_found_item_photos
  FOR ALL TO authenticated
  USING (
    public.staff_has_lost_found_permission()
    AND EXISTS (
      SELECT 1 FROM public.lost_found_items lf
      WHERE lf.id = item_id
        AND lf.organization_id = public.current_staff_organization_id()
    )
  )
  WITH CHECK (
    public.staff_has_lost_found_permission()
    AND EXISTS (
      SELECT 1 FROM public.lost_found_items lf
      WHERE lf.id = item_id
        AND lf.organization_id = public.current_staff_organization_id()
    )
  );

DROP POLICY IF EXISTS lost_found_media_insert ON storage.objects;
CREATE POLICY lost_found_media_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lost-found-media'
    AND public.staff_has_lost_found_permission()
  );

-- Bildirimler: yalnızca emanet yetkisi olan personele (ve admin)
CREATE OR REPLACE FUNCTION public.lost_found_items_notify_insert()
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
BEGIN
  SELECT array_agg(s.id)
  INTO v_staff_ids
  FROM public.staff s
  WHERE s.organization_id = NEW.organization_id
    AND s.is_active = true
    AND s.deleted_at IS NULL
    AND (
      s.role = 'admin'
      OR (s.app_permissions->>'emanet_buluntu') IN ('true', 't', '1', 'True', 'TRUE')
      OR (s.app_permissions->>'lost_found') IN ('true', 't', '1', 'True', 'TRUE')
    );

  IF v_staff_ids IS NULL OR array_length(v_staff_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  v_title := 'Emanet — Yeni kayıt: ' || NEW.reference_code;
  v_body := COALESCE(NULLIF(trim(NEW.title), ''), 'Buluntu eşya kaydı oluşturuldu.');
  v_payload := jsonb_build_object(
    'kind', 'lost_found_opened',
    'lostFoundItemId', NEW.id::text,
    'referenceCode', NEW.reference_code,
    'url', '/staff/lost-found/' || NEW.id::text
  );

  INSERT INTO public.notifications (
    staff_id, guest_id, title, body, category, notification_type, data, created_by, sent_via, sent_at
  )
  SELECT sid, NULL, v_title, v_body, 'staff', 'lost_found_opened', v_payload, NEW.registered_by_staff_id, 'both', now()
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

COMMIT;
