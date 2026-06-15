-- Bildirim metinlerinin dil bazlı kalıcı çevirisi (data.i18n[lang]).

BEGIN;

CREATE OR REPLACE FUNCTION public.persist_guest_notification_i18n(
  p_app_token text,
  p_notification_id uuid,
  p_lang text,
  p_title text,
  p_body text DEFAULT ''
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id uuid;
  v_lang text := lower(split_part(coalesce(trim(p_lang), 'tr'), '-', 1));
BEGIN
  IF v_lang NOT IN ('tr', 'en', 'ar', 'de', 'fr', 'ru', 'es') THEN
    v_lang := 'en';
  END IF;

  SELECT id INTO v_guest_id FROM public.guests WHERE app_token = p_app_token LIMIT 1;
  IF v_guest_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.notifications n
  SET data = jsonb_set(
    coalesce(n.data, '{}'::jsonb),
    ARRAY['i18n', v_lang],
    jsonb_build_object(
      'title', left(trim(coalesce(p_title, '')), 500),
      'body', left(trim(coalesce(p_body, '')), 2000)
    ),
    true
  )
  WHERE n.id = p_notification_id
    AND n.guest_id = v_guest_id;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.persist_staff_notification_i18n(
  p_notification_id uuid,
  p_lang text,
  p_title text,
  p_body text DEFAULT ''
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid := public.current_staff_id();
  v_lang text := lower(split_part(coalesce(trim(p_lang), 'tr'), '-', 1));
BEGIN
  IF v_staff_id IS NULL THEN
    RETURN false;
  END IF;
  IF v_lang NOT IN ('tr', 'en', 'ar', 'de', 'fr', 'ru', 'es') THEN
    v_lang := 'en';
  END IF;

  UPDATE public.notifications n
  SET data = jsonb_set(
    coalesce(n.data, '{}'::jsonb),
    ARRAY['i18n', v_lang],
    jsonb_build_object(
      'title', left(trim(coalesce(p_title, '')), 500),
      'body', left(trim(coalesce(p_body, '')), 2000)
    ),
    true
  )
  WHERE n.id = p_notification_id
    AND n.staff_id = v_staff_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.persist_guest_notification_i18n(text, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.persist_staff_notification_i18n(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.persist_guest_notification_i18n(text, uuid, text, text, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.persist_staff_notification_i18n(uuid, text, text, text) TO authenticated, service_role;

COMMIT;
