-- Özellik bazlı VARSAYILAN bildirim sesleri/kanalları.
-- Org admin özel ses yüklemese bile şu özellikler kendi gömülü seslerini/kanallarını alır:
--   emergency_alert, new_task, kitchen_request (yemek listesi), salary,
--   staff_call (resmi uyarılar), kbs_notification (kimlik/pasaport), new_message (mesaj).
-- Diğer tüm özellikler varsayılan (valoria_urgent + 'default') kalır.
-- Gömülü ses dosyaları: assets/sounds/*.wav (app.config.js → expo-notifications.sounds).
-- Kanallar uygulamada herkeste oluşturulur (lib/notificationsPush.ts → FEATURE_SOUND_CHANNELS).

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
    -- 1) Org'a özel aktif ayar varsa onu kullan (admin paneli yüklemesi / kanal versiyonu).
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
    -- 2) Özel ayar yoksa: bilinen özellikler için gömülü varsayılan ses + kanal; diğerleri 'default'.
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
        ELSE 'valoria_urgent'
      END,
      'suppress_default_sound', false,
      'priority', CASE WHEN p_feature_key = 'emergency_alert' THEN 'high' ELSE 'normal' END
    )
  );
$$;

COMMIT;
