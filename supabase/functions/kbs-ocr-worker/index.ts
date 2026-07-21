/**
 * Kimlik OCR sunucu fallback — Google Cloud Vision DOCUMENT_TEXT_DETECTION.
 * Secrets: GOOGLE_VISION_API_KEY (veya GOOGLE_APPLICATION_CREDENTIALS_JSON + Vision API)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

type ParsedSoft = {
  documentType: string;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  documentNumber: string | null;
  documentSeries: string | null;
  nationalityCode: string | null;
  issuingCountryCode: string | null;
  birthDate: string | null;
  expiryDate: string | null;
  gender: "M" | "F" | "X" | null;
  motherName: string | null;
  fatherName: string | null;
  rawMrz: string | null;
  confidence: number | null;
  checksumsValid: boolean | null;
  warnings: string[];
};

function normalizeDate(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  }
  const ymd = s.match(/^(\d{4})[./\-](\d{1,2})[./\-](\d{1,2})$/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2]!.padStart(2, "0")}-${ymd[3]!.padStart(2, "0")}`;
  }
  return null;
}

function pickAfterLabel(text: string, labels: RegExp[]): string | null {
  for (const re of labels) {
    const m = text.match(re);
    if (m?.[1]) {
      const v = m[1].replace(/\s+/g, " ").trim();
      if (v.length >= 2) return v;
    }
  }
  return null;
}

function extractMrz(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim().toUpperCase().replace(/\s+/g, ""))
    .filter((l) => /^[A-Z0-9<]{20,}$/.test(l));
  if (lines.length >= 2) {
    const mrz = lines.slice(0, 3).join("\n");
    if (mrz.includes("<<") || /^P[A-Z<]/.test(lines[0]!) || /^I[A-Z<]/.test(lines[0]!)) {
      return mrz;
    }
  }
  return null;
}

/** TD3 pasaport MRZ satır-2'den alan doldur (eksik alan taraması için). */
function fillFromPassportMrz(parsed: ParsedSoft, rawMrz: string): ParsedSoft {
  const lines = rawMrz
    .split(/\r?\n/)
    .map((l) => l.trim().toUpperCase().replace(/\s+/g, ""))
    .filter(Boolean);
  if (lines.length < 2) return parsed;
  const l1 = lines[0]!;
  const l2 = lines[1]!;
  const out = { ...parsed, rawMrz, documentType: "passport" as const };

  if (!out.lastName || !out.firstName) {
    // P<TURSURNAME<<GIVEN<NAMES<<<<<<<<<<<<<<
    const namePart = l1.length > 5 ? l1.slice(5) : "";
    const [surnameRaw, givenRaw] = namePart.split("<<");
    if (surnameRaw && !out.lastName) {
      out.lastName = surnameRaw.replace(/</g, " ").replace(/\s+/g, " ").trim() || null;
    }
    if (givenRaw && !out.firstName) {
      out.firstName = givenRaw.replace(/</g, " ").replace(/\s+/g, " ").trim() || null;
    }
    out.fullName = [out.firstName, out.lastName].filter(Boolean).join(" ").trim() || out.fullName;
  }

  if (l2.length >= 28) {
    if (!out.documentNumber) {
      const doc = l2.slice(0, 9).replace(/</g, "").trim();
      if (doc.length >= 5) out.documentNumber = doc;
    }
    if (!out.nationalityCode) {
      const nat = l2.slice(10, 13).replace(/</g, "");
      if (nat.length === 3) out.nationalityCode = nat === "TUR" ? "TC" : nat;
    }
    if (!out.birthDate) {
      const yy = l2.slice(13, 15);
      const mm = l2.slice(15, 17);
      const dd = l2.slice(17, 19);
      if (/^\d{6}$/.test(yy + mm + dd)) {
        const year = Number(yy) > 50 ? `19${yy}` : `20${yy}`;
        out.birthDate = `${year}-${mm}-${dd}`;
      }
    }
    if (!out.gender) {
      const g = l2[20];
      if (g === "M" || g === "F" || g === "X") out.gender = g;
    }
    if (!out.expiryDate) {
      const yy = l2.slice(21, 23);
      const mm = l2.slice(23, 25);
      const dd = l2.slice(25, 27);
      if (/^\d{6}$/.test(yy + mm + dd)) {
        const year = Number(yy) > 50 ? `19${yy}` : `20${yy}`;
        out.expiryDate = `${year}-${mm}-${dd}`;
      }
    }
  }
  if (!out.issuingCountryCode && out.nationalityCode) {
    out.issuingCountryCode = out.nationalityCode;
  }
  return out;
}

