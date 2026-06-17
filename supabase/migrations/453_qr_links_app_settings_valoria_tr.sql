-- Tüm QR linkleri: valoria.tr (Supabase app_settings — tek kaynak)

BEGIN;

INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('app_public_base_url', to_jsonb('https://valoria.tr'::text), now())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = now();

INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('checkin_qr_base_url', to_jsonb('https://valoria.tr'::text), now())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = now();

INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('contract_qr_base_url', to_jsonb('https://valoria.tr/sozlesme'::text), now())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = now();

INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('maliye_qr_base_url', to_jsonb('https://valoria.tr/maliye'::text), now())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = now();

COMMENT ON TABLE public.app_settings IS
  'QR URL anahtarları: app_public_base_url (köK), checkin_qr_base_url (/guest?token=), contract_qr_base_url (/sozlesme), maliye_qr_base_url (/maliye). Ödeme QR: valoria.tr/payment/qr — Edge PAYMENT_PUBLIC_BASE_URL=https://valoria.tr';

COMMIT;
