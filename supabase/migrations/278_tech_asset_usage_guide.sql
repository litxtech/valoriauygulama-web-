-- Teknik varlık: personel için «nasıl kullanılır» metin + video
ALTER TABLE public.tech_assets
  ADD COLUMN IF NOT EXISTS usage_guide_text text,
  ADD COLUMN IF NOT EXISTS usage_guide_video_url text;

COMMENT ON COLUMN public.tech_assets.usage_guide_text IS 'Personel kullanım talimatı (düz metin).';
COMMENT ON COLUMN public.tech_assets.usage_guide_video_url IS 'Public storage URL — eğitim / kullanım videosu.';

-- tech-assets bucket: kısa eğitim videoları
UPDATE storage.buckets
SET
  file_size_limit = 104857600,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/3gpp'
  ]::text[]
WHERE id = 'tech-assets';
