/**
 * KBS personel: oda listesi + oda ataması (VPS ops-proxy gerekmez).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RpcEnvelope = {
  ok?: boolean;
  data?: unknown;
  error?: { code?: string; message?: string };
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function fromRpcEnvelope(raw: unknown): Response | null {
  if (raw == null || typeof raw !== "object") return null;
  const e = raw as RpcEnvelope;
  if (e.ok === false && e.error) {
    return json({
      ok: false,
      error: { code: e.error.code ?? "DB", message: e.error.message ?? "RPC error" },
    });
  }
  if (e.ok === true) return null;
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return json({ ok: false, error: { code: "AUTH", message: "Oturum gerekli" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return json({ ok: false, error: { code: "CONFIG", message: "Supabase yapılandırması eksik" } });
    }

    let meta: {
      action?: string;
      guestDocumentId?: string;
      roomId?: string;
      roomNumber?: string;
      assignments?: { guestDocumentId: string }[];
    };
    try {
      meta = (await req.json()) as typeof meta;
    } catch {
      return json({ ok: false, error: { code: "BAD_REQUEST", message: "Geçersiz JSON" } });
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) {
      return json({ ok: false, error: { code: "AUTH", message: "Geçersiz oturum" } });
    }

    const userId = userData.user.id;
    const action = meta.action ?? "list_rooms";

    if (action === "list_rooms") {
      const { data, error } = await admin.rpc("kbs_edge_list_rooms", { p_user_id: userId });
      if (error) {
        return json({
          ok: false,
          error: {
            code: "RPC",
            message: `${error.message}. SQL: supabase/migrations/285_kbs_edge_rooms_and_assign.sql`,
          },
        });
      }
      const fail = fromRpcEnvelope(data);
      if (fail) return fail;
      const env = data as RpcEnvelope;
      return json({ ok: true, data: env.data ?? [] });
    }

    if (action === "ensure_room") {
      const roomNumber = meta.roomNumber;
      if (!roomNumber || !String(roomNumber).trim()) {
        return json({ ok: false, error: { code: "BAD_REQUEST", message: "roomNumber gerekli" } });
      }
      const { data, error } = await admin.rpc("kbs_edge_ensure_room", {
        p_user_id: userId,
        p_room_number: String(roomNumber).trim(),
      });
      if (error) {
        return json({
          ok: false,
          error: {
            code: "RPC",
            message: `${error.message}. SQL: supabase/migrations/337_kbs_edge_ensure_room.sql`,
          },
        });
      }
      const fail = fromRpcEnvelope(data);
      if (fail) return fail;
      const env = data as RpcEnvelope;
      return json({ ok: true, data: env.data ?? null });
    }

    if (action === "deactivate_room") {
      const roomId = meta.roomId;
      if (!roomId) {
        return json({ ok: false, error: { code: "BAD_REQUEST", message: "roomId gerekli" } });
      }
      const { data, error } = await admin.rpc("kbs_edge_deactivate_room", {
        p_user_id: userId,
        p_room_id: roomId,
      });
      if (error) {
        return json({
          ok: false,
          error: {
            code: "RPC",
            message: `${error.message}. SQL: supabase/migrations/532_kbs_edge_deactivate_room.sql`,
          },
        });
      }
      const fail = fromRpcEnvelope(data);
      if (fail) return fail;
      const env = data as RpcEnvelope;
      return json({ ok: true, data: env.data ?? { id: roomId } });
    }

    if (action === "assign_room") {
      const guestDocumentId = meta.guestDocumentId;
      const roomId = meta.roomId;
      if (!guestDocumentId || !roomId) {
        return json({ ok: false, error: { code: "BAD_REQUEST", message: "guestDocumentId ve roomId gerekli" } });
      }
      const { data, error } = await admin.rpc("kbs_edge_assign_room", {
        p_user_id: userId,
        p_guest_document_id: guestDocumentId,
        p_room_id: roomId,
      });
      if (error) {
        return json({
          ok: false,
          error: {
            code: "RPC",
            message: `${error.message}. SQL: 285_kbs_edge_rooms_and_assign.sql`,
          },
        });
      }
      const fail = fromRpcEnvelope(data);
      if (fail) return fail;
      const env = data as RpcEnvelope;
      return json({ ok: true, data: env.data ?? null });
    }

    if (action === "assign_rooms_batch") {
      const roomId = meta.roomId;
      const assignments = meta.assignments;
      if (!roomId || !Array.isArray(assignments) || assignments.length === 0) {
        return json({
          ok: false,
          error: { code: "BAD_REQUEST", message: "roomId ve assignments[] gerekli" },
        });
      }
      let assigned = 0;
      const errors: string[] = [];
      for (const row of assignments) {
        const guestDocumentId = row?.guestDocumentId;
        if (!guestDocumentId) continue;
        const { data, error } = await admin.rpc("kbs_edge_assign_room", {
          p_user_id: userId,
          p_guest_document_id: guestDocumentId,
          p_room_id: roomId,
        });
        if (error) {
          errors.push(error.message);
          continue;
        }
        const fail = fromRpcEnvelope(data);
        if (fail) {
          errors.push("assign failed");
          continue;
        }
        assigned += 1;
      }
      if (assigned === 0) {
        return json({
          ok: false,
          error: { code: "ASSIGN_FAILED", message: errors[0] ?? "Oda atanamadı" },
        });
      }
      return json({ ok: true, data: { assigned, total: assignments.length } });
    }

    return json({
      ok: false,
      error: { code: "BAD_REQUEST", message: "action: list_rooms | ensure_room | deactivate_room | assign_room | assign_rooms_batch" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[kbs-staff-ops]", message, e);
    return json({ ok: false, error: { code: "INTERNAL", message: message || "Edge internal error" } });
  }
});
