-- Misafir kapak/profil: çıkış sonrası yeni anonim auth uid'de user_metadata boş kalır;
-- cihaz kimliği ile aynı guests satırında photo_url + cover_image_url kalıcı tutulur.

BEGIN;

ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

COMMENT ON COLUMN public.guests.cover_image_url IS
  'Misafir uygulama profili kapak görseli (anonim tekrar girişte user_metadata yerine kalıcı kaynak).';

CREATE OR REPLACE FUNCTION public.update_my_guest_cover_image_url(p_cover_image_url TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Auth required';
  END IF;

  UPDATE public.guests
  SET cover_image_url = NULLIF(btrim(p_cover_image_url), ''),
      updated_at = now()
  WHERE auth_user_id = v_uid
    AND deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_guest_cover_image_url(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_guest_cover_image_url(TEXT) TO anon;

COMMIT;
