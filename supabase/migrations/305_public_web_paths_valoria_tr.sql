-- valoria.tr düzenli QR yolları: /menü, /sözleşme, /maliye

BEGIN;

UPDATE public.app_settings
SET value = to_jsonb('https://valoria.tr'::text), updated_at = now()
WHERE key = 'app_public_base_url';

INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('contract_qr_base_url', to_jsonb('https://valoria.tr/sözleşme'::text), now())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = now();

INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('maliye_qr_base_url', to_jsonb('https://valoria.tr/maliye'::text), now())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = now();

INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('checkin_qr_base_url', to_jsonb('https://valoria.tr'::text), now())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = now();

COMMIT;
