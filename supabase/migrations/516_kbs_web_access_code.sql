-- valoria.tr/kbs web paneli erişim parolası: admin panelinden değiştirilebilir.
-- Parola düz metin saklanmaz; salt'lı SHA-256 (maliye_hash_pin ile aynı desen).
-- verify/status anon çağrılabilir (kapı Supabase login'inden ÖNCE gösterilir);
-- set yalnızca staff admin tarafından çağrılabilir.

BEGIN;

CREATE TABLE IF NOT EXISTS public.kbs_web_access (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  code_hash text,
  code_salt text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.kbs_web_access ENABLE ROW LEVEL SECURITY;
-- Bilerek policy yok: tabloya yalnızca aşağıdaki SECURITY DEFINER RPC'ler erişir.

-- Salt'lı SHA-256 (extensions.digest — projede maliye_hash_pin ile aynı).
CREATE OR REPLACE FUNCTION public.kbs_web_hash(code_input text, salt_input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(
    extensions.digest(COALESCE(code_input, '') || ':' || COALESCE(salt_input, ''), 'sha256'),
    'hex'
  );
$$;

-- Kapı durumu (anon): { required: bool, version: text|null }.
-- version = updated_at damgası; parola değişince cihazların yeniden sorması için.
CREATE OR REPLACE FUNCTION public.kbs_web_access_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.kbs_web_access WHERE id = true AND code_hash IS NOT NULL
    )
      THEN jsonb_build_object('required', false, 'version', NULL)
    ELSE (
      SELECT jsonb_build_object('required', true, 'version', to_char(updated_at, 'YYYYMMDDHH24MISSMS'))
      FROM public.kbs_web_access
      WHERE id = true
    )
  END;
$$;

-- Aday parolayı doğrula (anon). Sadece true/false döner; parolayı sızdırmaz.
-- Parola tanımlı değilse serbest (true).
CREATE OR REPLACE FUNCTION public.verify_kbs_access_code(code text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash text;
  v_salt text;
BEGIN
  SELECT code_hash, code_salt INTO v_hash, v_salt
  FROM public.kbs_web_access
  WHERE id = true;

  IF v_hash IS NULL THEN
    RETURN true;
  END IF;

  RETURN public.kbs_web_hash(COALESCE(code, ''), v_salt) = v_hash;
END;
$$;

-- Parolayı belirle/değiştir/kaldır — yalnızca staff admin.
-- Boş kod gönderilirse kapı kapatılır (parola kaldırılır).
CREATE OR REPLACE FUNCTION public.set_kbs_access_code(code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := nullif(btrim(COALESCE(code, '')), '');
  v_salt text;
BEGIN
  IF NOT public.current_user_is_staff_admin() THEN
    RAISE EXCEPTION 'Bu işlemi yalnızca yönetici yapabilir.' USING ERRCODE = '42501';
  END IF;

  IF v_code IS NULL THEN
    INSERT INTO public.kbs_web_access (id, code_hash, code_salt, updated_at, updated_by)
    VALUES (true, NULL, NULL, now(), auth.uid())
    ON CONFLICT (id) DO UPDATE
      SET code_hash = NULL, code_salt = NULL, updated_at = now(), updated_by = auth.uid();
    RETURN;
  END IF;

  v_salt := encode(extensions.gen_random_bytes(16), 'hex');

  INSERT INTO public.kbs_web_access (id, code_hash, code_salt, updated_at, updated_by)
  VALUES (true, public.kbs_web_hash(v_code, v_salt), v_salt, now(), auth.uid())
  ON CONFLICT (id) DO UPDATE
    SET code_hash = EXCLUDED.code_hash,
        code_salt = EXCLUDED.code_salt,
        updated_at = now(),
        updated_by = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.kbs_web_access_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kbs_web_access_status() TO anon, authenticated;

REVOKE ALL ON FUNCTION public.verify_kbs_access_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_kbs_access_code(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.set_kbs_access_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_kbs_access_code(text) TO authenticated;

COMMENT ON FUNCTION public.set_kbs_access_code(text) IS
  'valoria.tr/kbs web paneli erişim parolasını belirler (yalnızca admin). Boş kod parolayı kaldırır.';

COMMIT;
