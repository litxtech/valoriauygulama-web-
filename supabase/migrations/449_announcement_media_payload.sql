-- Duyuru panosu: resim, video, web sitesi ve modül bağlantıları
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS media_payload JSONB;

COMMENT ON COLUMN public.announcements.media_payload IS
  'Zengin duyuru içeriği: images[], videoUrl, websiteUrl, openScreen vb.';
