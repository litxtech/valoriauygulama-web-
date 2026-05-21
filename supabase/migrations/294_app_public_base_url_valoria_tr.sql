-- Canlı site kökü: valoria.tr (menü QR ve web)

BEGIN;

INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('app_public_base_url', to_jsonb('https://valoria.tr'::text), now())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = now();

COMMENT ON TABLE public.app_settings IS
  'app_public_base_url: canlı web kök URL (ör. https://valoria.tr). Menü: {base}/menu/{org-slug}';

COMMIT;
