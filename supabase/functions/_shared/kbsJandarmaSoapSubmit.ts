/**
 * Jandarma KBS SOAP check-in — doğrudan Edge’den (Railway kbs-core gerekmez).
 * WCF DataContract: alanlar alfabetik.
 */

import {
  looksLikeAlphanumericPassportNo,
  normalizeKbsBirthDate,
  normalizeKbsDocNo,
  normalizeKbsRoomNo,
  normalizeKbsUlkeCode,
  resolveKbsBelgeSeri,
} from "./kbsFieldNormalize.ts";

const DEFAULT_SOAP_URL =
  "https://vatandas.jandarma.gov.tr/KBS_Tesis_Servis/SrvShsYtkTml.svc";

export type KbsSoapCredentials = {
  facilityCode: string;
  username: string;
  password: string;
};

export type KbsSoapCheckInPayload = {
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  documentNumber?: string | null;
  documentSeries?: string | null;
  nationalityCode?: string | null;
  issuingCountryCode?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  roomNumber?: string | null;
  checkInAt?: string | null;
  usageKind?: string | null;
  kbsPersonKind?: string | null;
  plateNumber?: string | null;
  phone?: string | null;
  forwardDated?: boolean | null;
  fatherName?: string | null;
  motherName?: string | null;
  maritalStatus?: string | null;
};

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function extractSonuc(xmlText: string): {
  basarili: boolean;
  mesaj?: string | null;
  hataKodu?: string | null;
} {
  const xml = xmlText ?? "";
  const basariliMatch = xml.match(
    /<\s*(?:\w+:)?Basarili\s*>\s*(true|false)\s*<\s*\/\s*(?:\w+:)?Basarili\s*>/i,
  );
  const mesajMatch = xml.match(/<\s*(?:\w+:)?Mesaj\s*>\s*([\s\S]*?)\s*<\s*\/\s*(?:\w+:)?Mesaj\s*>/i);
  const hataKoduMatch = xml.match(
    /<\s*(?:\w+:)?HataKodu\s*>\s*([\s\S]*?)\s*<\s*\/\s*(?:\w+:)?HataKodu\s*>/i,
  );
  return {
    basarili: String(basariliMatch?.[1] ?? "").toLowerCase() === "true",
    mesaj: mesajMatch?.[1]?.trim() ?? null,
    hataKodu: hataKoduMatch?.[1]?.trim() ?? null,
  };
}

function clipName(value: string | null | undefined, max = 80): string | null {
  const t = (value ?? "").trim().replace(/\s+/g, " ");
  if (!t) return null;
  return t.length > max ? t.slice(0, max).trim() : t;
}

function clipParentName(value: string | null | undefined): string | undefined {
  const t = clipName(value);
  if (!t) return undefined;
  const fold = t
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Z]/g, "");
  if (
    /^(?:ANNE|ANNEADI|BABA|BABAADI|MOTHER|FATHER|ANA|ATA|VALID|SURNAME|GIVENNAMES?)$/.test(fold)
  ) {
    return undefined;
  }
  return t;
}

function normalizeDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

function soapGender(g: string | null | undefined): string | undefined {
  if (g === "M") return "ERKEK";
  if (g === "F") return "KADIN";
  return undefined;
}

function soapUsage(usage: string | null | undefined): string {
  const u = String(usage ?? "konaklama").toLowerCase();
  if (u === "gunluk") return "GUNLUK";
  if (u === "afetzede") return "AFETZEDE";
  return "KONAKLAMA";
}

function soapMarital(m: string | null | undefined): string | undefined {
  if (m === "married") return "EVLI";
  if (m === "single") return "BEKAR";
  return undefined;
}

function personKind(payload: {
  kbsPersonKind?: string | null;
  documentNumber?: string | null;
}) {
  if (looksLikeAlphanumericPassportNo(payload.documentNumber)) return "foreign" as const;
  const k = String(payload.kbsPersonKind ?? "foreign");
  if (k === "tc_citizen") return "tc_citizen" as const;
  if (k === "ykn_foreign") return "ykn_foreign" as const;
  return "foreign" as const;
}

