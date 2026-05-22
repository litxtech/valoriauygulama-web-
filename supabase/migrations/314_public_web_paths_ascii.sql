-- QR base URL: Türkçe segment → ASCII (/sozlesme) — eski /sözleşme linkleri uygulamada alias

BEGIN;

UPDATE public.app_settings
SET value = to_jsonb('https://valoria.tr/sozlesme'::text), updated_at = now()
WHERE key = 'contract_qr_base_url'
  AND (
    value::text ILIKE '%/sözleşme%'
    OR value::text ILIKE '%/s%C3%B6zle%'
    OR value::text ILIKE '%/sozlesme%'
  );

COMMIT;
