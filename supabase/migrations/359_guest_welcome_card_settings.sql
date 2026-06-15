-- Misafir karşılama kartı metinleri: işletme bazında admin düzenler.

BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS guest_welcome_card JSONB;

COMMENT ON COLUMN public.organizations.guest_welcome_card IS
  'Yeni misafir karşılama kartı metinleri: { "v":1, "tr": { "title", "subtitle", ... }, "en": { ... } }. Boş alanlar uygulama varsayılanına düşer.';

COMMIT;