function buildWcfDatacontractObjectXml(fields: Record<string, string | null | undefined>) {
  const ns = "http://schemas.datacontract.org/2004/07/KBS_Tesis_Servis";
  const iNs = "http://www.w3.org/2001/XMLSchema-instance";
  const prefix = "a";
  const parts: string[] = [];
  const keys = Object.keys(fields)
    .filter((k) => fields[k] !== undefined)
    .sort((a, b) => a.localeCompare(b, "en"));
  for (const k of keys) {
    const v = fields[k];
    if (v === undefined) continue;
    if (v === null) {
      parts.push(`<${prefix}:${k} xmlns:i="${iNs}" i:nil="true" />`);
    } else {
      parts.push(`<${prefix}:${k}>${esc(String(v))}</${prefix}:${k}>`);
    }
  }
  return `<musteri xmlns:${prefix}="${ns}" xmlns:i="${iNs}">${parts.join("")}</musteri>`;
}

function envelope(
  opName: string,
  userTc: number,
  tssKod: number,
  password: string,
  musteriXml: string,
) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${opName} xmlns="http://tempuri.org/">
      <KullaniciTC>${userTc}</KullaniciTC>
      <TssKod>${tssKod}</TssKod>
      <Sifre>${esc(password)}</Sifre>
      ${musteriXml}
    </${opName}>
  </soap:Body>
</soap:Envelope>`;
}

async function soapCall(bodyXml: string, action: string): Promise<string> {
  const baseUrl = (Deno.env.get("KBS_SOAP_BASE_URL") ?? DEFAULT_SOAP_URL).trim();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "content-type": "text/xml; charset=utf-8",
        soapaction: action,
      },
      body: bodyXml,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Jandarma HTTP ${res.status}`);
    return text;
  } finally {
    clearTimeout(t);
  }
}

