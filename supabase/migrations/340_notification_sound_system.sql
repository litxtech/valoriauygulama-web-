BEGIN;

-- ---------- notification_sound_settings ----------
CREATE TABLE IF NOT EXISTS public.notification_sound_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  notification_type text,
  title text NOT NULL,
  description text,
  sound_file_url text,
  sound_file_name text,
  sound_duration numeric(6,2),
  ios_push_sound text NOT NULL DEFAULT 'default',
  android_push_sound text NOT NULL DEFAULT 'default',
  android_channel_id text,
  android_channel_version integer NOT NULL DEFAULT 1,
  platform_ios_enabled boolean NOT NULL DEFAULT true,
  platform_android_enabled boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_sound_settings_org_feature_unique UNIQUE (organization_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_sound_settings_org
  ON public.notification_sound_settings (organization_id);

ALTER TABLE public.notification_sound_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_sound_settings_select ON public.notification_sound_settings;
CREATE POLICY notification_sound_settings_select ON public.notification_sound_settings
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    OR public.current_user_is_staff_admin()
  );

DROP POLICY IF EXISTS notification_sound_settings_write_admin ON public.notification_sound_settings;
CREATE POLICY notification_sound_settings_write_admin ON public.notification_sound_settings
  FOR ALL TO authenticated
  USING (
    public.current_user_is_staff_admin()
    AND organization_id = public.current_staff_organization_id()
  )
  WITH CHECK (
    public.current_user_is_staff_admin()
    AND organization_id = public.current_staff_organization_id()
  );

-- ---------- notification_events (log) ----------
CREATE TABLE IF NOT EXISTS public.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id uuid,
  user_kind text CHECK (user_kind IN ('staff', 'guest', 'admin')),
  feature_key text,
  notification_title text,
  notification_body text,
  sound_key text,
  sound_file_name text,
  delivery_status text DEFAULT 'sent',
  opened_at timestamptz,
  acknowledged_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_events_org_created
  ON public.notification_events (organization_id, created_at DESC);

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_events_select_admin ON public.notification_events;
CREATE POLICY notification_events_select_admin ON public.notification_events
  FOR SELECT TO authenticated
  USING (public.current_user_is_staff_admin());

DROP POLICY IF EXISTS notification_events_insert_authenticated ON public.notification_events;
CREATE POLICY notification_events_insert_authenticated ON public.notification_events
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ---------- Storage bucket ----------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'notification-sounds',
  'notification-sounds',
  true,
  524288,
  ARRAY['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-caf', 'audio/aac']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS notification_sounds_storage_insert ON storage.objects;
CREATE POLICY notification_sounds_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'notification-sounds'
    AND public.current_user_is_staff_admin()
  );

DROP POLICY IF EXISTS notification_sounds_storage_update ON storage.objects;
CREATE POLICY notification_sounds_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'notification-sounds' AND public.current_user_is_staff_admin())
  WITH CHECK (bucket_id = 'notification-sounds' AND public.current_user_is_staff_admin());

DROP POLICY IF EXISTS notification_sounds_storage_delete ON storage.objects;
CREATE POLICY notification_sounds_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'notification-sounds' AND public.current_user_is_staff_admin());

DROP POLICY IF EXISTS notification_sounds_storage_read ON storage.objects;
CREATE POLICY notification_sounds_storage_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'notification-sounds');

