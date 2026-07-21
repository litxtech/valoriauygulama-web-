/**
 * KBS otel şifresi — Supabase Edge (VPS gerekmez).
 * ops tablolarına public RPC (SECURITY DEFINER) ile erişir → PGRST106 / exposed ops gerekmez.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptCredential, encryptCredential } from "../_shared/kbsCredentialCrypto.ts";
import { testJandarmaKbsConnection } from "../_shared/kbsJandarmaSoapTest.ts";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SaveBody = {
  facilityCode: string;
  username: string;
  password?: string;
  apiKey?: string;
  providerType?: string;
  isActive?: boolean;
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
      error: {
        code: e.error.code ?? "DB",
        message: e.error.message ?? "RPC error",
      },
    });
  }
  if (e.ok === true) return null;
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    return await handleKbsAdminCredentials(req);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[kbs-admin-credentials]", message, e);
    return json({
      ok: false,
      error: { code: "INTERNAL", message: message || "Edge internal error" },
    });
  }
});

async function handleKbsAdminCredentials(req: Request): Promise<Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return json({ ok: false, error: { code: "AUTH", message: "Oturum gerekli" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const credSecret = (Deno.env.get("KBS_CREDENTIAL_SECRET") ?? "").trim();
  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, error: { code: "CONFIG", message: "Supabase yapılandırması eksik" } });
  }
  if (credSecret.length < 16) {
    return json({
      ok: false,
      error: {
        code: "CONFIG",
        message: "KBS_CREDENTIAL_SECRET Edge secret tanımlı değil (Railway Variables ile aynı, min 16 karakter).",
      },
    });
  }

  let meta: { action?: string; payload?: SaveBody };
  try {
    meta = (await req.json()) as { action?: string; payload?: SaveBody };
  } catch {
    return json({ ok: false, error: { code: "BAD_REQUEST", message: "Geçersiz JSON" } });
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) {
    return json({ ok: false, error: { code: "AUTH", message: "Geçersiz oturum" } });
  }

  const userId = userData.user.id;
  const action = meta.action ?? "get";

  if (action === "get") {
    const { data, error } = await admin.rpc("kbs_edge_get_kbs_credentials", {
      p_user_id: userId,
    });
    if (error) {
      return json({
        ok: false,
        error: {
          code: "RPC",
          message: `${error.message}. SQL Editor: supabase/migrations/284_public_kbs_edge_rpc.sql çalıştırın.`,
        },
      });
    }
    const fail = fromRpcEnvelope(data);
    if (fail) return fail;
    const env = data as RpcEnvelope;
    return json({ ok: true, data: env.data ?? null });
  }

  if (action === "save") {
    const body = meta.payload;
    if (!body) {
      return json({ ok: false, error: { code: "BAD_REQUEST", message: "payload gerekli" } });
    }

    let passwordEncrypted: string | null = null;
    if (body.password?.trim()) {
      passwordEncrypted = await encryptCredential(body.password.trim(), credSecret);
    }

    let apiKeyEncrypted: string | null = null;
    if (body.apiKey?.trim()) {
      apiKeyEncrypted = await encryptCredential(body.apiKey.trim(), credSecret);
    }

    const { data, error } = await admin.rpc("kbs_edge_upsert_kbs_credentials", {
      p_user_id: userId,
      p_facility_code: body.facilityCode,
      p_username: body.username,
      p_password_encrypted: passwordEncrypted,
      p_api_key_encrypted: apiKeyEncrypted,
      p_provider_type: body.providerType?.trim() || "default",
      p_is_active: body.isActive !== false,
    });

    if (error) {
      return json({
        ok: false,
        error: {
          code: "RPC",
          message: `${error.message}. SQL Editor: 284_public_kbs_edge_rpc.sql çalıştırın.`,
        },
      });
    }
    const fail = fromRpcEnvelope(data);
    if (fail) return fail;
    return json({ ok: true, data: { saved: true } });
  }

  if (action === "test_connection") {
    const { data: credData, error: credErr } = await admin.rpc("kbs_edge_get_credentials_for_test", {
      p_user_id: userId,
    });
    if (credErr) {
      return json({
        ok: false,
        error: {
          code: "RPC",
          message: `${credErr.message}. SQL: 286_kbs_edge_test_connection.sql`,
        },
      });
    }
    const credFail = fromRpcEnvelope(credData);
    if (credFail) return credFail;

    const cred = (credData as RpcEnvelope).data as {
      is_active?: boolean;
      hotel_id?: string;
      facility_code?: string;
      username?: string;
      password_encrypted?: string;
    };
    if (cred.is_active === false) {
      return json({
        ok: false,
        error: { code: "VALIDATION", message: "KBS kimlik kaydı pasif (is_active=false)" },
      });
    }

    const facilityCode = typeof cred.facility_code === "string" ? cred.facility_code : "";
    const username = typeof cred.username === "string" ? cred.username : "";
    const passwordEncrypted =
      typeof cred.password_encrypted === "string" ? cred.password_encrypted : "";
    if (!facilityCode || !username || !passwordEncrypted) {
      return json({
        ok: false,
        error: {
          code: "CONFIG",
          message: "KBS kimlik alanları eksik. Önce Kaydet ile tesis kodu / TC / şifre girin.",
        },
      });
    }

    let password: string;
    try {
      password = await decryptCredential(passwordEncrypted, credSecret);
    } catch {
      return json({
        ok: false,
        error: {
          code: "CONFIG",
          message:
            "Şifre çözülemedi. KBS_CREDENTIAL_SECRET Edge ile kayıt sırasında kullanılan değer aynı olmalı; şifreyi yeniden Kaydet.",
        },
      });
    }

    // Doğrudan Edge → Jandarma (Railway kbs-core / eski egress-ip 404 yolunu atla).
    const testRes = await testJandarmaKbsConnection({
      facilityCode,
      kullaniciTc: username,
      password,
    });
    console.log(
      JSON.stringify({
        scope: "kbs-admin-credentials",
        action: "test_connection",
        userId,
        ok: testRes.ok,
        via: "edge_soap",
        egressIp: testRes.egressIp ?? null,
      }),
    );

    if (testRes.ok) {
      await admin.rpc("kbs_edge_touch_kbs_tested", { p_user_id: userId });
    }

    if (!testRes.ok) {
      return json({
        ok: false,
        error: {
          code: /yetkisiz\s*ip|yetkihatasi/i.test(testRes.message) ? "KBS" : "KBS_SOAP",
          message: testRes.message,
          details: {
            via: "edge_soap",
            egressIp: testRes.egressIp ?? null,
          },
        },
      });
    }

    return json({
      ok: true,
      data: {
        message: testRes.message,
        via: "edge_soap",
        code: "OK",
        egressIp: testRes.egressIp ?? null,
      },
    });
  }

  return json({ ok: false, error: { code: "BAD_REQUEST", message: "action: get | save | test_connection" } });
}