export async function submitJandarmaCheckIn(
  payload: KbsSoapCheckInPayload,
  credentials: KbsSoapCredentials,
): Promise<{ ok: true; summary: unknown } | { ok: false; message: string; code: string }> {
  try {
    const userTc = Number(String(credentials.username).replace(/\D/g, ""));
    const tssKod = Number(String(credentials.facilityCode).replace(/\s/g, ""));
    if (!Number.isFinite(userTc) || !Number.isFinite(tssKod)) {
      return {
        ok: false,
        code: "CONFIG",
        message: "KBS credentials must be numeric (username=KullaniciTC, facilityCode=TssKod)",
      };
    }

    const kind = personKind(payload);
    const fullName =
      (payload.fullName ??
        ([payload.firstName, payload.lastName].filter(Boolean).join(" ").trim() || null)) as
        | string
        | null;
    const firstName = payload.firstName ?? (fullName ? fullName.split(" ")[0] : null);
    const lastName = payload.lastName ?? null;
    const adiFromParts = [firstName, payload.middleName]
      .filter((x) => x != null && String(x).trim().length > 0)
      .join(" ")
      .trim();
    const adi = clipName(adiFromParts || firstName || null);
    const soyadi = clipName(lastName);
    const room = normalizeKbsRoomNo(payload.roomNumber);
    const giris =
      normalizeDateTime(payload.checkInAt) ?? normalizeDateTime(new Date().toISOString());
    if (!giris) {
      return { ok: false, code: "VALIDATION", message: "Giriş tarihi zorunlu (KBS)" };
    }
    const dogum = normalizeKbsBirthDate(payload.birthDate);
    const ulke = normalizeKbsUlkeCode(payload.nationalityCode, payload.issuingCountryCode);
    const kimlikOrBelge = normalizeKbsDocNo(payload.documentNumber);
    const seri =
      kind === "foreign" || kind === "ykn_foreign"
        ? resolveKbsBelgeSeri(kimlikOrBelge, payload.documentSeries)
        : normalizeKbsDocNo(payload.documentSeries) || kimlikOrBelge;

    if (!room) return { ok: false, code: "VALIDATION", message: "Oda No zorunlu (KBS)" };
    if (!kimlikOrBelge) {
      return {
        ok: false,
        code: "VALIDATION",
        message: kind === "tc_citizen" ? "Kimlik No (T.C.) zorunlu" : "Kimlik/Belge No zorunlu",
      };
    }
    if (kind === "tc_citizen" && /[A-Z]/.test(kimlikOrBelge)) {
      return {
        ok: false,
        code: "VALIDATION",
        message: "Alfanümerik pasaport no T.C. girişi ile gönderilemez (örn. AP902390 → yabancı).",
      };
    }

    let opName: string;
    let musteriFields: Record<string, string | null | undefined>;

    if (kind === "tc_citizen") {
      opName = "MusteriKimlikNoGiris";
      musteriFields = {
        KIMLIKNO: kimlikOrBelge.replace(/\D/g, ""),
        BELGESERI: seri || undefined,
        ADI: adi || undefined,
        SOYADI: soyadi || undefined,
        BABAADI: clipParentName(payload.fatherName),
        ANAADI: clipParentName(payload.motherName),
        DOGUMTARIHI: dogum || undefined,
        ULKE: ulke || "TC",
        CINSIYET: soapGender(payload.gender),
        MEDENIHAL: soapMarital(payload.maritalStatus),
        ODANO: room,
        PLAKA: payload.plateNumber?.trim() || undefined,
        TELEFON: payload.phone?.replace(/\D/g, "") || undefined,
        KULLANIMSEKLI: soapUsage(payload.usageKind),
        GRSTRH: giris,
        ILERITARIHLI: payload.forwardDated ? "true" : undefined,
      };
    } else {
      opName = "MusteriYabanciGiris";
      if (!adi) return { ok: false, code: "VALIDATION", message: "Adı zorunlu (KBS)" };
      if (!soyadi) return { ok: false, code: "VALIDATION", message: "Soyadı zorunlu (KBS)" };
      if (!dogum) {
        return { ok: false, code: "VALIDATION", message: "Doğum Tarihi zorunlu (KBS) — YYYY-MM-DD" };
      }
      if (!ulke) {
        return {
          ok: false,
          code: "VALIDATION",
          message:
            "Ülke/uyruk KBS kodu geçersiz. ICAO-3 (örn. UZB, SAU) veya ülke adı girin; Türkiye için TC.",
        };
      }
      if (!seri) return { ok: false, code: "VALIDATION", message: "Belge Seri No zorunlu (KBS)" };

      musteriFields = {
        KIMLIKNO: kind === "ykn_foreign" ? kimlikOrBelge : undefined,
        BELGENO: kimlikOrBelge,
        BELGESERI: seri,
        ADI: adi,
        SOYADI: soyadi,
        BABAADI: clipParentName(payload.fatherName),
        ANAADI: clipParentName(payload.motherName),
        DOGUMTARIHI: dogum,
        ULKE: ulke,
        CINSIYET: soapGender(payload.gender),
        MEDENIHAL: soapMarital(payload.maritalStatus),
        ODANO: room,
        PLAKA: payload.plateNumber?.trim() || undefined,
        TELEFON: payload.phone?.replace(/\D/g, "") || undefined,
        KULLANIMSEKLI: soapUsage(payload.usageKind),
        GRSTRH: giris,
        ILERITARIHLI: payload.forwardDated ? "true" : undefined,
      };
    }

    const musteriXml = buildWcfDatacontractObjectXml(musteriFields);
    const bodyXml = envelope(opName, userTc, tssKod, credentials.password, musteriXml);
    const xmlText = await soapCall(bodyXml, `http://tempuri.org/ISrvShsYtkTml/${opName}`);
    const sonuc = extractSonuc(xmlText);
    if (!sonuc.basarili) {
      const tip = `${sonuc.hataKodu ?? "UNKNOWN"} ${sonuc.mesaj ?? ""}`.trim();
      return {
        ok: false,
        code: "KBS",
        message:
          `KBS check-in failed: ${tip} [belge=${kimlikOrBelge} seri=${seri ?? ""} ulke=${ulke ?? ""} dogum=${dogum ?? ""} oda=${room} kind=${kind}]`
            .replace(/\s+/g, " ")
            .trim(),
      };
    }
    return {
      ok: true,
      summary: { kbs: "jandarma", action: opName, kind, sonuc: { hataKodu: sonuc.hataKodu, mesaj: sonuc.mesaj } },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/abort/i.test(msg)) {
      return { ok: false, code: "TIMEOUT", message: "Jandarma yanıt vermedi (zaman aşımı)." };
    }
    return { ok: false, code: "UPSTREAM", message: `Jandarma erişim hatası: ${msg}` };
  }
}
