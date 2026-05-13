-- Teknik varlık QR: Expo Router pathname ile uyumlu (valoria:///staff/technical-assets/<id>)
BEGIN;

CREATE OR REPLACE FUNCTION public.tech_assets_set_qr_payload()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.qr_payload IS NULL OR length(trim(NEW.qr_payload)) = 0 THEN
    NEW.qr_payload := 'valoria:///staff/technical-assets/' || NEW.id::text;
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.tech_assets
SET qr_payload = 'valoria:///staff/technical-assets/' || id::text
WHERE trim(qr_payload) LIKE 'valoria://tech-asset/%';

COMMIT;