function parseVisionText(fullText: string): ParsedSoft {
  const text = fullText.replace(/\u0000/g, " ");
  const upper = text.toUpperCase();

  const lastName =
    pickAfterLabel(text, [
      /(?:SOYAD[İI]?|SURNAME|SURNAMES|NOM|APELLIDOS?)\s*[:\-]?\s*([A-ZÇĞİÖŞÜÂÊÎÔÛÄËÏÖÜ\-\s]{2,40})/i,
    ]) ?? null;
  const firstName =
    pickAfterLabel(text, [
      /(?:GIVEN\s*NAMES?|FIRST\s*NAMES?|FORENAMES?|AD[İI]|ADI|PRENOMS?)\s*[:\-]?\s*([A-ZÇĞİÖŞÜÂÊÎÔÛÄËÏÖÜ\-\s]{2,48})/i,
    ]) ?? null;

  let documentNumber: string | null = null;
  const tc = upper.match(/\b([1-9]\d{10})\b/);
  if (tc) documentNumber = tc[1]!;
  if (!documentNumber) {
    const pass = upper.match(/\b([A-Z]{1,3}\d{5,9})\b/);
    if (pass) documentNumber = pass[1]!;
  }
  if (!documentNumber) {
    const ykn = upper.match(/\b(99\d{9})\b/);
    if (ykn) documentNumber = ykn[1]!;
  }

  const birthDate = normalizeDate(
    pickAfterLabel(text, [
      /(?:DO[ĞG]UM\s*TAR[İI]H[İI]?|DATE\s*OF\s*BIRTH|BIRTH\s*DATE|DOB)\s*[:\-]?\s*([0-9./\-]{8,10})/i,
    ]),
  );
  const expiryDate = normalizeDate(
    pickAfterLabel(text, [
      /(?:SON\s*GE[ÇC]ERL[İI]L[İI]K|GE[ÇC]ERL[İI]L[İI]K\s*TAR[İI]H[İI]?|DATE\s*OF\s*EXPIRY|EXPIRY|EXPIRES?)\s*[:\-]?\s*([0-9./\-]{8,10})/i,
    ]),
  );

  let nationalityCode: string | null = null;
  const nat = pickAfterLabel(text, [
    /(?:UYRUK|NATIONALITY|VATANDA[ŞS]LI[ĞG]I?)\s*[:\-]?\s*([A-ZÇĞİÖŞÜ]{2,20})/i,
  ]);
  if (nat) {
    const n = nat.toUpperCase().replace(/[^A-Z]/g, "");
    if (n === "TURKIYE" || n === "TURKEY" || n === "TUR" || n === "TR" || n === "TC") {
      nationalityCode = "TC";
    } else if (n.length >= 2 && n.length <= 5) {
      nationalityCode = n.slice(0, 3);
    }
  }
  if (!nationalityCode && /\bT[ÜU]RK[İI]YE\b/i.test(text)) nationalityCode = "TC";

  let gender: "M" | "F" | "X" | null = null;
  if (/\b(?:ERKEK|MALE|\/\s*M\b|\bM\s*\/)\b/i.test(text)) gender = "M";
  else if (/\b(?:KADIN|FEMALE|\/\s*F\b|\bF\s*\/)\b/i.test(text)) gender = "F";

  const rawMrz = extractMrz(text);
  let result: ParsedSoft = {
    documentType:
      /PASAPORT|PASSPORT|PASSEPORT/i.test(text) || (rawMrz?.startsWith("P") ?? false)
        ? "passport"
        : "id_card",
    fullName: [firstName, lastName].filter(Boolean).join(" ").trim() || null,
    firstName,
    lastName,
    middleName: null,
    documentNumber,
    documentSeries: null,
    nationalityCode,
    issuingCountryCode: nationalityCode === "TC" ? "TC" : nationalityCode,
    birthDate,
    expiryDate,
    gender,
    motherName: null,
    fatherName: null,
    rawMrz,
    confidence: 0.72,
    checksumsValid: null,
    warnings: ["server_ocr_vision"],
  };

  if (rawMrz) {
    result = fillFromPassportMrz(result, rawMrz);
    result.confidence = 0.88;
  }
  return result;
}

