/**
 * Jandarma KBS SOAP alan normalizasyonu — check-in reddinden önce.
 * Ülke tablosu (eski KBS): Türkiye = TC (ICAO TUR değil).
 */

const NAME_TO_CODE: Record<string, string> = {
  TURKIYE: "TC",
  TURKEY: "TC",
  TURK: "TC",
  TC: "TC",
  TUR: "TC",
  TR: "TC",
  ALMANYA: "DEU",
  GERMANY: "DEU",
  DEUTSCHLAND: "DEU",
  FRANSA: "FRA",
  FRANCE: "FRA",
  ITALYA: "ITA",
  ITALY: "ITA",
  ISPANYA: "ESP",
  SPAIN: "ESP",
  HOLLANDA: "NLD",
  NETHERLANDS: "NLD",
  RUSYA: "RUS",
  RUSSIA: "RUS",
  UKRAYNA: "UKR",
  UKRAINE: "UKR",
  IRAN: "IRN",
  IRAK: "IRQ",
  IRAQ: "IRQ",
  SURYE: "SYR",
  SYRIA: "SYR",
  AFGANISTAN: "AFG",
  PAKISTAN: "PAK",
  OZBEKISTAN: "UZB",
  UZBEKISTAN: "UZB",
  UZBEK: "UZB",
  AZERBAYCAN: "AZE",
  AZERBAIJAN: "AZE",
  KUWAIT: "KWT",
  OMAN: "OMN",
  QATAR: "QAT",
  BAHRAIN: "BHR",
  SAUDIARABIA: "SAU",
  SAUDI: "SAU",
  EMIRATES: "ARE",
  UAE: "ARE",
  UNITEDARABEMIRATES: "ARE",
  UNITEDKINGDOM: "GBR",
  ENGLAND: "GBR",
  AMERICA: "USA",
  UNITEDSTATES: "USA",
  KKTC: "KKTC",
  NORTHERNCYPRUS: "KKTC",
};

const CODE_ALIASES: Record<string, string> = {
  TUR: "TC",
  TR: "TC",
  TC: "TC",
  D: "DEU",
  GBD: "GBR",
  GBN: "GBR",
  GBO: "GBR",
  GBP: "GBR",
  CTR: "KKTC",
};

function fold(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Z0-9]/g, "");
}

export function normalizeKbsUlkeCode(
  nationality?: string | null,
  issuing?: string | null,
): string | null {
  for (const raw of [nationality, issuing]) {
    const t = (raw ?? "").trim();
    if (!t) continue;
    const up = t.toUpperCase();
    if (CODE_ALIASES[up]) return CODE_ALIASES[up]!;
    if (/^[A-Z]{2,5}$/.test(up) && up !== "TUR" && up !== "TR") {
      if (up.length >= 2 && up.length <= 5) return up;
    }
    const byName = NAME_TO_CODE[fold(t)];
    if (byName) return byName;
  }
  return null;
}

export function normalizeKbsBirthDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) {
    const dd = dmy[1]!.padStart(2, "0");
    const mm = dmy[2]!.padStart(2, "0");
    const yyyy = dmy[3]!;
    return `${yyyy}-${mm}-${dd}`;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) || Number.isFinite(Date.parse(s))) {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? "01";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }
  return null;
}

export function normalizeKbsRoomNo(value: string | null | undefined): string | null {
  let t = (value ?? "").trim().replace(/\s+/g, " ");
  if (!t) return null;
  t = t.replace(/^(?:oda|room|nr\.?|no\.?)[\s#:.-]*/i, "").trim();
  t = t.replace(/[^\w\-/.]/g, "");
  if (!t) return null;
  return t.length > 50 ? t.slice(0, 50) : t;
}

export function normalizeKbsDocNo(value: string | null | undefined, max = 20): string | null {
  const t = (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/</g, "")
    .replace(/[^A-Z0-9]/g, "");
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

export function looksLikeAlphanumericPassportNo(value: string | null | undefined): boolean {
  const alnum = normalizeKbsDocNo(value) ?? "";
  if (alnum.length < 5 || alnum.length > 14) return false;
  if (!/[A-Z]/.test(alnum) || !/\d/.test(alnum)) return false;
  if (/^[1-9]\d{10}$/.test(alnum)) return false;
  if (/^99\d{9,}$/.test(alnum)) return false;
  return true;
}

export function resolveKbsBelgeSeri(
  documentNumber: string | null | undefined,
  documentSeries?: string | null,
): string | null {
  const doc = normalizeKbsDocNo(documentNumber);
  if (!doc) return null;
  const series = normalizeKbsDocNo(documentSeries);
  if (series && series !== doc && !(doc.includes(series) && series.length >= 6)) {
    return series;
  }
  const prefix = doc.match(/^([A-Z]{1,4})(\d{4,})$/);
  if (prefix) return prefix[1]!;
  return doc;
}
