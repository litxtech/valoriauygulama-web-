-- Personel uyarıları: ek görseller, okundu notu, RPC güncellemesi; bildirim türü filtresi.

BEGIN;

ALTER TABLE public.staff_personnel_warnings
  ADD COLUMN IF NOT EXISTS image_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.staff_personnel_warnings
  ADD COLUMN IF NOT EXISTS acknowledgement_note text;

COMMENT ON COLUMN public.staff_personnel_warnings.image_urls IS 'Uyarıya eklenen görsel URL listesi (public).';
COMMENT ON COLUMN public.staff_personnel_warnings.acknowledgement_note IS 'Personelin okundu onayı sırasında yazdığı isteğe bağlı not.';

DROP FUNCTION IF EXISTS public.acknowledge_staff_personnel_warning(uuid);

CREATE FUNCTION public.acknowledge_staff_personnel_warning(
  p_warning_id uuid,
  p_acknowledgement_note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
  v_note text;
BEGIN
  v_note := NULLIF(trim(COALESCE(p_acknowledgement_note, '')), '');
  UPDATE public.staff_personnel_warnings
  SET
    acknowledged_at = now(),
    acknowledgement_note = v_note
  WHERE id = p_warning_id
    AND subject_staff_id = public.current_staff_id()
    AND acknowledged_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.acknowledge_staff_personnel_warning(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_staff_personnel_warning(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.acknowledge_staff_personnel_warning(uuid, text) IS
  'Konu personel uyarıyı okudu onayı; isteğe bağlı kısa not kaydedilir. İkinci argüman atlanabilir (varsayılan NULL).';

-- Bildirim: okundu onayı yöneticiye de gitsin (tercih filtresinden muaf)
CREATE OR REPLACE FUNCTION public.filter_staff_notification_recipients(
  p_staff_ids uuid[],
  p_notification_type text
)
RETURNS TABLE(staff_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text := lower(coalesce(trim(p_notification_type), ''));
BEGIN
  IF p_staff_ids IS NULL OR array_length(p_staff_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF v_type IN (
    'message',
    'admin_announcement',
    'staff_personnel_warning',
    'staff_personnel_warning_ack'
  ) THEN
    RETURN QUERY
    SELECT s.id
    FROM public.staff s
    WHERE s.id = ANY (p_staff_ids);
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.id
  FROM public.staff s
  LEFT JOIN public.notification_preferences np
    ON np.staff_id = s.id
   AND np.pref_key = 'staff_notif_' || v_type
  WHERE s.id = ANY (p_staff_ids)
    AND coalesce(np.enabled, true);
END;
$$;

COMMENT ON FUNCTION public.filter_staff_notification_recipients(uuid[], text) IS
  'Personel alıcı listesini tercihe göre filtreler; message, admin_announcement, staff_personnel_warning ve staff_personnel_warning_ack daima açıktır.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'staff-personnel-warnings',
  'staff-personnel-warnings',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "staff_personnel_warnings_storage_insert" ON storage.objects;
CREATE POLICY "staff_personnel_warnings_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'staff-personnel-warnings');

DROP POLICY IF EXISTS "staff_personnel_warnings_storage_read" ON storage.objects;
CREATE POLICY "staff_personnel_warnings_storage_read" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'staff-personnel-warnings');

COMMIT;
