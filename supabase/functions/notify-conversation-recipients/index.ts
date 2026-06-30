// Valoria Hotel - Sohbet mesajı sonrası alıcılara push bildirimi gönderir
// Kullanım: POST { conversationId, excludeAppToken?, excludeStaffId?, title, body, data? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchAppIconBadgeForGuest, fetchAppIconBadgeForStaff, iconBadgeForPush } from "../_shared/appBadgeFromRpc.ts";
import { buildExpoPushMessage } from "../_shared/buildExpoPushMessage.ts";
import { getExpoPushHeaders } from "../_shared/expoPushHeaders.ts";
import { resolveNotificationFeatureKey } from "../_shared/resolveNotificationFeatureKey.ts";
import { createOrgPushSoundResolver, orgPushSoundDataExtras } from "../_shared/orgPushSound.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;
// Org ses ayarı (admin paneli) yoksa sohbet için varsayılan kanal (Instagram tarzı mesaj sesi).
const ANDROID_CHANNEL_ID = "valoria_messages_v2";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  conversationId: string;
  excludeAppToken?: string | null;
  excludeStaffId?: string | null;
  excludeStaffIds?: string[];
  excludeGuestIds?: string[];
  onlyStaffIds?: string[];
  onlyGuestIds?: string[];
  title: string;
  subtitle?: string | null;
  body?: string | null;
  data?: Record<string, unknown>;
};

function expoDisplayBody(messageBody: string | null | undefined): string {
  const b = (messageBody ?? "").trim();
  return b.length > 0 ? b : "Yeni bildirim";
}

function mentionPrefType(data: Record<string, unknown>): string {
  const raw = data?.notificationType ?? data?.notification_type;
  const t = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (t === "chat_mention") return "staff_mention";
  return t || "message";
}

