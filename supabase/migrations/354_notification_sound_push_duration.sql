BEGIN;

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
      'priority', CASE WHEN p_feature_key = 'emergency_alert' THEN 'high' ELSE 'normal' END
    )
  );
$$;

COMMIT;
