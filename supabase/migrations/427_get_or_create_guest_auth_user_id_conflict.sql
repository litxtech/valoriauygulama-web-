-- guests.auth_user_id unique: e-posta/cihaz eşlemesinde ikinci satıra uid yazılınca 23505 oluşuyordu.
-- Önce uid'ye bağlı misafiri döndür; bağlama güncellemelerinde çakışmayı atla.

CREATE OR REPLACE FUNCTION public.get_or_create_guest_for_caller(
  p_full_name TEXT DEFAULT NULL,
  p_device_install_id TEXT DEFAULT NULL
)
RETURNS TABLE(guest_id UUID, app_token TEXT, is_new BOOLEAN)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_token TEXT;
  v_guest_id UUID;
  v_caller_email TEXT;
  v_name TEXT;
  v_is_anon BOOLEAN;
  v_auto_email TEXT;
  v_is_new BOOLEAN := false;
  v_device TEXT;
  v_amr TEXT;
  v_uid_guest_id UUID;
  v_uid_guest_token TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  v_caller_email := auth.jwt() ->> 'email';
  IF v_caller_email IS NOT NULL AND trim(v_caller_email) <> '' THEN
    v_caller_email := lower(trim(v_caller_email));
  ELSE
    v_caller_email := NULL;
  END IF;

  v_is_anon := coalesce((auth.jwt() ->> 'is_anonymous') = 'true', false);
  IF NOT v_is_anon THEN
    IF (auth.jwt() -> 'app_metadata' ->> 'provider') = 'anonymous' THEN
      v_is_anon := true;
    ELSIF coalesce((auth.jwt() -> 'app_metadata' -> 'providers')::text, '') LIKE '%anonymous%' THEN
      v_is_anon := true;
    ELSE
      v_amr := coalesce((auth.jwt() -> 'amr')::text, '');
      IF v_amr LIKE '%anonymous%' THEN
        v_is_anon := true;
      END IF;
    END IF;
  END IF;

  v_device := nullif(btrim(p_device_install_id), '');
  IF v_device IS NOT NULL AND length(v_device) < 8 THEN
    v_device := NULL;
  END IF;

  -- 0) Bu auth uid zaten bir misafire bağlı — tek kayıt (unique ihlali önlenir)
  SELECT g.id, g.app_token INTO v_guest_id, v_token
  FROM public.guests g
  WHERE g.auth_user_id = v_uid AND g.deleted_at IS NULL
  ORDER BY g.updated_at DESC NULLS LAST, g.created_at DESC
  LIMIT 1;
  IF v_guest_id IS NOT NULL THEN
    IF v_caller_email IS NOT NULL THEN
      UPDATE public.guests SET email = v_caller_email
      WHERE id = v_guest_id AND (email IS NULL OR trim(email) = '');
    END IF;
    IF v_is_anon AND v_device IS NOT NULL THEN
      UPDATE public.guests
      SET app_device_install_id = coalesce(nullif(btrim(app_device_install_id), ''), v_device),
          updated_at = now()
      WHERE id = v_guest_id
        AND (app_device_install_id IS NULL OR btrim(app_device_install_id) = '');
    END IF;
    guest_id := v_guest_id;
    app_token := v_token;
    is_new := false;
    RETURN NEXT;
    RETURN;
  END IF;

  -- 1) E-posta ile eşleşme (silinmiş hariç)
  IF v_caller_email IS NOT NULL THEN
    IF v_is_anon THEN
      SELECT g.id, g.app_token INTO v_guest_id, v_token
      FROM public.guests g
      WHERE lower(trim(g.email)) = v_caller_email
        AND g.deleted_at IS NULL
        AND (
          g.is_guest_app_account = true
          OR lower(trim(g.email)) LIKE '%@valoria.guest'
        )
      LIMIT 1;
    ELSE
      SELECT g.id, g.app_token INTO v_guest_id, v_token
      FROM public.guests g
      WHERE lower(trim(g.email)) = v_caller_email
        AND g.deleted_at IS NULL
        AND (
          g.is_guest_app_account = false
          OR g.auth_user_id = v_uid
        )
      LIMIT 1;
    END IF;

    IF v_guest_id IS NOT NULL THEN
      SELECT g.id, g.app_token INTO v_uid_guest_id, v_uid_guest_token
      FROM public.guests g
      WHERE g.auth_user_id = v_uid AND g.deleted_at IS NULL AND g.id IS DISTINCT FROM v_guest_id
      LIMIT 1;
      IF v_uid_guest_id IS NOT NULL THEN
        v_guest_id := v_uid_guest_id;
        v_token := v_uid_guest_token;
      ELSE
        UPDATE public.guests
        SET auth_user_id = v_uid
        WHERE id = v_guest_id AND (auth_user_id IS NULL OR auth_user_id = v_uid);
      END IF;
      guest_id := v_guest_id;
      app_token := v_token;
      is_new := false;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  -- 2b) Anonim + cihaz: bu cihazdaki misafir satırını auth uid'ye bağla
  IF v_is_anon AND v_device IS NOT NULL THEN
    SELECT g.id, g.app_token INTO v_guest_id, v_token
    FROM public.guests g
    WHERE g.app_device_install_id = v_device
      AND g.deleted_at IS NULL
    ORDER BY g.updated_at DESC NULLS LAST, g.created_at DESC
    LIMIT 1;
    IF v_guest_id IS NOT NULL THEN
      SELECT g.id, g.app_token INTO v_uid_guest_id, v_uid_guest_token
      FROM public.guests g
      WHERE g.auth_user_id = v_uid AND g.deleted_at IS NULL
      LIMIT 1;
      IF v_uid_guest_id IS NOT NULL THEN
        v_guest_id := v_uid_guest_id;
        v_token := v_uid_guest_token;
      ELSE
        UPDATE public.guests
        SET auth_user_id = v_uid,
            updated_at = now()
        WHERE id = v_guest_id AND (auth_user_id IS NULL OR auth_user_id = v_uid);
      END IF;
      guest_id := v_guest_id;
      app_token := v_token;
      is_new := false;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  UPDATE public.guests SET auth_user_id = NULL WHERE auth_user_id = v_uid AND deleted_at IS NOT NULL;

  -- 3) Yeni misafir
  v_name := coalesce(nullif(trim(p_full_name), ''), 'Misafir');
  IF v_caller_email IS NOT NULL THEN
    v_name := coalesce(nullif(trim(p_full_name), ''), split_part(v_caller_email, '@', 1), 'Misafir');
  END IF;
  IF v_is_anon THEN
    v_name := 'Misafir';
    v_auto_email := 'guest_' || replace(gen_random_uuid()::text, '-', '') || '@valoria.guest';
  ELSE
    v_auto_email := v_caller_email;
  END IF;
  IF v_name = '' THEN
    v_name := 'Misafir';
  END IF;

  BEGIN
    INSERT INTO public.guests (
      email,
      full_name,
      contract_lang,
      status,
      auth_user_id,
      is_guest_app_account,
      app_device_install_id
    )
    VALUES (
      coalesce(v_auto_email, v_caller_email),
      v_name,
      'tr',
      'pending',
      v_uid,
      v_is_anon,
      CASE WHEN v_is_anon AND v_device IS NOT NULL THEN v_device ELSE NULL END
    )
    RETURNING public.guests.id, public.guests.app_token INTO v_guest_id, v_token;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT g.id, g.app_token INTO v_guest_id, v_token
      FROM public.guests g
      WHERE g.auth_user_id = v_uid AND g.deleted_at IS NULL
      LIMIT 1;
      IF v_guest_id IS NULL THEN
        RAISE;
      END IF;
  END;

  v_is_new := true;
  guest_id := v_guest_id;
  app_token := v_token;
  is_new := v_is_new;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.get_or_create_guest_for_caller(TEXT, TEXT) IS
  'Misafir getir/oluştur; auth_user_id unique çakışmasında mevcut uid satırını döndürür.';
