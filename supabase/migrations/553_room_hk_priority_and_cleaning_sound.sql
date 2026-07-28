-- Temizlik: öncelik/acil bayrağı + özel bildirim sesi varsayılanı
BEGIN;

ALTER TABLE public.room_housekeeping_jobs
  ADD COLUMN IF NOT EXISTS is_priority boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_room_hk_jobs_org_date_priority
  ON public.room_housekeeping_jobs (organization_id, target_date, is_priority DESC, status);

COMMENT ON COLUMN public.room_housekeeping_jobs.is_priority IS
  'Resepsiyon önceliği: müşteri bekliyor / acil temizlenecek oda.';

-- Varsayılan gömülü temizlik sesi (room_cleaning.wav)
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
        ELSE 'valoria_urgent'
      END,
      'suppress_default_sound', false,
      'priority', CASE WHEN p_feature_key = 'emergency_alert' THEN 'high' ELSE 'normal' END
    )
  );
$$;

-- Mevcut org ayarlarında hâlâ default olan temizlik seslerini güncelle
UPDATE public.notification_sound_settings
SET
  title = 'Temizlik',
  description = 'Canlı temizlik: oda eklendi / temizlendi bildirimleri',
  ios_push_sound = 'room_cleaning.wav',
  android_push_sound = 'room_cleaning.wav',
  android_channel_id = 'valoria_cleaning_v1',
  android_channel_version = GREATEST(coalesce(android_channel_version, 1), 1) + 1,
  updated_at = now()
WHERE feature_key = 'room_cleaning'
  AND coalesce(nullif(trim(sound_file_url), ''), '') = ''
  AND (
    coalesce(nullif(trim(ios_push_sound), ''), 'default') IN ('default', '')
    OR coalesce(nullif(trim(android_push_sound), ''), 'default') IN ('default', '')
    OR coalesce(nullif(trim(android_channel_id), ''), '') IN ('', 'valoria_ns_room_cleaning')
  );

COMMIT;
