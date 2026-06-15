import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeFrom(raw: string): string {
  const val = raw.replace(/[\r\n]+/g, "").trim();
  const ok = val.includes("@") && val.includes("<") && val.includes(">");
  return ok ? val : "Valoria <onboarding@resend.dev>";
}

async function sendViaResend(opts: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  to: string;
  subject: string;
  fileName: string;
  contentBase64: string;
}) {
  const transporter = nodemailer.createTransport({
    host: opts.host,
    port: opts.port,
    secure: opts.secure,
    auth: {
      user: opts.user,
      pass: opts.pass,
    },
  });
  return await transporter.sendMail({
    from: opts.from,
    to: opts.to,
    subject: opts.subject,
    html: "<p>Valoria belgesi ektedir.</p>",
    attachments: [
      {
        filename: opts.fileName,
        content: opts.contentBase64,
        encoding: "base64",
      },
    ],
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: { message: "Method not allowed" } }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const to = String(body?.to ?? "").trim();
    const subject = String(body?.subject ?? "Valoria Belge").trim();
    const fileName = String(body?.fileName ?? "belge.pdf").trim();
    const contentBase64 = String(body?.contentBase64 ?? "").trim();

    if (!to || !contentBase64) {
      return new Response(JSON.stringify({ ok: false, error: { message: "to ve contentBase64 zorunlu" } }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    const sbUser = createClient(supabaseUrl, serviceRoleKey, { global: { headers: { Authorization: auth } } });
    const { data: userData, error: userErr } = await sbUser.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ ok: false, error: { message: "Unauthorized" } }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const smtpHost = (Deno.env.get("SMTP_HOST") ?? "").trim();
    const smtpPortRaw = (Deno.env.get("SMTP_PORT") ?? "").trim();
    const smtpUser = (Deno.env.get("SMTP_USER") ?? "").trim();
    const smtpPass = (Deno.env.get("SMTP_PASS") ?? "").trim();
    const smtpFrom = normalizeFrom(Deno.env.get("SMTP_FROM_EMAIL") ?? Deno.env.get("PRINTER_FROM_EMAIL") ?? "");

    if (!smtpHost || !smtpPortRaw || !smtpUser || !smtpPass) {
      return new Response(JSON.stringify({ ok: false, error: { message: "SMTP secrets eksik: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS" } }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const smtpPort = Number(smtpPortRaw);
    if (!Number.isFinite(smtpPort) || smtpPort <= 0) {
      return new Response(JSON.stringify({ ok: false, error: { message: "SMTP_PORT sayisal olmali (587/465 gibi)" } }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const secureRaw = (Deno.env.get("SMTP_SECURE") ?? "").trim().toLowerCase();
    const smtpSecure = secureRaw ? ["1", "true", "yes", "on"].includes(secureRaw) : smtpPort === 465;

    try {
      await sendViaResend({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        user: smtpUser,
        pass: smtpPass,
        from: smtpFrom,
        to,
        subject,
        fileName,
        contentBase64,
      });
    } catch (mailErr) {
      const detail = mailErr instanceof Error ? mailErr.message : String(mailErr);
      return new Response(JSON.stringify({ ok: false, error: { message: `SMTP mail gonderilemedi: ${detail}` } }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: { message: e instanceof Error ? e.message : String(e) } }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
