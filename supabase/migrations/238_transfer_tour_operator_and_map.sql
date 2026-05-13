-- Transfer & Tur: operatör şirket adı, logo, haritada konum (Yemek & Mekanlar benzeri)

BEGIN;

ALTER TABLE public.transfer_services
  ADD COLUMN IF NOT EXISTS tour_operator_name text,
  ADD COLUMN IF NOT EXISTS tour_operator_logo text,
  ADD COLUMN IF NOT EXISTS map_lat double precision,
  ADD COLUMN IF NOT EXISTS map_lng double precision,
  ADD COLUMN IF NOT EXISTS map_address text;

CREATE INDEX IF NOT EXISTS idx_transfer_services_map_pin
  ON public.transfer_services (organization_id, is_active)
  WHERE map_lat IS NOT NULL AND map_lng IS NOT NULL;

COMMIT;

