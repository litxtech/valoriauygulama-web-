import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AcceptanceRecord = {
  id: string;
  guest_id?: string | null;
  room_id?: string | null;
  contract_lang: string;
  accepted_at: string;
};

type PrinterSettings = {
  enabled: boolean;
  email: string;
  print_type: "all" | "new_only" | "checkin_only";
};

function isMissingTableError(error: { code?: string; status?: number } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || error.status === 404;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** Uzun metni paragraflara bölerek A4 üzerinde doğal sayfa kırılımları sağlar. */
function contractContentToParagraphHtml(raw: string): string {
  const t = raw.trim();
  if (!t) return '<p class="contract-p">Sozlesme metni bulunamadi.</p>';
  const parts = t.split(/\n{2,}/);
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p class="contract-p">${escapeHtml(p).replaceAll("\n", "<br/>")}</p>`)
    .join("\n");
}

const CONTRACT_TEMPLATE_HTML = `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Valoria Sozlesme</title>
    <style>
      @page {
        size: A4;
        margin: 14mm 12mm 16mm 12mm;
      }
      html, body {
        font-family: "Segoe UI", Arial, sans-serif;
        color: #0f172a;
        margin: 0;
        padding: 0;
        font-size: 11pt;
        line-height: 1.45;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .wrap {
        max-width: 100%;
        box-sizing: border-box;
      }
      .header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        border-bottom: 2px solid #1a365d;
        padding-bottom: 10px;
        margin-bottom: 14px;
      }
      .logo {
        font-size: 18px;
        font-weight: 700;
        color: #1a365d;
      }
      .meta {
        font-size: 10pt;
        color: #475569;
        text-align: right;
        line-height: 1.35;
      }
      .section-title {
        font-size: 12pt;
        font-weight: 700;
        margin-top: 12px;
        margin-bottom: 8px;
        page-break-after: avoid;
      }
      .card {
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 10px 12px;
        margin-bottom: 10px;
        background: #f8fafc;
        page-break-inside: avoid;
      }
      .line {
        margin-bottom: 4px;
        font-size: 10.5pt;
      }
      .contract-wrap {
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 10px 12px 12px;
        background: #fff;
      }
      .contract-p {
        margin: 0 0 10px 0;
        font-size: 10.5pt;
        line-height: 1.5;
        text-align: justify;
        word-wrap: break-word;
        overflow-wrap: anywhere;
        orphans: 3;
        widows: 3;
      }
      .contract-p:last-child {
        margin-bottom: 0;
      }
      .signature {
        margin-top: 22px;
        display: flex;
        justify-content: space-between;
        gap: 16px;
        page-break-inside: avoid;
      }
      .sign-box {
        flex: 1;
        border-top: 1px solid #0f172a;
        padding-top: 8px;
        font-size: 10pt;
        min-height: 64px;
      }
      .foot {
        margin-top: 18px;
        font-size: 9pt;
        color: #334155;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
    <div class="header">
      <div class="logo">VALORIA HOTEL</div>
      <div class="meta">
        Oda: {{room_number}}<br />
        Dil: {{contract_lang}}<br />
        Onay: {{accepted_at}}
      </div>
    </div>

    <div class="section-title">Misafir Bilgileri</div>
    <div class="card">
      <div class="line"><strong>Ad Soyad:</strong> {{guest_name}}</div>
      <div class="line"><strong>Oda Numarasi:</strong> {{room_number}}</div>
      <div class="line"><strong>Onay Tarihi:</strong> {{accepted_at}}</div>
    </div>

    <div class="section-title">Sozlesme Metni</div>
    <div class="contract-wrap">{{contract_content}}</div>

    <div class="signature">
      <div class="sign-box">Misafir Imza</div>
      <div class="sign-box">Yetkili Imza</div>
    </div>

    <div class="foot">
      T.C. Hazine ve Maliye Bakanligi duzenlemeleri kapsaminda kayit altina alinmistir.
    </div>
    </div>
  </body>
</html>`;

async function resolvePrinterSettings(
  supabase: ReturnType<typeof createClient>,
): Promise<PrinterSettings> {
  let { data, error } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", "printer")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (isMissingTableError(error as any)) {
    const fallback = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "printer")
      .order("updated_at", { ascending: false })
      .limit(1);
    data = fallback.data as any;
    error = fallback.error as any;
  }

  if (error) {
    throw new Error(`Printer ayarlari okunamadi: ${error.message}`);
  }

  const value = (data?.[0]?.value ?? {}) as Partial<PrinterSettings>;
  return {
    enabled: value.enabled !== false,
    email: (value.email ?? "536w8897jy@hpeprint.com").trim(),
    print_type: (value.print_type as PrinterSettings["print_type"]) ?? "all",
  };
}

async function buildContractHtml(
  supabase: ReturnType<typeof createClient>,
  record: AcceptanceRecord,
): Promise<{ html: string; guestName: string; roomNumber: string }> {
  const [guestRes, roomRes, contractRes] = await Promise.all([
    record.guest_id
      ? supabase.from("guests").select("full_name, status").eq("id", record.guest_id).maybeSingle()
      : Promise.resolve({ data: null }),
    record.room_id
      ? supabase.from("rooms").select("room_number").eq("id", record.room_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("contract_templates")
      .select("content")
      .eq("lang", record.contract_lang)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const guestName = guestRes.data?.full_name?.trim() || "Misafir";
  const roomNumber = roomRes.data?.room_number?.trim() || "-";
  const acceptedAt = new Date(record.accepted_at).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
  const contractContent = contractRes.data?.content?.trim() || "Sozlesme metni bulunamadi.";
  const contractBodyHtml = contractContentToParagraphHtml(contractContent);

  const html = CONTRACT_TEMPLATE_HTML
    .replaceAll("{{guest_name}}", escapeHtml(guestName))
    .replaceAll("{{room_number}}", escapeHtml(roomNumber))
    .replaceAll("{{contract_lang}}", escapeHtml(record.contract_lang))
    .replaceAll("{{accepted_at}}", escapeHtml(acceptedAt))
    .replaceAll("{{contract_content}}", contractBodyHtml);

  return { html, guestName, roomNumber };
}

async function generatePdfFromHtml(html: string): Promise<Uint8Array> {
  const apiKey = Deno.env.get("PDFSHIFT_API_KEY");
  if (!apiKey) {
    throw new Error("PDFSHIFT_API_KEY tanimli degil");
  }

  const res = await fetch("https://api.pdfshift.io/v3/convert/pdf", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: html,
      landscape: false,
      format: "A4",
      margin: "10mm 11mm 12mm 11mm",
      use_print: true,
      delay: 1200,
      sandbox: false,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`PDF olusturulamadi: ${res.status} ${detail}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function sendEmailWithAttachment(opts: {
  to: string;
  subject: string;
  pdfBytes: Uint8Array;
}) {
  const smtpHost = (Deno.env.get("SMTP_HOST") ?? "").trim();
  const smtpPortRaw = (Deno.env.get("SMTP_PORT") ?? "").trim();
  const smtpUser = (Deno.env.get("SMTP_USER") ?? "").trim();
  const smtpPass = Deno.env.get("SMTP_PASS") ?? "";
  const rawFrom = (Deno.env.get("SMTP_FROM_EMAIL") ?? Deno.env.get("PRINTER_FROM_EMAIL") ?? "").replace(/[\r\n]+/g, "").trim();
  const from = rawFrom.includes("@") && rawFrom.includes("<") && rawFrom.includes(">") ? rawFrom : "Valoria <noreply@localhost>";

  if (!smtpHost || !smtpPortRaw || !smtpUser || !smtpPass) {
    throw new Error("SMTP secrets eksik: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS");
  }
  const smtpPort = Number(smtpPortRaw);
  if (!Number.isFinite(smtpPort) || smtpPort <= 0) throw new Error("SMTP_PORT sayisal olmali");
  const secureRaw = (Deno.env.get("SMTP_SECURE") ?? "").trim().toLowerCase();
  const smtpSecure = secureRaw ? ["1", "true", "yes", "on"].includes(secureRaw) : smtpPort === 465;

  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < opts.pdfBytes.length; i += chunkSize) {
    const chunk = opts.pdfBytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  const contentBase64 = btoa(binary);
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: { user: smtpUser, pass: smtpPass },
  });
  await transporter.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    html: "<p>Sozlesme otomatik olarak olusturulmus ve ektedir.</p>",
    attachments: [{ filename: "sozlesme.pdf", content: contentBase64, encoding: "base64" }],
  });
}