async function filterStaffByPreference(
  supabase: ReturnType<typeof createClient>,
  staffIds: string[],
  prefType: string
): Promise<string[]> {
  if (staffIds.length === 0) return [];
  const { data, error } = await supabase.rpc("filter_staff_notification_recipients", {
    p_staff_ids: staffIds,
    p_notification_type: prefType,
  });
  if (error) {
    console.warn("filter_staff_notification_recipients", error.message);
    return [];
  }
  return (data ?? []).map((r: { staff_id: string }) => r.staff_id).filter(Boolean);
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
    const body = (await req.json()) as Body;
    const {
      conversationId,
      excludeAppToken,
      excludeStaffId,
      excludeStaffIds = [],
      excludeGuestIds = [],
      onlyStaffIds = [],
      onlyGuestIds = [],
      title,
      subtitle,
      body: messageBody,
      data = {},
    } = body;
    if (!conversationId || !title?.trim()) {
      return new Response(
        JSON.stringify({ error: "conversationId ve title gerekli" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    let excludeGuestId: string | null = null;
    if (excludeAppToken) {
      const { data: guestRow } = await supabase
        .from("guests")
        .select("id")
        .eq("app_token", excludeAppToken)
        .maybeSingle();
      excludeGuestId = (guestRow as { id: string } | null)?.id ?? null;
    }

    const { data: participants } = await supabase
      .from("conversation_participants")
      .select("participant_id, participant_type, is_muted")
      .eq("conversation_id", conversationId)
      .is("left_at", null);

    const excludeStaffSet = new Set(
      [excludeStaffId, ...excludeStaffIds].filter((id): id is string => Boolean(id))
    );
    const excludeGuestSet = new Set(
      [excludeGuestId, ...excludeGuestIds].filter((id): id is string => Boolean(id))
    );
    const onlyStaffSet = new Set(onlyStaffIds.filter(Boolean));
    const onlyGuestSet = new Set(onlyGuestIds.filter(Boolean));
    const filterOnly = onlyStaffSet.size > 0 || onlyGuestSet.size > 0;

    const guestIds: string[] = [];
    const staffIds: string[] = [];
    for (const p of participants ?? []) {
      const row = p as { participant_id: string; participant_type: string; is_muted?: boolean };
      if (row.participant_type === "guest") {
        if (excludeGuestSet.has(row.participant_id)) continue;
        if (filterOnly && !onlyGuestSet.has(row.participant_id)) continue;
        guestIds.push(row.participant_id);
      } else if (row.participant_type === "staff" || row.participant_type === "admin") {
        if (row.is_muted) continue;
        if (excludeStaffSet.has(row.participant_id)) continue;
        if (filterOnly && !onlyStaffSet.has(row.participant_id)) continue;
        staffIds.push(row.participant_id);
      }
    }

    const prefType = mentionPrefType(data);
    const filteredStaffIds = await filterStaffByPreference(supabase, staffIds, prefType);

    if (guestIds.length === 0 && filteredStaffIds.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, failed: 0, message: "Bildirilecek alıcı yok" }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const titleTrim = title.trim();
    const subtitleTrim = subtitle?.trim() ?? null;
    const bodyTrim = messageBody?.trim() ?? null;
    const displayBody = expoDisplayBody(bodyTrim);
    const payload = {
      ...data,
      screen: typeof data.screen === 'string' && data.screen.trim() ? data.screen.trim() : "messages",
      notificationType:
        (typeof data.notificationType === "string" && data.notificationType.trim()) ||
        (typeof data.notification_type === "string" && data.notification_type.trim()) ||
        "chat_message",
      ...(subtitleTrim ? { pushSubtitle: subtitleTrim } : {}),
      ...(bodyTrim ? { messagePreview: bodyTrim, messageBody: bodyTrim } : {}),
    };

    // Mesaj için sadece push; "Bildirimler" listesine (notifications tablosu) kayıt eklenmez — çift kayıt önlenir.
    // Simge sayacı: app_badge_total_* = okunmamış notifications + okunmamış mesajlar (yeni mesaj zaten tabloda).

    const badgeByStaff = new Map<string, number>();
    const badgeByGuest = new Map<string, number>();
    await Promise.all(
      filteredStaffIds.map(async (sid) => {
        badgeByStaff.set(sid, await fetchAppIconBadgeForStaff(supabase, sid));
      })
    );
    await Promise.all(
      guestIds.map(async (gid) => {
        badgeByGuest.set(gid, await fetchAppIconBadgeForGuest(supabase, gid));
      })
    );

    type TokenRow = { token: string; staff_id: string | null; guest_id: string | null };
    const byToken = new Map<string, TokenRow>();

    if (guestIds.length > 0) {
      const { data: rows } = await supabase
        .from("push_tokens")
        .select("token, staff_id, guest_id")
        .in("guest_id", guestIds)
        .not("token", "is", null);
      for (const r of rows ?? []) {
        const t = (r as { token: string; staff_id: string | null; guest_id: string | null }).token?.trim();
        if (t && t.startsWith("ExponentPushToken")) {
          if (!byToken.has(t)) byToken.set(t, { token: t, staff_id: r.staff_id ?? null, guest_id: r.guest_id ?? null });
        }
      }
    }
    if (filteredStaffIds.length > 0) {
      const { data: rows } = await supabase
        .from("push_tokens")
        .select("token, staff_id, guest_id")
        .in("staff_id", filteredStaffIds)
        .not("token", "is", null);
      for (const r of rows ?? []) {
        const t = (r as { token: string; staff_id: string | null; guest_id: string | null }).token?.trim();
        if (t && t.startsWith("ExponentPushToken")) {
          if (!byToken.has(t)) byToken.set(t, { token: t, staff_id: r.staff_id ?? null, guest_id: r.guest_id ?? null });
        }
      }
    }

    if (byToken.size === 0) {
      return new Response(
        JSON.stringify({ sent: 0, failed: 0, message: "Kayıtlı push token yok" }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    function badgeForRow(row: TokenRow): number {
      if (row.staff_id) return iconBadgeForPush(badgeByStaff.get(row.staff_id) ?? 1);
      if (row.guest_id) return iconBadgeForPush(badgeByGuest.get(row.guest_id) ?? 1);
      return 1;
    }

    const threadId =
      typeof data?.threadId === "string" && data.threadId.trim()
        ? data.threadId.trim()
        : conversationId;

    // Bildirim ses sistemi: sohbet mesajları "new_message" özelliğine bağlanır; admin panelinden
    // bu özelliğe atanan org sesi / Android kanalı / "varsayılanı kapat" ayarı push'a uygulanır.
    const notificationType =
      typeof payload.notificationType === "string" && payload.notificationType.trim()
        ? payload.notificationType.trim()
        : "chat_message";
    const featureKey =
      typeof data?.feature_key === "string" && data.feature_key.trim()
        ? data.feature_key.trim()
        : resolveNotificationFeatureKey(notificationType);
    const payloadChannelId =
      typeof data?.androidChannelId === "string" ? data.androidChannelId.trim() : "";
    const payloadSound = typeof data?.sound === "string" ? data.sound.trim() : "";

    const orgByStaff = new Map<string, string>();
    const orgByGuest = new Map<string, string>();
    const staffIdSet = new Set<string>();
    const guestIdSet = new Set<string>();
    for (const row of byToken.values()) {
      if (row.staff_id) staffIdSet.add(row.staff_id);
      if (row.guest_id) guestIdSet.add(row.guest_id);
    }
    if (staffIdSet.size > 0) {
      const { data: staffRows } = await supabase
        .from("staff")
        .select("id, organization_id")
        .in("id", [...staffIdSet]);
      for (const row of staffRows ?? []) {
        const typed = row as { id?: string; organization_id?: string | null };
        if (typed.id && typed.organization_id) orgByStaff.set(typed.id, typed.organization_id);
      }
    }
    if (guestIdSet.size > 0) {
      const { data: guestRows } = await supabase
        .from("guests")
        .select("id, organization_id")
        .in("id", [...guestIdSet]);
      for (const row of guestRows ?? []) {
        const typed = row as { id?: string; organization_id?: string | null };
        if (typed.id && typed.organization_id) orgByGuest.set(typed.id, typed.organization_id);
      }
    }

    const resolveOrgSound = createOrgPushSoundResolver(supabase, featureKey);

    const messages = await Promise.all(
      [...byToken.values()].map(async (row) => {
        const b = badgeForRow(row);
        const orgId = row.staff_id
          ? orgByStaff.get(row.staff_id)
          : row.guest_id
            ? orgByGuest.get(row.guest_id)
            : undefined;
        const soundRes = await resolveOrgSound(orgId, {
          payloadChannelId,
          payloadSound,
          fallbackChannelId: ANDROID_CHANNEL_ID,
        });
        return buildExpoPushMessage({
          to: row.token,
          title: titleTrim,
          subtitle: subtitleTrim ?? undefined,
          body: displayBody,
          badge: b,
          channelId: soundRes.channelId,
          sound: soundRes.sound,
          threadId,
          data: {
            ...payload,
            feature_key: featureKey,
            ...orgPushSoundDataExtras(soundRes, orgId),
          },
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
        total: messages.length,
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
