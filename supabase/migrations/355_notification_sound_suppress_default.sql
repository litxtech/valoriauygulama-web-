-- Admin: varsayılan sistem/push sesini kapat; yalnızca yüklenen özel ses çalsın.

BEGIN;

ALTER TABLE public.notification_sound_settings
  ADD COLUMN IF NOT EXISTS suppress_default_sound boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.notification_sound_settings.suppress_default_sound IS
  'true ise push/ön plan sistem varsayılanı kapalı; yalnızca sound_file_url (ve Android kanalı) kullanılır.';

-- Mevcut özel ses yüklemelerinde çift sesi önlemek için varsayılanı aç.
UPDATE public.notification_sound_settings
SET suppress_default_sound = true
WHERE nullif(trim(sound_file_url), '') IS NOT NULL
  AND feature_key <> 'emergency_alert';

CREATE OR REPLACE FUNCTION public.get_notification_sound_push_config(
  p_organization_id uuid,
  p_feature_key text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (
      SELECT jsonb_build_object(
        'feature_key', s.feature_key,
        'is_active', s.is_active,
        'ios_push_sound', CASE WHEN s.is_active THEN coalesce(nullif(trim(s.ios_push_sound), ''), 'default') ELSE 'default' END,
        'android_push_sound', CASE WHEN s.is_active THEN coalesce(nullif(trim(s.android_push_sound), ''), 'default') ELSE 'default' END,
        'android_channel_id', coalesce(
          nullif(trim(s.android_channel_id), ''),
          'valoria_ns_' || s.feature_key || '_v' || s.android_channel_version::text
        ),
        'sound_file_url', s.sound_file_url,
        'sound_file_name', s.sound_file_name,
        'sound_duration', s.sound_duration,
        'suppress_default_sound', coalesce(s.suppress_default_sound, false)
          AND nullif(trim(s.sound_file_url), '') IS NOT NULL,
        'priority', CASE WHEN s.feature_key = 'emergency_alert' THEN 'high' ELSE 'normal' END
      )
      FROM public.notification_sound_settings s
      WHERE s.organization_id = p_organization_id
        AND s.feature_key = p_feature_key
        AND s.is_active = true
      LIMIT 1
    ),
    jsonb_build_object(
      'feature_key', p_feature_key,
      'is_active', true,
      'ios_push_sound', CASE WHEN p_feature_key = 'emergency_alert' THEN 'emergency_alert.wav' ELSE 'default' END,
      'android_push_sound', CASE WHEN p_feature_key = 'emergency_alert' THEN 'emergency_alert.wav' ELSE 'default' END,
      'android_channel_id', CASE WHEN p_feature_key = 'emergency_alert' THEN 'valoria_emergency_alert' ELSE 'valoria_urgent' END,
      'suppress_default_sound', false,
      'priority', CASE WHEN p_feature_key = 'emergency_alert' THEN 'high' ELSE 'normal' END
    )
  );
$$;

COMMIT;
