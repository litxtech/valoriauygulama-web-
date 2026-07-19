-- Public QR menü: onaylı kahvaltı teyit galerisi (anon erişim)
CREATE OR REPLACE FUNCTION public.get_public_menu_breakfast_gallery(
  p_organization_id uuid,
  p_limit int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 40);
  v_enabled boolean;
  v_rows jsonb;
BEGIN
  IF p_organization_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(s.feature_enabled, true)
  INTO v_enabled
  FROM public.breakfast_confirmation_settings s
  WHERE s.organization_id = p_organization_id
  LIMIT 1;

  IF v_enabled IS FALSE THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', sub.id,
        'record_date', sub.record_date,
        'guest_count', sub.guest_count,
        'note', sub.note,
        'photo_urls', sub.photo_urls,
        'submitted_at', sub.submitted_at
      )
      ORDER BY sub.record_date DESC, sub.submitted_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      bc.id,
      bc.record_date,
      bc.guest_count,
      bc.note,
      COALESCE(bc.photo_urls, ARRAY[]::text[]) AS photo_urls,
      bc.submitted_at
    FROM public.breakfast_confirmations bc
    WHERE bc.organization_id = p_organization_id
      AND bc.approved_at IS NOT NULL
      AND bc.rejected_at IS NULL
      AND COALESCE(cardinality(bc.photo_urls), 0) > 0
    ORDER BY bc.record_date DESC, bc.submitted_at DESC
    LIMIT v_limit
  ) sub;

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.get_public_menu_breakfast_gallery(uuid, int) IS
  'Public QR menü: yalnızca onaylı kahvaltı teyitleri (fotoğraflı), tarih azalan.';

GRANT EXECUTE ON FUNCTION public.get_public_menu_breakfast_gallery(uuid, int) TO anon, authenticated;
