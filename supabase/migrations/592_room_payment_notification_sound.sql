-- Oda ödemeleri: özel bildirim sesi varsayılanı (room_payment.wav)
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
      'ios_push_sound', CASE p_feature_key
        WHEN 'emergency_alert' THEN 'emergency_alert.wav'
        WHEN 'new_task' THEN 'task_ping.wav'
        WHEN 'kitchen_request' THEN 'meal_chime.wav'
        WHEN 'salary' THEN 'salary_cash.wav'
        WHEN 'staff_call' THEN 'warning_alert.wav'
        WHEN 'kbs_notification' THEN 'kbs_scan.wav'
        WHEN 'new_message' THEN 'message_pop.wav'
        WHEN 'room_cleaning' THEN 'room_cleaning.wav'
        WHEN 'room_payment' THEN 'room_payment.wav'
        ELSE 'default'
      END,
      'android_push_sound', CASE p_feature_key
        WHEN 'emergency_alert' THEN 'emergency_alert.wav'
        WHEN 'new_task' THEN 'task_ping.wav'
        WHEN 'kitchen_request' THEN 'meal_chime.wav'
        WHEN 'salary' THEN 'salary_cash.wav'
        WHEN 'staff_call' THEN 'warning_alert.wav'
        WHEN 'kbs_notification' THEN 'kbs_scan.wav'
        WHEN 'new_message' THEN 'message_pop.wav'
        WHEN 'room_cleaning' THEN 'room_cleaning.wav'
        WHEN 'room_payment' THEN 'room_payment.wav'
        ELSE 'default'
      END,
      'android_channel_id', CASE p_feature_key
        WHEN 'emergency_alert' THEN 'valoria_emergency_alert'
        WHEN 'new_task' THEN 'valoria_task_v1'
        WHEN 'kitchen_request' THEN 'valoria_meal_v1'
        WHEN 'salary' THEN 'valoria_salary_v1'
        WHEN 'staff_call' THEN 'valoria_warning_v1'
        WHEN 'kbs_notification' THEN 'valoria_kbs_v1'
        WHEN 'new_message' THEN 'valoria_messages_v2'
        WHEN 'room_cleaning' THEN 'valoria_cleaning_v1'
        WHEN 'room_payment' THEN 'valoria_room_payment_v1'
        ELSE 'valoria_urgent'
      END,
      'suppress_default_sound', false,
      'priority', CASE WHEN p_feature_key = 'emergency_alert' THEN 'high' ELSE 'normal' END
    )
  );
$$;

INSERT INTO public.notification_sound_settings (
  organization_id,
  feature_key,
  title,
  description,
  ios_push_sound,
  android_push_sound,
  android_channel_id,
  is_active,
  android_channel_version
)
SELECT
  o.id,
  'room_payment',
  'Oda ödemeleri',
  'Oda tahsilatı: alınacak / alındı bildirimleri',
  'room_payment.wav',
  'room_payment.wav',
  'valoria_room_payment_v1',
  true,
  1
FROM public.organizations o
ON CONFLICT (organization_id, feature_key) DO UPDATE
SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  ios_push_sound = CASE
    WHEN coalesce(nullif(trim(notification_sound_settings.sound_file_url), ''), '') = ''
      THEN EXCLUDED.ios_push_sound
    ELSE notification_sound_settings.ios_push_sound
  END,
  android_push_sound = CASE
    WHEN coalesce(nullif(trim(notification_sound_settings.sound_file_url), ''), '') = ''
      THEN EXCLUDED.android_push_sound
    ELSE notification_sound_settings.android_push_sound
  END,
  android_channel_id = CASE
    WHEN coalesce(nullif(trim(notification_sound_settings.sound_file_url), ''), '') = ''
      THEN EXCLUDED.android_channel_id
    ELSE notification_sound_settings.android_channel_id
  END,
  android_channel_version = GREATEST(coalesce(notification_sound_settings.android_channel_version, 1), 1) + 1,
  updated_at = now();

COMMIT;
