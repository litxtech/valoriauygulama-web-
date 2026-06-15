-- Misafir mesaj: yalnızca app_token ile misafir çözümleme (anon JWT, auth.uid yokken).

BEGIN;

CREATE OR REPLACE FUNCTION public.messaging_resolve_guest_id(p_app_token text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.id
  FROM public.guests g
  WHERE g.deleted_at IS NULL
    AND (
      (
        NULLIF(trim(COALESCE(p_app_token, '')), '') IS NOT NULL
        AND g.app_token = NULLIF(trim(p_app_token), '')
      )
      OR (auth.uid() IS NOT NULL AND g.auth_user_id = auth.uid())
    )
  ORDER BY
    CASE
      WHEN NULLIF(trim(COALESCE(p_app_token, '')), '') IS NOT NULL
        AND g.app_token = NULLIF(trim(p_app_token), '') THEN 0
      WHEN auth.uid() IS NOT NULL AND g.auth_user_id = auth.uid() THEN 1
      ELSE 2
    END,
    g.created_at DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.messaging_resolve_guest_id(text) IS
  'Mesajlaşma: app_token veya auth.uid(); anon oturumda app_token yeterli.';

NOTIFY pgrst, 'reload schema';

COMMIT;
