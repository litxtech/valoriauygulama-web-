-- Kahvaltı partner: geçmiş kahvaltı kayıtları için kamera görüntüsü talep modülü.

BEGIN;

-- ---------- Durum sabitleri ----------
-- bekliyor | video_yuklendi | itiraz_bekliyor | itiraz_cevaplandi | kapatildi | reddedildi

CREATE TABLE IF NOT EXISTS public.camera_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_user_id uuid NOT NULL REFERENCES public.breakfast_partner_users(id) ON DELETE RESTRICT,
  partner_hotel_id uuid NOT NULL REFERENCES public.breakfast_partner_hotels(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  request_date date NOT NULL,
  time_start time NOT NULL,
  time_end time,
  guest_name text,
  room_number text,
  description text NOT NULL,
  request_reason text NOT NULL,
  status text NOT NULL DEFAULT 'bekliyor'
    CHECK (status IN ('bekliyor', 'video_yuklendi', 'itiraz_bekliyor', 'itiraz_cevaplandi', 'kapatildi', 'reddedildi')),
  admin_note text,
  rejection_reason text,
  video_viewed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT camera_requests_description_not_blank CHECK (length(trim(description)) > 0),
  CONSTRAINT camera_requests_reason_not_blank CHECK (length(trim(request_reason)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_camera_requests_hotel_created
  ON public.camera_requests (partner_hotel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_camera_requests_org_status
  ON public.camera_requests (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_camera_requests_partner_user
  ON public.camera_requests (partner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.camera_request_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_request_id uuid NOT NULL REFERENCES public.camera_requests(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  public_url text NOT NULL,
  mime_type text,
  file_size bigint,
  duration_sec numeric,
  uploaded_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  is_replacement boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_camera_request_videos_request
  ON public.camera_request_videos (camera_request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.camera_request_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_request_id uuid NOT NULL REFERENCES public.camera_requests(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('partner', 'staff', 'system')),
  sender_id uuid,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT camera_request_messages_body_not_blank CHECK (length(trim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_camera_request_messages_request
  ON public.camera_request_messages (camera_request_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.camera_request_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_request_id uuid NOT NULL REFERENCES public.camera_requests(id) ON DELETE CASCADE,
  partner_user_id uuid NOT NULL REFERENCES public.breakfast_partner_users(id) ON DELETE RESTRICT,
  appeal_reason text NOT NULL,
  description text NOT NULL,
  admin_response text,
  status text NOT NULL DEFAULT 'bekliyor' CHECK (status IN ('bekliyor', 'cevaplandi')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  responded_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  CONSTRAINT camera_request_appeals_reason_not_blank CHECK (length(trim(appeal_reason)) > 0),
  CONSTRAINT camera_request_appeals_desc_not_blank CHECK (length(trim(description)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_camera_request_appeals_request
  ON public.camera_request_appeals (camera_request_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.camera_requests_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_camera_requests_touch ON public.camera_requests;
CREATE TRIGGER trg_camera_requests_touch
  BEFORE UPDATE ON public.camera_requests
  FOR EACH ROW EXECUTE FUNCTION public.camera_requests_touch_updated_at();

-- ---------- Storage bucket ----------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'breakfast-partner-camera',
  'breakfast-partner-camera',
  true,
  104857600,
  ARRAY['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/m4v']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS breakfast_partner_camera_upload ON storage.objects;
CREATE POLICY breakfast_partner_camera_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'breakfast-partner-camera'
    AND public.staff_can_manage_breakfast_partners()
  );

DROP POLICY IF EXISTS breakfast_partner_camera_read ON storage.objects;
CREATE POLICY breakfast_partner_camera_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'breakfast-partner-camera');

-- ---------- RLS ----------
ALTER TABLE public.camera_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camera_request_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camera_request_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camera_request_appeals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS camera_requests_partner_select ON public.camera_requests;
CREATE POLICY camera_requests_partner_select ON public.camera_requests
  FOR SELECT TO authenticated
  USING (partner_user_id = public.breakfast_partner_current_user_id());

DROP POLICY IF EXISTS camera_requests_staff_all ON public.camera_requests;
CREATE POLICY camera_requests_staff_all ON public.camera_requests
  FOR ALL TO authenticated
  USING (public.staff_can_manage_breakfast_partners(organization_id))
  WITH CHECK (public.staff_can_manage_breakfast_partners(organization_id));

DROP POLICY IF EXISTS camera_request_videos_partner_select ON public.camera_request_videos;
CREATE POLICY camera_request_videos_partner_select ON public.camera_request_videos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.camera_requests r
      WHERE r.id = camera_request_id
        AND r.partner_user_id = public.breakfast_partner_current_user_id()
    )
  );

DROP POLICY IF EXISTS camera_request_videos_staff_all ON public.camera_request_videos;
CREATE POLICY camera_request_videos_staff_all ON public.camera_request_videos
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.camera_requests r
      WHERE r.id = camera_request_id
        AND public.staff_can_manage_breakfast_partners(r.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.camera_requests r
      WHERE r.id = camera_request_id
        AND public.staff_can_manage_breakfast_partners(r.organization_id)
    )
  );

DROP POLICY IF EXISTS camera_request_messages_partner_select ON public.camera_request_messages;
CREATE POLICY camera_request_messages_partner_select ON public.camera_request_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.camera_requests r
      WHERE r.id = camera_request_id
        AND r.partner_user_id = public.breakfast_partner_current_user_id()
    )
  );

DROP POLICY IF EXISTS camera_request_messages_staff_all ON public.camera_request_messages;
CREATE POLICY camera_request_messages_staff_all ON public.camera_request_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.camera_requests r
      WHERE r.id = camera_request_id
        AND public.staff_can_manage_breakfast_partners(r.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.camera_requests r
      WHERE r.id = camera_request_id
        AND public.staff_can_manage_breakfast_partners(r.organization_id)
    )
  );

DROP POLICY IF EXISTS camera_request_appeals_partner_select ON public.camera_request_appeals;
CREATE POLICY camera_request_appeals_partner_select ON public.camera_request_appeals
  FOR SELECT TO authenticated
  USING (partner_user_id = public.breakfast_partner_current_user_id());

DROP POLICY IF EXISTS camera_request_appeals_staff_all ON public.camera_request_appeals;
CREATE POLICY camera_request_appeals_staff_all ON public.camera_request_appeals
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.camera_requests r
      WHERE r.id = camera_request_id
        AND public.staff_can_manage_breakfast_partners(r.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.camera_requests r
      WHERE r.id = camera_request_id
        AND public.staff_can_manage_breakfast_partners(r.organization_id)
    )
  );

GRANT SELECT ON public.camera_requests TO authenticated;
GRANT SELECT ON public.camera_request_videos TO authenticated;
GRANT SELECT ON public.camera_request_messages TO authenticated;
GRANT SELECT ON public.camera_request_appeals TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.camera_requests TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.camera_request_videos TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.camera_request_messages TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.camera_request_appeals TO authenticated;

-- ---------- Partner RPC ----------
CREATE OR REPLACE FUNCTION public.partner_create_camera_request(
  p_request_date date,
  p_time_start time,
  p_time_end time DEFAULT NULL,
  p_guest_name text DEFAULT NULL,
  p_room_number text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_request_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_hotel_id uuid;
  v_org_id uuid;
  v_id uuid;
BEGIN
  v_user_id := public.breakfast_partner_current_user_id();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Partner oturumu gerekli';
  END IF;

  IF p_request_date IS NULL OR p_time_start IS NULL THEN
    RAISE EXCEPTION 'Tarih ve saat zorunludur';
  END IF;
  IF p_description IS NULL OR length(trim(p_description)) = 0 THEN
    RAISE EXCEPTION 'Açıklama zorunludur';
  END IF;
  IF p_request_reason IS NULL OR length(trim(p_request_reason)) = 0 THEN
    RAISE EXCEPTION 'Talep nedeni zorunludur';
  END IF;

  SELECT u.partner_hotel_id, h.organization_id
  INTO v_hotel_id, v_org_id
  FROM public.breakfast_partner_users u
  JOIN public.breakfast_partner_hotels h ON h.id = u.partner_hotel_id
  WHERE u.id = v_user_id AND h.status = 'active';

  IF v_hotel_id IS NULL THEN
    RAISE EXCEPTION 'Aktif partner hesabı gerekli';
  END IF;

  INSERT INTO public.camera_requests (
    partner_user_id, partner_hotel_id, organization_id,
    request_date, time_start, time_end,
    guest_name, room_number, description, request_reason, status
  )
  VALUES (
    v_user_id, v_hotel_id, v_org_id,
    p_request_date, p_time_start, p_time_end,
    NULLIF(trim(p_guest_name), ''), NULLIF(trim(p_room_number), ''),
    trim(p_description), trim(p_request_reason), 'bekliyor'
  )
  RETURNING id INTO v_id;

  INSERT INTO public.camera_request_messages (camera_request_id, sender_type, sender_id, body)
  VALUES (v_id, 'system', NULL, 'Talep oluşturuldu — durum: BEKLİYOR');

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.partner_create_camera_request(date, time, time, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.partner_mark_camera_request_viewed(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := public.breakfast_partner_current_user_id();
  IF v_user_id IS NULL THEN RETURN false; END IF;

  UPDATE public.camera_requests
  SET video_viewed_at = COALESCE(video_viewed_at, now())
  WHERE id = p_request_id
    AND partner_user_id = v_user_id
    AND status IN ('video_yuklendi', 'itiraz_cevaplandi');

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.partner_mark_camera_request_viewed(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.partner_create_camera_request_appeal(
  p_request_id uuid,
  p_appeal_reason text,
  p_description text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_status text;
  v_id uuid;
BEGIN
  v_user_id := public.breakfast_partner_current_user_id();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Partner oturumu gerekli'; END IF;
  IF p_appeal_reason IS NULL OR length(trim(p_appeal_reason)) = 0 THEN
    RAISE EXCEPTION 'İtiraz nedeni zorunludur';
  END IF;
  IF p_description IS NULL OR length(trim(p_description)) = 0 THEN
    RAISE EXCEPTION 'Açıklama zorunludur';
  END IF;

  SELECT status INTO v_status
  FROM public.camera_requests
  WHERE id = p_request_id AND partner_user_id = v_user_id
  FOR UPDATE;

  IF v_status IS NULL THEN RAISE EXCEPTION 'Talep bulunamadı'; END IF;
  IF v_status NOT IN ('video_yuklendi', 'itiraz_cevaplandi') THEN
    RAISE EXCEPTION 'Bu talep için itiraz oluşturulamaz';
  END IF;
  IF v_status = 'itiraz_bekliyor' THEN
    RAISE EXCEPTION 'Zaten bekleyen bir itiraz var';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.camera_request_appeals a
    WHERE a.camera_request_id = p_request_id AND a.status = 'bekliyor'
  ) THEN
    RAISE EXCEPTION 'Zaten bekleyen bir itiraz var';
  END IF;

  INSERT INTO public.camera_request_appeals (
    camera_request_id, partner_user_id, appeal_reason, description, status
  )
  VALUES (p_request_id, v_user_id, trim(p_appeal_reason), trim(p_description), 'bekliyor')
  RETURNING id INTO v_id;

  UPDATE public.camera_requests
  SET status = 'itiraz_bekliyor'
  WHERE id = p_request_id;

  INSERT INTO public.camera_request_messages (camera_request_id, sender_type, sender_id, body)
  VALUES (p_request_id, 'partner', v_user_id, 'İtiraz oluşturuldu: ' || trim(p_appeal_reason));

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.partner_create_camera_request_appeal(uuid, text, text) TO authenticated;

-- ---------- Admin RPC ----------
CREATE OR REPLACE FUNCTION public.staff_add_camera_request_message(
  p_request_id uuid,
  p_body text,
  p_set_admin_note boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_staff_id uuid;
  v_msg_id uuid;
BEGIN
  SELECT r.organization_id INTO v_org_id
  FROM public.camera_requests r WHERE r.id = p_request_id;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Talep bulunamadı'; END IF;
  IF NOT public.staff_can_manage_breakfast_partners(v_org_id) THEN
    RAISE EXCEPTION 'Yetki yok';
  END IF;
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RAISE EXCEPTION 'Mesaj boş olamaz';
  END IF;

  SELECT s.id INTO v_staff_id
  FROM public.staff s
  WHERE s.auth_id = auth.uid() AND s.deleted_at IS NULL
  LIMIT 1;

  INSERT INTO public.camera_request_messages (camera_request_id, sender_type, sender_id, body)
  VALUES (p_request_id, 'staff', v_staff_id, trim(p_body))
  RETURNING id INTO v_msg_id;

  IF p_set_admin_note THEN
    UPDATE public.camera_requests SET admin_note = trim(p_body) WHERE id = p_request_id;
  END IF;

  RETURN v_msg_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_add_camera_request_message(uuid, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_reject_camera_request(
  p_request_id uuid,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.camera_requests WHERE id = p_request_id;
  IF v_org_id IS NULL THEN RETURN false; END IF;
  IF NOT public.staff_can_manage_breakfast_partners(v_org_id) THEN
    RAISE EXCEPTION 'Yetki yok';
  END IF;

  UPDATE public.camera_requests
  SET status = 'reddedildi',
      rejection_reason = NULLIF(trim(p_reason), ''),
      closed_at = now()
  WHERE id = p_request_id AND status = 'bekliyor';

  IF FOUND THEN
    INSERT INTO public.camera_request_messages (camera_request_id, sender_type, body)
    VALUES (p_request_id, 'system', 'Talep reddedildi.');
  END IF;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_reject_camera_request(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_close_camera_request(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.camera_requests WHERE id = p_request_id;
  IF v_org_id IS NULL THEN RETURN false; END IF;
  IF NOT public.staff_can_manage_breakfast_partners(v_org_id) THEN
    RAISE EXCEPTION 'Yetki yok';
  END IF;

  UPDATE public.camera_requests
  SET status = 'kapatildi', closed_at = now()
  WHERE id = p_request_id
    AND status IN ('video_yuklendi', 'itiraz_cevaplandi', 'itiraz_bekliyor');

  IF FOUND THEN
    INSERT INTO public.camera_request_messages (camera_request_id, sender_type, body)
    VALUES (p_request_id, 'system', 'Talep kapatıldı.');
  END IF;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_close_camera_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_register_camera_request_video(
  p_request_id uuid,
  p_storage_path text,
  p_public_url text,
  p_mime_type text DEFAULT NULL,
  p_file_size bigint DEFAULT NULL,
  p_is_replacement boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_hotel_id uuid;
  v_staff_id uuid;
  v_status text;
  v_video_id uuid;
BEGIN
  SELECT r.organization_id, r.partner_hotel_id, r.status
  INTO v_org_id, v_hotel_id, v_status
  FROM public.camera_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Talep bulunamadı'; END IF;
  IF NOT public.staff_can_manage_breakfast_partners(v_org_id) THEN
    RAISE EXCEPTION 'Yetki yok';
  END IF;
  IF p_public_url IS NULL OR length(trim(p_public_url)) = 0 THEN
    RAISE EXCEPTION 'Video URL gerekli';
  END IF;
  IF v_status NOT IN ('bekliyor', 'itiraz_bekliyor', 'itiraz_cevaplandi', 'video_yuklendi') THEN
    RAISE EXCEPTION 'Bu durumda video yüklenemez';
  END IF;

  SELECT s.id INTO v_staff_id
  FROM public.staff s WHERE s.auth_id = auth.uid() AND s.deleted_at IS NULL LIMIT 1;

  INSERT INTO public.camera_request_videos (
    camera_request_id, storage_path, public_url, mime_type, file_size,
    uploaded_by_staff_id, is_replacement
  )
  VALUES (
    p_request_id,
    COALESCE(NULLIF(trim(p_storage_path), ''), trim(p_public_url)),
    trim(p_public_url),
    NULLIF(trim(p_mime_type), ''),
    p_file_size,
    v_staff_id,
    COALESCE(p_is_replacement, false)
  )
  RETURNING id INTO v_video_id;

  UPDATE public.camera_requests
  SET status = 'video_yuklendi',
      video_viewed_at = NULL
  WHERE id = p_request_id;

  INSERT INTO public.camera_request_messages (camera_request_id, sender_type, sender_id, body)
  VALUES (
    p_request_id,
    'staff',
    v_staff_id,
    CASE WHEN COALESCE(p_is_replacement, false) THEN 'Yeni kamera kaydı yüklendi.' ELSE 'Kamera kaydı yüklendi.' END
  );

  RETURN v_video_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_register_camera_request_video(uuid, text, text, text, bigint, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_respond_camera_request_appeal(
  p_appeal_id uuid,
  p_response text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id uuid;
  v_org_id uuid;
  v_staff_id uuid;
BEGIN
  IF p_response IS NULL OR length(trim(p_response)) = 0 THEN
    RAISE EXCEPTION 'Cevap zorunludur';
  END IF;

  SELECT a.camera_request_id, r.organization_id
  INTO v_request_id, v_org_id
  FROM public.camera_request_appeals a
  JOIN public.camera_requests r ON r.id = a.camera_request_id
  WHERE a.id = p_appeal_id AND a.status = 'bekliyor'
  FOR UPDATE;

  IF v_request_id IS NULL THEN RETURN false; END IF;
  IF NOT public.staff_can_manage_breakfast_partners(v_org_id) THEN
    RAISE EXCEPTION 'Yetki yok';
  END IF;

  SELECT s.id INTO v_staff_id
  FROM public.staff s WHERE s.auth_id = auth.uid() AND s.deleted_at IS NULL LIMIT 1;

  UPDATE public.camera_request_appeals
  SET status = 'cevaplandi',
      admin_response = trim(p_response),
      responded_at = now(),
      responded_by_staff_id = v_staff_id
  WHERE id = p_appeal_id;

  UPDATE public.camera_requests
  SET status = 'itiraz_cevaplandi'
  WHERE id = v_request_id;

  INSERT INTO public.camera_request_messages (camera_request_id, sender_type, sender_id, body)
  VALUES (v_request_id, 'staff', v_staff_id, 'İtiraz cevaplandı: ' || trim(p_response));

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_respond_camera_request_appeal(uuid, text) TO authenticated;

COMMIT;
