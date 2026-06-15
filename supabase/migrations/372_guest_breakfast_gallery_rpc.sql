-- Misafir ekranı: onaylı kahvaltı teyit kayıtları (fotoğraf galerisi)
CREATE OR REPLACE FUNCTION public.get_guest_breakfast_gallery(
  p_organization_id uuid DEFAULT NULL,
  p_limit int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 60);
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(
    p_organization_id,
    public.current_guest_organization_id()
  ) INTO v_org;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', sub.id,
        'record_date', sub.record_date,
        'guest_count', sub.guest_count,
        'note', sub.note,
        'photo_urls', sub.photo_urls,
        'submitted_at', sub.submitted_at,
        'staff_name', sub.staff_name
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
      bc.submitted_at,
      s.full_name AS staff_name
    FROM public.breakfast_confirmations bc
    LEFT JOIN public.staff s ON s.id = bc.staff_id
    WHERE bc.approved_at IS NOT NULL
      AND bc.rejected_at IS NULL
      AND (v_org IS NULL OR bc.organization_id = v_org)
    ORDER BY bc.record_date DESC, bc.submitted_at DESC
    LIMIT v_limit
  ) sub;

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.get_guest_breakfast_gallery(uuid, int) IS
  'Misafir ana ekranı kahvaltı galerisi — yalnızca onaylı kayıtlar.';

GRANT EXECUTE ON FUNCTION public.get_guest_breakfast_gallery(uuid, int) TO authenticated;
