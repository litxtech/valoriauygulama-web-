-- Lobi kapak medyası (resim XOR video) — app_settings + public storage + realtime

INSERT INTO public.app_settings (key, value, updated_at)
VALUES (
  'lobby_cover',
  NULL,
  now()
)
ON CONFLICT (key) DO NOTHING;

-- Anon (lobi / giriş öncesi) kapak ayarını okuyabilsin
DROP POLICY IF EXISTS "app_settings_anon_lobby_cover" ON public.app_settings;
CREATE POLICY "app_settings_anon_lobby_cover" ON public.app_settings
  FOR SELECT TO anon
  USING (key = 'lobby_cover');

-- Public storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lobby-media',
  'lobby-media',
  true,
  104857600,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS lobby_media_public_read ON storage.objects;
CREATE POLICY lobby_media_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'lobby-media');

DROP POLICY IF EXISTS lobby_media_staff_write ON storage.objects;
CREATE POLICY lobby_media_staff_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lobby-media'
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.is_active = true
        AND s.role IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS lobby_media_staff_update ON storage.objects;
CREATE POLICY lobby_media_staff_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'lobby-media'
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.is_active = true
        AND s.role IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS lobby_media_staff_delete ON storage.objects;
CREATE POLICY lobby_media_staff_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'lobby-media'
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.is_active = true
        AND s.role IN ('admin', 'manager')
    )
  );

-- Anlık güncelleme: tüm cihazlarda lobi kapağı yenilensin
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.app_settings IS
  'lobby_cover: { media_type: image|video, url: string } — lobi kapak medyası; NULL = varsayılan görsel';
