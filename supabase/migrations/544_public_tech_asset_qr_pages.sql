-- Teknik varlık / otel ekipmanı QR'larını internette güvenle açılan bilgi sayfalarına dönüştürür.
BEGIN;

ALTER TABLE public.tech_assets
  ADD COLUMN IF NOT EXISTS public_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS tech_assets_public_token_uniq
  ON public.tech_assets (public_token);

COMMENT ON COLUMN public.tech_assets.public_token IS
  'Tahmin edilmesi zor, herkese açık QR bilgi sayfası anahtarı.';
COMMENT ON COLUMN public.tech_assets.is_public IS
  'Açıksa güvenli alanlar public RPC üzerinden anonim ziyaretçilere gösterilir.';

CREATE OR REPLACE FUNCTION public.get_public_tech_asset(p_token uuid)
RETURNS TABLE (
  id uuid,
  name text,
  asset_code text,
  category_label text,
  description text,
  function_text text,
  warning_text text,
  label_tagline text,
  photo_urls jsonb,
  usage_guide_text text,
  usage_guide_video_url text,
  building_name text,
  location_name text,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.name,
    a.asset_code,
    a.category_label,
    a.description,
    a.function_text,
    a.warning_text,
    a.label_tagline,
    a.photo_urls,
    a.usage_guide_text,
    a.usage_guide_video_url,
    b.name AS building_name,
    l.name AS location_name,
    a.updated_at
  FROM public.tech_assets AS a
  LEFT JOIN public.tech_buildings AS b ON b.id = a.building_id
  LEFT JOIN public.tech_locations AS l ON l.id = a.location_id
  WHERE a.public_token = p_token
    AND a.is_public = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_tech_asset(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_tech_asset(uuid) TO anon, authenticated;

COMMIT;
