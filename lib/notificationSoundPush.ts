import {
  resolveNotificationFeatureKey,
} from '@/lib/notificationSoundCatalog';

/** Push data payload'a feature_key + ses meta ekle */
export function enrichNotificationPushData(
  params: {
    notificationType?: string | null;
    category?: string | null;
    data?: Record<string, unknown>;
  }
): Record<string, unknown> {
  const base = params.data && typeof params.data === 'object' ? { ...params.data } : {};
  const featureKey =
    typeof base.feature_key === 'string' && base.feature_key.trim()
      ? base.feature_key.trim()
      : resolveNotificationFeatureKey(params.notificationType, params.category);

  return {
    ...base,
    feature_key: featureKey,
    notificationType: params.notificationType ?? base.notificationType ?? base.notification_type,
  };
}
