// Valoria Hotel - Org bazlı bildirim sesi / Android kanal çözümleyici (paylaşımlı).
// Bildirim ses sistemini (admin paneli) push tarafında uygular: get_notification_sound_push_config
// RPC'sinden gelen org+feature ayarına göre kanal, ses ve özel ses (sound_file_url) verilerini üretir.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SupabaseClient = ReturnType<typeof createClient>;

export const PUSH_DEFAULT_CHANNEL_ID = "valoria_urgent";
export const PUSH_SILENT_CHANNEL_ID = "valoria_silent_v2";
export const PUSH_EMERGENCY_CHANNEL_ID = "valoria_emergency_alert";
export const PUSH_EMERGENCY_SOUND = "emergency_alert.wav";

export type OrgPushSoundResolution = {
  /** Android NotificationChannel id (org ayarı veya feature varsayılanı). */
  channelId: string;
  /** iOS push sesi / Android default tetikleyici; özel org sesinde null. */
  sound: string | null;
  hasCustomOrgSound: boolean;
  soundFileUrl: string;
  soundDurationSec: number | null;
  suppressDefaultSound: boolean;
};

export type ResolveOrgPushSoundOptions = {
  isEmergency?: boolean;
  /** data.androidChannelId — gönderen tarafça açık kanal. */
  payloadChannelId?: string;
  /** data.sound — gönderen tarafça açık ses. */
  payloadSound?: string;
  /** Org ayarı yoksa kullanılacak kanal (ör. sohbet için valoria_messages_v2). */
  fallbackChannelId?: string;
};

/** Push verisine eklenecek ses alanları (ön plan player + Android kanal eşlemesi için). */
export function orgPushSoundDataExtras(
  res: OrgPushSoundResolution,
  orgId?: string | null
): Record<string, unknown> {
  return {
    sound: res.sound,
    androidChannelId: res.channelId,
    ...(orgId ? { organizationId: orgId } : {}),
    ...(res.hasCustomOrgSound
      ? {
          customOrgSound: true,
          sound_file_url: res.soundFileUrl,
          ...(res.soundDurationSec != null ? { soundDurationSec: res.soundDurationSec } : {}),
          ...(res.suppressDefaultSound ? { suppressDefaultSound: true } : {}),
        }
      : {}),
  };
}

/**
 * featureKey'e göre org bazlı ses çözümleyici döndürür. Org config'leri tek istekte
 * önbelleğe alınır; aynı org tekrar sorgulanmaz.
 */
export function createOrgPushSoundResolver(supabase: SupabaseClient, featureKey: string) {
  const cache = new Map<string, Record<string, unknown>>();

  async function configForOrg(orgId: string | undefined): Promise<Record<string, unknown>> {
    if (!orgId) return {};
    if (cache.has(orgId)) return cache.get(orgId)!;
    const { data: cfg } = await supabase.rpc("get_notification_sound_push_config", {
      p_organization_id: orgId,
      p_feature_key: featureKey,
    });
    const resolved = (cfg && typeof cfg === "object" ? cfg : {}) as Record<string, unknown>;
    cache.set(orgId, resolved);
    return resolved;
  }

  return async function resolve(
    orgId: string | undefined,
    opts: ResolveOrgPushSoundOptions = {}
  ): Promise<OrgPushSoundResolution> {
    const isEmergency = !!opts.isEmergency;
    const payloadChannelId = (opts.payloadChannelId ?? "").trim();
    const payloadSound = (opts.payloadSound ?? "").trim();
    const fallbackChannelId = (opts.fallbackChannelId ?? PUSH_DEFAULT_CHANNEL_ID).trim() || PUSH_DEFAULT_CHANNEL_ID;

    const soundCfg = await configForOrg(orgId);
    const cfgChannel =
      typeof soundCfg.android_channel_id === "string" ? soundCfg.android_channel_id.trim() : "";
    const cfgIosSound =
      typeof soundCfg.ios_push_sound === "string" ? soundCfg.ios_push_sound.trim() : "";
    const cfgSoundFileUrl =
      typeof soundCfg.sound_file_url === "string" ? soundCfg.sound_file_url.trim() : "";
    const cfgSoundDuration =
      typeof soundCfg.sound_duration === "number" && Number.isFinite(soundCfg.sound_duration)
        ? Math.round(soundCfg.sound_duration)
        : null;

    const hasCustomOrgSound = cfgSoundFileUrl.length > 0;
    // Özel ses yüklüyse sistem varsayılanını kapat (çift ses olmasın); acil durum hariç.
    const suppressDefaultPush = hasCustomOrgSound && !isEmergency;
    // RPC, org'a özel aktif satır yoksa genel varsayılan kanalı (valoria_urgent) döndürür.
    // Bu durumda çağıranın fallback kanalını (ör. sohbet için valoria_messages_v2) koru;
    // yalnızca org'a özel feature kanalı (valoria_ns_*) veya açık payload kanalı geçersin.
    const orgSpecificChannel = cfgChannel && cfgChannel !== PUSH_DEFAULT_CHANNEL_ID ? cfgChannel : "";
    const resolvedChannel =
      payloadChannelId ||
      orgSpecificChannel ||
      (isEmergency ? PUSH_EMERGENCY_CHANNEL_ID : fallbackChannelId);
    const resolvedIosSound =
      payloadSound || cfgIosSound || (isEmergency ? PUSH_EMERGENCY_SOUND : "default");
    const resolvedSound = suppressDefaultPush ? null : resolvedIosSound;

    return {
      channelId: resolvedChannel,
      sound: resolvedSound,
      hasCustomOrgSound,
      soundFileUrl: cfgSoundFileUrl,
      soundDurationSec: cfgSoundDuration,
      suppressDefaultSound: suppressDefaultPush,
    };
  };
}