async function insertPrinterLog(
  supabase: ReturnType<typeof createClient>,
  contractId: string | null,
  status: "success" | "failed" | "skipped",
  errorMessage?: string,
) {
  try {
    await supabase.from("printer_logs").insert({
      contract_id: contractId,
      sent_at: new Date().toISOString(),
      status,
      error_message: errorMessage ?? null,
    });
  } catch {
    // Log yazimi ana akisi bozmamali.
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // catch blogu icin: hata olursa contract id ile printer_logs yazalim.
  let contractIdForLog: string | null = null;

  try {
    const body = await req.json();
    const record = (body?.record ?? body) as AcceptanceRecord;
    const eventType = (body?.type ?? "INSERT") as string;
    const isTest = body?.test === true;
    if (!record?.id) throw new Error("record.id bulunamadi");
    contractIdForLog = record.id;

    const printer = await resolvePrinterSettings(supabase);
    if (!printer.enabled) {
      await insertPrinterLog(supabase, isTest ? null : record.id, "skipped", "Yazdirma ayari kapali");
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (!isTest && eventType !== "INSERT") {
      await insertPrinterLog(supabase, isTest ? null : record.id, "skipped", `Desteklenmeyen event: ${eventType}`);
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { data: guestRow } = record.guest_id
      ? await supabase.from("guests").select("status").eq("id", record.guest_id).maybeSingle()
      : { data: null };
    if (printer.print_type === "checkin_only" && guestRow?.status !== "checked_in") {
      await insertPrinterLog(supabase, isTest ? null : record.id, "skipped", "Sadece check-in secili");
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Test butonu yalnizca akisin ayakta oldugunu kontrol etsin; dis servis cagrisi yapmasin.
    if (isTest) {
      await insertPrinterLog(supabase, null, "skipped", "Test pingi basarili");
      return new Response(JSON.stringify({ ok: true, test: true }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const hasPdfShiftKey = !!Deno.env.get("PDFSHIFT_API_KEY");
    const hasSmtpCore = !!Deno.env.get("SMTP_HOST") && !!Deno.env.get("SMTP_PORT") && !!Deno.env.get("SMTP_USER") && !!Deno.env.get("SMTP_PASS");
    if (!hasPdfShiftKey || !hasSmtpCore) {
      await insertPrinterLog(
        supabase,
        record.id,
        "skipped",
        "PDFSHIFT_API_KEY veya SMTP secrets eksik oldugu icin gonderim yapilmadi",
      );
      return new Response(
        JSON.stringify({
          ok: true,
          skipped: true,
        }),
        {
          status: 200,
          headers: { ...CORS, "Content-Type": "application/json" },
        },
      );
    }

    const { html, guestName, roomNumber } = await buildContractHtml(supabase, record);
    const pdf = await generatePdfFromHtml(html);
    const subject = `Valoria Sozlesme - Oda ${roomNumber} - ${guestName}`;
    await sendEmailWithAttachment({
      to: printer.email,
      subject,
      pdfBytes: pdf,
    });

    await insertPrinterLog(supabase, isTest ? null : record.id, "success");
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Beklenmeyen hata";
    try {
      // body okumasini garanti etmek zor; en azindan contractIdForLog varsa log'a yazalim.
      let maybeContractId: string | null = contractIdForLog;
      try {
        const body = await req.clone().json();
        if (body?.test === true) maybeContractId = null;
        else maybeContractId = body?.record?.id ?? maybeContractId;
      } catch {
        // no-op
      }
      await insertPrinterLog(supabase, maybeContractId, "failed", message);
    } catch {
      // no-op
    }
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
