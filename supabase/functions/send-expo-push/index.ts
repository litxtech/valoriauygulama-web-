// Valoria Hotel - Expo Push bildirimleri gönderir (push_tokens tablosundan token alır)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchAppIconBadgeForGuest, fetchAppIconBadgeForStaff, iconBadgeForPush } from "../_shared/appBadgeFromRpc.ts";
import { buildExpoPushMessage } from "../_shared/buildExpoPushMessage.ts";
import { getExpoPushHeaders } from "../_shared/expoPushHeaders.ts";

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
    const { guestIds = [], staffIds = [], title, body: messageBody, data = {} } = body;
    if (!title || (guestIds.length === 0 && staffIds.length === 0)) {
      return new Response(
        JSON.stringify({ error: "title ve (guestIds veya staffIds) gerekli" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    type TokenRow = { token: string; staff_id: string | null; guest_id: string | null };
    const byToken = new Map<string, TokenRow>();

    if (guestIds.length > 0) {
      const { data: rows } = await supabase
        .from("push_tokens")
        .select("token, staff_id, guest_id")
        .in("guest_id", guestIds)
        .not("token", "is", null);
      for (const r of rows ?? []) {
        const row = r as TokenRow;
        const t = row.token?.trim();
        if (t && t.startsWith("ExponentPushToken")) {
          if (!byToken.has(t)) byToken.set(t, { token: t, staff_id: row.staff_id, guest_id: row.guest_id });
        }
      }
    }
    if (staffIds.length > 0) {
      const { data: rows } = await supabase
        .from("push_tokens")
        .select("token, staff_id, guest_id")
        .in("staff_id", staffIds)
        .not("token", "is", null);
      for (const r of rows ?? []) {
        const row = r as TokenRow;
        const t = row.token?.trim();
        if (t && t.startsWith("ExponentPushToken")) {
          if (!byToken.has(t)) byToken.set(t, { token: t, staff_id: row.staff_id, guest_id: row.guest_id });
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
    const payloadChannelId = typeof data?.androidChannelId === "string" ? data.androidChannelId.trim() : "";
    const payloadSound = typeof data?.sound === "string" ? data.sound.trim() : "";
    const notificationType = typeof data?.notificationType === "string" ? data.notificationType.trim() : "";
    const isEmergency = data?.emergency === true || notificationType.includes("emergency");
    const resolvedChannel = payloadChannelId || (isEmergency ? EMERGENCY_CHANNEL_ID : ANDROID_CHANNEL_ID);
    const resolvedSound = payloadSound || (isEmergency ? EMERGENCY_SOUND : "default");
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
    const messages: Record<string, unknown>[] = [...byToken.values()].map((row) => {
      const b = badgeForRow(row);
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
          ...(disableSoundForThisMessage ? { muteSound: true } : {}),
          screen:
            typeof data?.screen === "string" && data.screen.trim() ? data.screen : "notifications",
        },
      });
    });

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
