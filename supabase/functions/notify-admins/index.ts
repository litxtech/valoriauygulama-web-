// Valoria Hotel - Tüm admin hesaplarına push bildirimi gönderir
// Kullanım: POST { "title": "...", "body": "...", "data": { "url": "/admin/..." } }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchAppIconBadgeForStaff, iconBadgeForPush } from "../_shared/appBadgeFromRpc.ts";
import { getExpoPushHeaders } from "../_shared/expoPushHeaders.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;
const ANDROID_CHANNEL_ID = "valoria_urgent";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  title: string;
  body?: string | null;
  data?: Record<string, unknown>;
  /** Sohbet mesajı: bu konuşmadaki (staff/admin) katılımcılara ayrıca notify-conversation-recipients gider; aynı kişiye iki push/ses olmasın. */
  conversationId?: string | null;
};

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
    const { title, body: messageBody, data = {}, conversationId: bodyConversationId } = (await req.json()) as Body;
    if (!title?.trim()) {
      return new Response(JSON.stringify({ error: "title gerekli" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { data: staffRows } = await supabase
      .from("staff")
      .select("id, role, app_permissions")
      .eq("is_active", true);

    function isAdminPanelRecipient(row: {
      id: string;
      role: string | null;
      app_permissions: Record<string, unknown> | null;
    }): boolean {
      if (row.role === "admin") return true;
      const perms = row.app_permissions;
      if (perms && typeof perms === "object" && perms.super_admin === true) return true;
      return false;
    }

    let adminIds = (staffRows ?? [])
      .filter((r) =>
        isAdminPanelRecipient(
          r as { id: string; role: string | null; app_permissions: Record<string, unknown> | null }
        )
      )
      .map((r) => (r as { id: string }).id);
    if (bodyConversationId && String(bodyConversationId).trim().length > 0) {
      const { data: parts } = await supabase
        .from("conversation_participants")
        .select("participant_id, participant_type")
        .eq("conversation_id", String(bodyConversationId).trim())
        .is("left_at", null);
      const inChat = new Set<string>();
      for (const p of parts ?? []) {
        const row = p as { participant_id: string; participant_type: string };
        if (row.participant_type === "staff" || row.participant_type === "admin") {
          inChat.add(row.participant_id);
        }
      }
      if (inChat.size > 0) {
        adminIds = adminIds.filter((id) => !inChat.has(id));
      }
    }
    if (adminIds.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, failed: 0, message: "Aktif admin yok (veya hepsi sohbette — ayrı push alıyor)" }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    type TokenRow = { token: string; staff_id: string | null };
    const byToken = new Map<string, TokenRow>();
    const { data: tokenRows } = await supabase
      .from("push_tokens")
      .select("token, staff_id")
      .in("staff_id", adminIds)
      .not("token", "is", null);
    for (const r of tokenRows ?? []) {
      const row = r as TokenRow;
      const t = row.token?.trim();
      if (t && t.startsWith("ExponentPushToken") && !byToken.has(t)) {
        byToken.set(t, { token: t, staff_id: row.staff_id });
      }
    }
    if (byToken.size === 0) {
      return new Response(
        JSON.stringify({ sent: 0, failed: 0, message: "Admin cihazında kayıtlı push token yok" }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const uStaff = new Set<string>();
    for (const r of byToken.values()) {
      if (r.staff_id) uStaff.add(r.staff_id);
    }
    const badgeByStaff = new Map<string, number>();
    await Promise.all(
      [...uStaff].map(async (sid) => {
        badgeByStaff.set(sid, await fetchAppIconBadgeForStaff(supabase, sid));
      })
    );
    function badgeForRow(r: TokenRow): number {
      if (r.staff_id) return iconBadgeForPush(badgeByStaff.get(r.staff_id) ?? 1);
      return 1;
    }

    const displayBody = expoDisplayBody(messageBody);
    const basePayload = {
      ...data,
      screen: data?.screen ?? "admin",
    };
    const messages = [...byToken.values()].map((row) => {
      const b = badgeForRow(row);
      return {
        to: row.token,
        title: title.trim(),
        body: displayBody,
        channelId: ANDROID_CHANNEL_ID,
        priority: "high" as const,
        sound: "default" as const,
        badge: b,
        interruptionLevel: "active" as const,
        data: { ...basePayload, app_badge: b },
      };
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
        adminCount: adminIds.length,
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