async function visionDocumentText(imageBytes: Uint8Array, apiKey: string): Promise<string> {
  // Büyük görsellerde spread stack overflow olmasın
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < imageBytes.length; i += chunk) {
    binary += String.fromCharCode(...imageBytes.subarray(i, i + chunk));
  }
  const b64 = btoa(binary);
  const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          image: { content: b64 },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        },
      ],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`VISION_HTTP_${res.status}: ${errText.slice(0, 240)}`);
  }
  const body = await res.json() as {
    responses?: Array<{
      fullTextAnnotation?: { text?: string };
      textAnnotations?: Array<{ description?: string }>;
      error?: { message?: string };
    }>;
  };
  const first = body.responses?.[0];
  if (first?.error?.message) throw new Error(first.error.message);
  const full = first?.fullTextAnnotation?.text?.trim();
  if (full) return full;
  const alt = first?.textAnnotations?.[0]?.description?.trim();
  if (alt) return alt;
  return "";
}

async function fetchImageBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`IMAGE_FETCH_${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength < 100) throw new Error("IMAGE_TOO_SMALL");
  // Vision API soft limit — 10MB civarı; aşırı büyükleri reddet
  if (buf.byteLength > 9_500_000) throw new Error("IMAGE_TOO_LARGE");
  return buf;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return json({ ok: false, error: { code: "AUTH", message: "Oturum gerekli" } }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const visionKey = (Deno.env.get("GOOGLE_VISION_API_KEY") ?? "").trim();
    if (!supabaseUrl || !serviceKey) {
      return json({ ok: false, error: { code: "CONFIG", message: "Supabase yapılandırması eksik" } });
    }
    if (!visionKey) {
      return json({
        ok: false,
        error: {
          code: "CONFIG",
          message: "GOOGLE_VISION_API_KEY Edge secret eksik — sunucu OCR için gerekli.",
        },
      });
    }

    let body: { action?: string; guestDocumentId?: string; jobId?: string | null };
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: { code: "BAD_REQUEST", message: "Geçersiz JSON" } });
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) {
      return json({ ok: false, error: { code: "AUTH", message: "Geçersiz oturum" } }, 401);
    }

    const action = body.action ?? "process";
    if (action === "claim_and_process") {
      // Cron / worker: server_fallback işlerini claim et
      const { data: claimRaw } = await admin.rpc("claim_document_ocr_job", {
        p_locked_by: `edge-vision-${crypto.randomUUID().slice(0, 8)}`,
        p_strategies: ["server_fallback"],
        p_lease_seconds: 180,
      });
      const claim = claimRaw as { ok?: boolean; data?: { id?: string; guest_document_id?: string; image_url?: string } | null };
      if (!claim?.data?.guest_document_id) {
        return json({ ok: true, data: { processed: false } });
      }
      body.guestDocumentId = claim.data.guest_document_id;
      body.jobId = claim.data.id ?? null;
    }

    if (action !== "process" && action !== "claim_and_process") {
      return json({ ok: false, error: { code: "BAD_REQUEST", message: "action: process | claim_and_process" } });
    }

    const guestDocumentId = body.guestDocumentId;
    if (!guestDocumentId) {
      return json({ ok: false, error: { code: "BAD_REQUEST", message: "guestDocumentId gerekli" } });
    }

    const failJob = async (
      jobIdVal: string | null,
      code: string,
      message: string,
      terminal = false,
    ) => {
      try {
        await admin.rpc("fail_document_ocr_job", {
          p_job_id: jobIdVal,
          p_guest_document_id: guestDocumentId,
          p_error_code: code,
          p_error_message: message,
          p_terminal: terminal,
        });
      } catch (failErr) {
        console.error("[kbs-ocr-worker] fail_document_ocr_job", failErr);
      }
    };

    const { data: doc, error: docErr } = await admin
      .schema("ops")
      .from("guest_documents")
      .select("id, guest_id, hotel_id, front_image_url, ocr_revision")
      .eq("id", guestDocumentId)
      .maybeSingle();
    if (docErr || !doc?.front_image_url) {
      await failJob(body.jobId ?? null, "NOT_FOUND", "Belge görseli bulunamadı", true);
      return json({ ok: false, error: { code: "NOT_FOUND", message: "Belge görseli bulunamadı" } });
    }

    // Job yoksa server_fallback enqueue
    let jobId = body.jobId ?? null;
    if (!jobId) {
      const { data: enq } = await admin.rpc("enqueue_document_ocr_job", {
        p_guest_document_id: guestDocumentId,
        p_strategy: "server_fallback",
        p_requested_side: "front",
        p_pipeline_version: "v1",
        p_force: false,
      });
      const env = enq as { ok?: boolean; data?: { id?: string }; skipped?: boolean };
      jobId = env?.data?.id ?? null;
    }

    let bytes: Uint8Array;
    try {
      bytes = await fetchImageBytes(String(doc.front_image_url));
    } catch (imgErr) {
      const msg = imgErr instanceof Error ? imgErr.message : "IMAGE_FETCH";
      await failJob(jobId, "IMAGE_FETCH", msg, /TOO_LARGE|TOO_SMALL/.test(msg));
      return json({ ok: false, error: { code: "IMAGE", message: msg } });
    }

    let visionText = "";
    try {
      visionText = await visionDocumentText(bytes, visionKey);
    } catch (visionErr) {
      const msg = visionErr instanceof Error ? visionErr.message : "VISION_ERROR";
      await failJob(jobId, "VISION", msg, false);
      return json({ ok: false, error: { code: "VISION", message: msg } });
    }

    if (!visionText.trim()) {
      await admin.rpc("apply_document_ocr_result", {
        p_job_id: jobId,
        p_guest_document_id: guestDocumentId,
        p_parsed: {
          documentType: "other",
          fullName: null,
          firstName: null,
          lastName: null,
          middleName: null,
          documentNumber: null,
          nationalityCode: null,
          issuingCountryCode: null,
          birthDate: null,
          expiryDate: null,
          gender: null,
          rawMrz: null,
          confidence: 0,
          checksumsValid: null,
          warnings: ["ocr_failed", "server_ocr_empty"],
        },
        p_scan_confidence: 0,
        p_ocr_engine: "google_vision_document",
        p_expected_revision: null,
        p_outcome: "auto",
      });
      return json({ ok: false, error: { code: "EMPTY", message: "Sunucu OCR metin çıkaramadı" } });
    }

    const parsed = parseVisionText(visionText);
    const { data: applyRaw, error: applyErr } = await admin.rpc("apply_document_ocr_result", {
      p_job_id: jobId,
      p_guest_document_id: guestDocumentId,
      p_parsed: parsed,
      p_scan_confidence: parsed.confidence,
      p_ocr_engine: "google_vision_document",
      p_expected_revision: null,
      p_outcome: "auto",
    });
    if (applyErr) {
      await failJob(jobId, "APPLY", applyErr.message, false);
      return json({ ok: false, error: { code: "APPLY", message: applyErr.message } });
    }
    const applyEnv = applyRaw as { ok?: boolean; error?: { code?: string; message?: string } } | null;
    if (applyEnv && applyEnv.ok === false) {
      await failJob(
        jobId,
        applyEnv.error?.code ?? "APPLY_LOGIC",
        applyEnv.error?.message ?? "Apply failed",
        false,
      );
      return json({ ok: false, error: applyEnv.error ?? { code: "APPLY_LOGIC", message: "Apply failed" } });
    }

    return json({ ok: true, data: { applied: applyRaw, preview: {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      documentNumber: parsed.documentNumber,
      birthDate: parsed.birthDate,
      nationalityCode: parsed.nationalityCode,
    } } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[kbs-ocr-worker]", message, e);
    try {
      const bodyGuess = typeof e === "object" ? null : null;
      void bodyGuess;
    } catch {
      /* ignore */
    }
    return json({ ok: false, error: { code: "INTERNAL", message: message || "Edge internal error" } });
  }
});
