// Valoria Hotel - Expo Push bildirimleri gönderir (push_tokens tablosundan token alır)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchAppIconBadgeForGuest, fetchAppIconBadgeForStaff, iconBadgeForPush } from "../_shared/appBadgeFromRpc.ts";
import { buildExpoPushMessage } from "../_shared/buildExpoPushMessage.ts";
import { getExpoPushHeaders } from "../_shared/expoPushHeaders.ts";
import { resolveNotificationFeatureKey } from "../_shared/resolveNotificationFeatureKey.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;
/** app.config: expo-notifications defaultChannelId + initPushNotificationsPresentation — ses için kanal eşleşmesi (Android 8+). */
const ANDROID_CHANNEL_ID = "valoria_urgent";
const ANDROID_SILENT_CHANNEL_ID = "valoria_silent_v2";
const EMERGENCY_CHANNEL_ID = "valoria_emergency_alert";
const EMERGENCY_SOUND = "emergency_alert.wav";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type PushBody = {
  guestIds?: string[];
  staffIds?: string[];
  partnerUserIds?: string[];
  title: string;
  body?: string | null;
  data?: Record<string, unknown>;
};

/** Boş body bazı cihazlarda bildirimin hiç gösterilmemesine yol açabiliyor. */
function expoDisplayBody(messageBody: string | null | undefined): string {
  const b = (messageBody ?? "").trim();
  return b.length > 0 ? b : "Yeni bildirim";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = (await req.json()) as PushBody;
    const { guestIds = [], staffIds = [], partnerUserIds = [], title, body: messageBody, data = {} } = body;
    if (!title || (guestIds.length === 0 && staffIds.length === 0 && partnerUserIds.length === 0)) {
      return new Response(
        JSON.stringify({ error: "title ve (guestIds, staffIds veya partnerUserIds) gerekli" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    type TokenRow = { token: string; staff_id: string | null; guest_id: string | null; breakfast_partner_user_id: string | null };
    const byToken = new Map<string, TokenRow>();

    if (guestIds.length > 0) {
      const { data: rows } = await supabase
        .from("push_tokens")
        .select("token, staff_id, guest_id, breakfast_partner_user_id")
        .in("guest_id", guestIds)
        .not("token", "is", null);
      for (const r of rows ?? []) {
        const row = r as TokenRow;
        const t = row.token?.trim();
        if (t && t.startsWith("ExponentPushToken")) {
          if (!byToken.has(t)) {
            byToken.set(t, {
              token: t,
              staff_id: row.staff_id,
              guest_id: row.guest_id,
              breakfast_partner_user_id: row.breakfast_partner_user_id,
            });
          }
        }
      }
    }
    if (staffIds.length > 0) {
      const { data: rows } = await supabase
        .from("push_tokens")
        .select("token, staff_id, guest_id, breakfast_partner_user_id")
        .in("staff_id", staffIds)
        .not("token", "is", null);
      for (const r of rows ?? []) {
        const row = r as TokenRow;
        const t = row.token?.trim();
        if (t && t.startsWith("ExponentPushToken")) {
          if (!byToken.has(t)) {
            byToken.set(t, {
              token: t,
              staff_id: row.staff_id,
              guest_id: row.guest_id,
              breakfast_partner_user_id: row.breakfast_partner_user_id,
            });
          }
        }
      }
    }
    if (partnerUserIds.length > 0) {
      const { data: rows } = await supabase
        .from("push_tokens")
        .select("token, staff_id, guest_id, breakfast_partner_user_id")
        .in("breakfast_partner_user_id", partnerUserIds)
        .not("token", "is", null);
      for (const r of rows ?? []) {
        const row = r as TokenRow;
        const t = row.token?.trim();
        if (t && t.startsWith("ExponentPushToken")) {
          if (!byToken.has(t)) {
            byToken.set(t, {
              token: t,
              staff_id: row.staff_id,
              guest_id: row.guest_id,
              breakfast_partner_user_id: row.breakfast_partner_user_id,
            });
          }
        }
      }
    }

    if (byToken.size === 0) {
      return new Response(
        JSON.stringify({ sent: 0, failed: 0, message: "Kayıtlı push token yok" }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const uStaff = new Set<string>();
    const uGuest = new Set<string>();
    for (const r of byToken.values()) {
      if (r.staff_id) uStaff.add(r.staff_id);
      if (r.guest_id) uGuest.add(r.guest_id);
    }
    const badgeByStaff = new Map<string, number>();
    const badgeByGuest = new Map<string, number>();
    await Promise.all(
      [...uStaff].map(async (sid) => {
        badgeByStaff.set(sid, await fetchAppIconBadgeForStaff(supabase, sid));
      })
    );
    await Promise.all(
      [...uGuest].map(async (gid) => {
        badgeByGuest.set(gid, await fetchAppIconBadgeForGuest(supabase, gid));
      })
    );
    function badgeForRow(r: TokenRow): number {
      if (r.staff_id) return iconBadgeForPush(badgeByStaff.get(r.staff_id) ?? 1);
      if (r.guest_id) return iconBadgeForPush(badgeByGuest.get(r.guest_id) ?? 1);
      return 1;
    }

    const displayBody = expoDisplayBody(messageBody);
    const notificationType =
      typeof data?.notificationType === "string"
        ? data.notificationType.trim()
        : typeof data?.notification_type === "string"
          ? data.notification_type.trim()
          : "";
    const category =
      typeof data?.category === "string" ? data.category.trim() : null;
    const featureKeyRaw =
      typeof data?.feature_key === "string" && data.feature_key.trim()
        ? data.feature_key.trim()
        : resolveNotificationFeatureKey(notificationType, category);
    const isEmergency =
      data?.emergency === true ||
      notificationType.includes("emergency") ||
      featureKeyRaw === "emergency_alert";

    const staffOrgById = new Map<string, string>();
    const staffNameById = new Map<string, string>();
    if (uStaff.size > 0) {
      const { data: staffRows } = await supabase
        .from("staff")
        .select("id, organization_id, full_name")
        .in("id", [...uStaff]);
      for (const row of staffRows ?? []) {
        const typed = row as {
          id?: string;
          organization_id?: string | null;
          full_name?: string | null;
        };
        if (typed.id && typed.organization_id) staffOrgById.set(typed.id, typed.organization_id);
        if (typed.id) {
          const name = (typed.full_name ?? "").trim();
          if (name) staffNameById.set(typed.id, name);
        }
      }
    }
    const guestOrgById = new Map<string, string>();
    if (guestIds.length > 0) {
      const { data: guestRows } = await supabase
        .from("guests")
        .select("id, organization_id")
        .in("id", guestIds);
      for (const row of guestRows ?? []) {
        const typed = row as { id?: string; organization_id?: string | null };
        if (typed.id && typed.organization_id) guestOrgById.set(typed.id, typed.organization_id);
      }
    }

    const soundConfigByOrg = new Map<string, Record<string, unknown>>();
    async function soundConfigForOrg(orgId: string | undefined): Promise<Record<string, unknown>> {
      if (!orgId) return {};
      const cacheKey = `${orgId}:${featureKeyRaw}`;
      if (soundConfigByOrg.has(cacheKey)) return soundConfigByOrg.get(cacheKey)!;
      const { data: cfg } = await supabase.rpc("get_notification_sound_push_config", {
        p_organization_id: orgId,
        p_feature_key: featureKeyRaw,
      });
      const resolved = (cfg && typeof cfg === "object" ? cfg : {}) as Record<string, unknown>;
      soundConfigByOrg.set(cacheKey, resolved);
      return resolved;
    }

    const payloadChannelId = typeof data?.androidChannelId === "string" ? data.androidChannelId.trim() : "";
    const payloadSound = typeof data?.sound === "string" ? data.sound.trim() : "";
    const roomCleaningMarked = notificationType === "staff_room_cleaning_status";
    const roomCleaningSoundDisabledStaffIds = new Set<string>();
    if (roomCleaningMarked && staffIds.length > 0) {
      const { data: prefRows } = await supabase
        .from("notification_preferences")
        .select("staff_id, enabled")
        .in("staff_id", staffIds)
        .eq("pref_key", "staff_notif_room_cleaning_mark_sound");
      for (const row of prefRows ?? []) {
        const typed = row as { staff_id?: string | null; enabled?: boolean | null };
        if (typed.staff_id && typed.enabled === false) roomCleaningSoundDisabledStaffIds.add(typed.staff_id);
      }
    }
    const deliveryGroupId = crypto.randomUUID();
    const eventIdByRecipient = new Map<string, string>();
    const logRows: Record<string, unknown>[] = [];
    for (const sid of uStaff) {
      logRows.push({
        organization_id: staffOrgById.get(sid) ?? null,
        user_id: sid,
        user_kind: "staff",
        feature_key: featureKeyRaw,
        notification_title: title.trim(),
        notification_body: displayBody,
        sound_key: featureKeyRaw,
        sound_file_name: payloadSound || null,
        delivery_status: "sent",
        delivery_group_id: deliveryGroupId,
        staff_display_name: staffNameById.get(sid) ?? null,
        metadata: { notificationType: notificationType || null },
      });
    }
    for (const gid of uGuest) {
      logRows.push({
        organization_id: guestOrgById.get(gid) ?? null,
        user_id: gid,
        user_kind: "guest",
        feature_key: featureKeyRaw,
        notification_title: title.trim(),
        notification_body: displayBody,
        sound_key: featureKeyRaw,
        sound_file_name: payloadSound || null,
        delivery_status: "sent",
        delivery_group_id: deliveryGroupId,
        metadata: { notificationType: notificationType || null },
      });
    }
    if (logRows.length > 0) {
      try {
        const { data: insertedIds } = await supabase.rpc("insert_notification_events_batch", {
          p_rows: logRows,
        });
        const ids = Array.isArray(insertedIds)
          ? insertedIds
          : typeof insertedIds === "string"
            ? JSON.parse(insertedIds)
            : [];
        let i = 0;
        for (const sid of uStaff) {
          const id = ids[i];
          if (typeof id === "string") eventIdByRecipient.set(`staff:${sid}`, id);
          i++;
        }
        for (const gid of uGuest) {
          const id = ids[i];
          if (typeof id === "string") eventIdByRecipient.set(`guest:${gid}`, id);
          i++;
        }
      } catch {
        // log optional — push devam eder
      }
    }

    const messages: Record<string, unknown>[] = await Promise.all(
      [...byToken.values()].map(async (row) => {
      const b = badgeForRow(row);
      const recipientKey = row.staff_id ? `staff:${row.staff_id}` : row.guest_id ? `guest:${row.guest_id}` : "";
      const notificationEventId = recipientKey ? eventIdByRecipient.get(recipientKey) : undefined;
      const orgId = row.staff_id
        ? staffOrgById.get(row.staff_id)
        : row.guest_id
          ? guestOrgById.get(row.guest_id)
          : undefined;
      const soundCfg = await soundConfigForOrg(orgId);
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
      const cfgSuppressDefault =
        soundCfg.suppress_default_sound === true || soundCfg.suppress_default_sound === "true";
      // Özel ses yüklüyse sistem varsayılanını kapat (admin toggle veya otomatik).
      const suppressDefaultPush = hasCustomOrgSound && !isEmergency;
      const resolvedChannel =
        payloadChannelId ||
        cfgChannel ||
        (isEmergency ? EMERGENCY_CHANNEL_ID : ANDROID_CHANNEL_ID);
      const resolvedIosSound =
        payloadSound ||
        cfgIosSound ||
        (isEmergency ? EMERGENCY_SOUND : "default");
      // Özel org sesi: push sound null (Android varsayılanı tetiklemez). suppress_default açıksa iOS da null.
      const resolvedSound =
        suppressDefaultPush || (hasCustomOrgSound && !isEmergency) ? null : resolvedIosSound;
      const disableSoundForThisMessage = !!(
        roomCleaningMarked &&
        row.staff_id &&
        roomCleaningSoundDisabledStaffIds.has(row.staff_id) &&
        !isEmergency
      );
      return buildExpoPushMessage({
        to: row.token,
        title: title.trim(),
        body: displayBody,
        badge: b,
        channelId: disableSoundForThisMessage ? ANDROID_SILENT_CHANNEL_ID : resolvedChannel,
        sound: disableSoundForThisMessage ? null : resolvedSound,
        data: {
          ...data,
          feature_key: featureKeyRaw,
          sound: disableSoundForThisMessage ? null : resolvedSound,
          androidChannelId: disableSoundForThisMessage ? ANDROID_SILENT_CHANNEL_ID : resolvedChannel,
          ...(orgId ? { organizationId: orgId } : {}),
          ...(hasCustomOrgSound
            ? {
                customOrgSound: true,
                sound_file_url: cfgSoundFileUrl,
                ...(cfgSoundDuration != null ? { soundDurationSec: cfgSoundDuration } : {}),
                ...(suppressDefaultPush ? { suppressDefaultSound: true } : {}),
              }
            : {}),
          ...(notificationEventId ? { notificationEventId, notification_event_id: notificationEventId } : {}),
          ...(disableSoundForThisMessage ? { muteSound: true } : {}),
          screen:
            typeof data?.screen === "string" && data.screen.trim() ? data.screen : "notifications",
        },
        ...(isEmergency ? { interruptionLevel: "time-sensitive" as const } : {}),
      });
    })
    );

    let sent = 0;
    let failed = 0;
    let expoHttpError: string | undefined;
    const pushTicketErrors: string[] = [];

    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const chunk = messages.slice(i, i + BATCH_SIZE);
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: getExpoPushHeaders(),
        body: JSON.stringify(chunk),
      });
      if (!res.ok) {
        expoHttpError = (await res.text()).slice(0, 800);
        failed += chunk.length;
        continue;
      }
      const result = (await res.json()) as {
        data?: ({ status: string; message?: string }[] | { status: string; message?: string });
      };
      const raw = result.data;
      const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
      for (const item of list) {
        if (item.status === "ok") sent++;
        else {
          failed++;
          if (item.message && pushTicketErrors.length < 5) pushTicketErrors.push(item.message);
        }
      }
    }

    return new Response(
      JSON.stringify({
        sent,
        failed,
        total: byToken.size,
        ...(expoHttpError ? { expoHttpError } : {}),
        ...(pushTicketErrors.length ? { pushTicketErrors } : {}),
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
