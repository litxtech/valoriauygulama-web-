-- Teknik varlık fotoğrafları (admin yeni varlık / düzenleme için public URL)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tech-assets',
  'tech-assets',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "tech_assets_storage_upload" ON storage.objects;
CREATE POLICY "tech_assets_storage_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tech-assets');

DROP POLICY IF EXISTS "tech_assets_storage_read" ON storage.objects;
CREATE POLICY "tech_assets_storage_read" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'tech-assets');