-- ---------- Seed defaults per organization ----------
CREATE OR REPLACE FUNCTION public.ensure_notification_sound_settings(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff uuid := public.current_staff_id();
BEGIN
  IF p_organization_id IS NULL THEN
    RETURN;
  END IF;
  IF NOT public.current_user_is_staff_admin() THEN
    RAISE EXCEPTION 'Admin yetkisi gerekli';
  END IF;

  INSERT INTO public.notification_sound_settings (
    organization_id, feature_key, title, description,
    ios_push_sound, android_push_sound, android_channel_id, created_by
  )
  VALUES
    (p_organization_id, 'emergency_alert', 'Acil durum', 'Acil durum alarmları', 'emergency_alert.wav', 'emergency_alert.wav', 'valoria_emergency_alert', v_staff),
    (p_organization_id, 'new_task', 'Yeni görev', 'Görev atamaları', 'default', 'default', 'valoria_ns_new_task', v_staff),
    (p_organization_id, 'new_message', 'Mesaj', 'Sohbet bildirimleri', 'default', 'default', 'valoria_ns_new_message', v_staff),
    (p_organization_id, 'announcement', 'Duyuru', 'Duyuru ve kampanya', 'default', 'default', 'valoria_ns_announcement', v_staff),
    (p_organization_id, 'stock_warning', 'Stok uyarısı', 'Stok ve envanter', 'default', 'default', 'valoria_ns_stock_warning', v_staff),
    (p_organization_id, 'kitchen_request', 'Mutfak talebi', 'Mutfak operasyon', 'default', 'default', 'valoria_ns_kitchen_request', v_staff),
    (p_organization_id, 'reception_request', 'Resepsiyon', 'Misafir talepleri', 'default', 'default', 'valoria_ns_reception_request', v_staff),
    (p_organization_id, 'accounting_document', 'Muhasebe evrakı', 'Muhasebe bildirimleri', 'default', 'default', 'valoria_ns_accounting_document', v_staff),
    (p_organization_id, 'guest_form', 'Misafir formu', 'Sözleşme ve kayıt', 'default', 'default', 'valoria_ns_guest_form', v_staff),
    (p_organization_id, 'kbs_notification', 'KBS / kimlik', 'KBS bildirimleri', 'default', 'default', 'valoria_ns_kbs_notification', v_staff),
    (p_organization_id, 'staff_call', 'Personel çağrısı', 'Uyarı ve çağrılar', 'default', 'default', 'valoria_ns_staff_call', v_staff),
    (p_organization_id, 'social_feed', 'Akış', 'Beğeni ve yorum', 'default', 'default', 'valoria_ns_social_feed', v_staff),
    (p_organization_id, 'smart_ops', 'Operasyon merkezi', 'Smart Ops', 'default', 'default', 'valoria_ns_smart_ops', v_staff)
  ON CONFLICT (organization_id, feature_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_notification_sound_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_notification_sound_settings(uuid) TO authenticated;

-- Push edge function: org + feature → ses ayarı
CREATE OR REPLACE FUNCTION public.get_notification_sound_push_config(
  p_organization_id uuid,
  p_feature_key text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (
      SELECT jsonb_build_object(
        'feature_key', s.feature_key,
        'is_active', s.is_active,
        'ios_push_sound', CASE WHEN s.is_active THEN coalesce(nullif(trim(s.ios_push_sound), ''), 'default') ELSE 'default' END,
        'android_push_sound', CASE WHEN s.is_active THEN coalesce(nullif(trim(s.android_push_sound), ''), 'default') ELSE 'default' END,
        'android_channel_id', coalesce(
          nullif(trim(s.android_channel_id), ''),
          'valoria_ns_' || s.feature_key || '_v' || s.android_channel_version::text
        ),
        'sound_file_url', s.sound_file_url,
        'sound_file_name', s.sound_file_name,
        'priority', CASE WHEN s.feature_key = 'emergency_alert' THEN 'high' ELSE 'normal' END
      )
      FROM public.notification_sound_settings s
      WHERE s.organization_id = p_organization_id
        AND s.feature_key = p_feature_key
        AND s.is_active = true
      LIMIT 1
    ),
    jsonb_build_object(
      'feature_key', p_feature_key,
      'is_active', true,
      'ios_push_sound', CASE WHEN p_feature_key = 'emergency_alert' THEN 'emergency_alert.wav' ELSE 'default' END,
      'android_push_sound', CASE WHEN p_feature_key = 'emergency_alert' THEN 'emergency_alert.wav' ELSE 'default' END,
      'android_channel_id', CASE WHEN p_feature_key = 'emergency_alert' THEN 'valoria_emergency_alert' ELSE 'valoria_urgent' END,
      'priority', CASE WHEN p_feature_key = 'emergency_alert' THEN 'high' ELSE 'normal' END
    )
  );
$$;

REVOKE ALL ON FUNCTION public.get_notification_sound_push_config(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_notification_sound_push_config(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_notification_sound_push_config(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.log_notification_event(
  p_organization_id uuid,
  p_user_id uuid,
  p_user_kind text,
  p_feature_key text,
  p_title text,
  p_body text,
  p_sound_key text,
  p_sound_file_name text,
  p_delivery_status text DEFAULT 'delivered',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.notification_events (
    organization_id, user_id, user_kind, feature_key,
    notification_title, notification_body, sound_key, sound_file_name,
    delivery_status, metadata
  )
  VALUES (
    p_organization_id, p_user_id, p_user_kind, p_feature_key,
    p_title, p_body, p_sound_key, p_sound_file_name,
    coalesce(p_delivery_status, 'delivered'), coalesce(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_notification_event(uuid, uuid, text, text, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_notification_event(uuid, uuid, text, text, text, text, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_notification_event(uuid, uuid, text, text, text, text, text, text, text, jsonb) TO service_role;

COMMIT;
