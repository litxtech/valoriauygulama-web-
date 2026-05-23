/**
 * Maliye portalı — VUK Md. 240 günlük müşteri listesi (HMB).
 * Admin lib/hmbReport.ts ile aynı mantık; Edge (Deno) için bağımsız modül.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const VAT_RATE = 0.1;
export const ACCOMMODATION_TAX_RATE = 0.02;
const ROW_MIN = 28;

export type HmbBranding = {
  legalCompanyName: string;
  businessActivities: string;
  address: string;
  phone: string;
  fax: string;
  provinceCode: string;
  defaultSeri: string;
  footerPrinterLine: string;
  logoDataUrl: string | null;
  ministrySealDataUrl: string | null;
  authorizedName: string;
};

export const DEFAULT_HMB_BRANDING: HmbBranding = {
  legalCompanyName: "VALORIA HOTEL",
  businessActivities: "",
  address: "Atatürk Cad. No:123, Muratpaşa/ANTALYA",
  phone: "0242 123 45 67",
  fax: "",
  provinceCode: "34",
  defaultSeri: "A",
  footerPrinterLine: "",
  logoDataUrl: null,
  ministrySealDataUrl: null,
  authorizedName: "Otel Müdürü",
};

type GuestRow = {
  id: string;
  full_name: string;
  id_number: string | null;
  id_type: string | null;
  nationality: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  status: string;
  room_id: string | null;
  total_amount_net: number | null;
  vat_amount: number | null;
  accommodation_tax_amount: number | null;
  rooms: { room_number: string; price_per_night: number | null; organization_id?: string } | null;
};

export type StayRow = {
  room_number: string;
  room_id: string;
  check_in_at: string;
  check_out_at: string | null;
  nights: number;
  guests: {
    full_name: string;
    id_number: string | null;
    id_type: string | null;
    nationality: string | null;
  }[];
  total_net: number;
  vat: number;
  accommodation_tax: number;
};

export type HmbReportData = {
  stays: StayRow[];
  totalStays: number;
  totalGuests: number;
  totalNights: number;
  totalRevenueNet: number;
  totalVat: number;
  totalAccommodationTax: number;
  generatedAt: string;
  reportNumber: string;
};

export type DailyFormItem = {
  id: string;
  full_name: string;
  room_number: string | null;
  room_id: string | null;
  phone: string | null;
  id_number: string | null;
  nationality: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  total_amount_net: number | null;
  daily_rate_gross: number | null;
  contract_accepted_at: string | null;
  status: string | null;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function parseIsoDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtTrDate(s: string | null | undefined): string {
  const d = parseIsoDate(s ?? undefined);
  if (!d) return "—";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function fmtTrDateFromYmd(ymd: string): string {
  const p = ymd.split("-");
  if (p.length !== 3) return ymd;
  return `${p[2]}.${p[1]}.${p[0]}`;
}

function nightsBetween(checkIn: string, checkOut: string | null): number {
  const start = parseIsoDate(checkIn);
  const end = checkOut ? parseIsoDate(checkOut) : new Date();
  if (!start) return 1;
  const endD = end ?? new Date();
  const diff = Math.max(0, Math.ceil((endD.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
  return diff || 1;
}

function dayBoundsUtc(dateYmd: string): { start: string; end: string } {
  return {
    start: `${dateYmd}T00:00:00.000Z`,
    end: `${dateYmd}T23:59:59.999Z`,
  };
}

function ministrySealSvg(provinceCode: string): string {
  const code = (provinceCode || "—").replace(/</g, "").replace(/&/g, "");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <circle cx="100" cy="100" r="96" fill="none" stroke="#000" stroke-width="2.4"/>
  <circle cx="100" cy="100" r="82" fill="none" stroke="#000" stroke-width="1"/>
  <text x="100" y="44" text-anchor="middle" font-family="Times New Roman, serif" font-size="10" font-weight="700">T.C.</text>
  <text x="100" y="60" text-anchor="middle" font-family="Times New Roman, serif" font-size="9.2" font-weight="700">HAZİNE VE MALİYE</text>
  <text x="100" y="74" text-anchor="middle" font-family="Times New Roman, serif" font-size="9.2" font-weight="700">BAKANLIĞI</text>
  <text x="100" y="118" text-anchor="middle" font-family="Times New Roman, serif" font-size="34" font-weight="700">T.C.</text>
  <text x="100" y="182" text-anchor="middle" font-family="Times New Roman, serif" font-size="10">İL KODU: ${code}</text>
</svg>`;
}

export async function loadHmbBranding(
  supabase: SupabaseClient
): Promise<HmbBranding> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "hmb_form_branding")
    .maybeSingle();
  const raw = data?.value;
  if (!raw || typeof raw !== "object") return { ...DEFAULT_HMB_BRANDING };
  const v = raw as Record<string, unknown>;
  return {
    ...DEFAULT_HMB_BRANDING,
    legalCompanyName: String(v.legalCompanyName ?? DEFAULT_HMB_BRANDING.legalCompanyName),
    businessActivities: String(v.businessActivities ?? ""),
    address: String(v.address ?? DEFAULT_HMB_BRANDING.address),
    phone: String(v.phone ?? DEFAULT_HMB_BRANDING.phone),
    fax: String(v.fax ?? ""),
    provinceCode: String(v.provinceCode ?? DEFAULT_HMB_BRANDING.provinceCode),
    defaultSeri: String(v.defaultSeri ?? DEFAULT_HMB_BRANDING.defaultSeri),
    footerPrinterLine: String(v.footerPrinterLine ?? ""),
    logoDataUrl: v.logoDataUrl ? String(v.logoDataUrl) : null,
    ministrySealDataUrl: v.ministrySealDataUrl ? String(v.ministrySealDataUrl) : null,
    authorizedName: String(v.authorizedName ?? DEFAULT_HMB_BRANDING.authorizedName),
  };
}

async function fetchOrgRoomIds(
  supabase: SupabaseClient,
  orgId: string
): Promise<string[]> {
  const { data } = await supabase.from("rooms").select("id").eq("organization_id", orgId);
  return (data ?? []).map((r: { id: string }) => r.id);
}

/** Seçilen günde odada konaklayan misafirler (oda + check-in zorunlu). */
export async function fetchGuestsForDay(
  supabase: SupabaseClient,
  orgId: string,
  dateYmd: string
): Promise<GuestRow[]> {
  const roomIds = await fetchOrgRoomIds(supabase, orgId);
  if (!roomIds.length) return [];

  const { start, end } = dayBoundsUtc(dateYmd);
  const { data, error } = await supabase
    .from("guests")
    .select(
      "id, full_name, id_number, id_type, nationality, check_in_at, check_out_at, status, room_id, total_amount_net, vat_amount, accommodation_tax_amount, phone, rooms!inner(room_number, price_per_night, organization_id)"
    )
    .in("room_id", roomIds)
    .not("check_in_at", "is", null)
    .lte("check_in_at", end)
    .or(`check_out_at.is.null,check_out_at.gte.${start}`)
    .order("check_in_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as GuestRow[];
}

function buildStaysFromGuests(list: GuestRow[]): HmbReportData {
  const groupKey = (g: GuestRow) =>
    `${g.room_id ?? ""}|${g.check_in_at ?? ""}|${g.check_out_at ?? ""}`;
  const groups = new Map<string, GuestRow[]>();
  for (const g of list) {
    const key = groupKey(g);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(g);
  }

  const stays: StayRow[] = [];
  let totalNights = 0;
  let totalRevenueNet = 0;
  let totalVat = 0;
  let totalAccommodationTax = 0;

  for (const [, guests] of groups) {
    const first = guests[0];
    const roomNumber = first.rooms?.room_number ?? "—";
    const roomId = first.room_id ?? "";
    const checkIn = first.check_in_at ?? "";
    const checkOut = first.check_out_at ?? null;
    const nights = nightsBetween(checkIn, checkOut);
    const pricePerNight = first.rooms?.price_per_night ?? 0;

    let total_net = 0;
    let vat = 0;
    let accTax = 0;
    const hasStored = guests.some(
      (x) => x.total_amount_net != null && Number(x.total_amount_net) > 0
    );
    if (hasStored) {
      total_net = guests.reduce((s, x) => s + (Number(x.total_amount_net) ?? 0), 0);
      vat = guests.reduce((s, x) => s + (Number(x.vat_amount) ?? 0), 0);
      accTax = guests.reduce((s, x) => s + (Number(x.accommodation_tax_amount) ?? 0), 0);
    } else {
      total_net = pricePerNight ? pricePerNight * nights : 0;
      vat = total_net * VAT_RATE;
      accTax = total_net * ACCOMMODATION_TAX_RATE;
    }

    totalNights += nights;
    totalRevenueNet += total_net;
    totalVat += vat;
    totalAccommodationTax += accTax;

    stays.push({
      room_number: roomNumber,
      room_id: roomId,
      check_in_at: checkIn,
      check_out_at: checkOut,
      nights,
      guests: guests.map((x) => ({
        full_name: x.full_name,
        id_number: x.id_number,
        id_type: x.id_type,
        nationality: x.nationality,
      })),
      total_net,
      vat,
      accommodation_tax: accTax,
    });
  }

  const generatedAt = new Date().toISOString();
  return {
    stays,
    totalStays: stays.length,
    totalGuests: list.length,
    totalNights,
    totalRevenueNet,
    totalVat,
    totalAccommodationTax,
    generatedAt,
    reportNumber: `HMB-${new Date().getUTCFullYear()}-${String(stays.length).padStart(3, "0")}`,
  };
}

export async function fetchHmbDataForDay(
  supabase: SupabaseClient,
  orgId: string,
  dateYmd: string
): Promise<HmbReportData> {
  const guests = await fetchGuestsForDay(supabase, orgId, dateYmd);
  return buildStaysFromGuests(guests);
}

function guestNationalityLabel(
  nationality: string | null | undefined,
  idType: string | null | undefined
): string {
  const n = (nationality ?? "").trim();
  if (n) return n;
  if (idType === "tc") return "T.C.";
  return "—";
}

export function buildHmbDailyListHtml(
  data: HmbReportData,
  branding: HmbBranding,
  dateYmd: string,
  formMeta?: { seri?: string; sira?: string; block?: string }
): string {
  const flat: {
    room: string;
    name: string;
    nationality: string;
    dailyRate: number;
    totalGuestShare: number;
  }[] = [];

  for (const s of data.stays) {
    const nights = Math.max(1, s.nights);
    const guestCount = Math.max(1, s.guests.length);
    const totalGross = s.total_net + s.vat + s.accommodation_tax;
    const dailyGross = totalGross / nights;
    const share = totalGross / guestCount;
    for (const g of s.guests) {
      flat.push({
        room: s.room_number,
        name: g.full_name,
        nationality: guestNationalityLabel(g.nationality, g.id_type),
        dailyRate: dailyGross,
        totalGuestShare: share,
      });
    }
  }

  const sealSrc = branding.ministrySealDataUrl
    ? branding.ministrySealDataUrl
    : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ministrySealSvg(branding.provinceCode))}`;

  const rowsHtml: string[] = [];
  let seq = 0;
  for (const r of flat) {
    seq += 1;
    rowsHtml.push(`<tr>
      <td style="text-align:center">${seq}</td>
      <td style="text-align:center">${escapeHtml(r.room)}</td>
      <td>${escapeHtml(r.name)}</td>
      <td style="text-align:center">${escapeHtml(r.nationality)}</td>
      <td style="text-align:right">${fmtMoney(r.dailyRate)}</td>
      <td style="text-align:right">${fmtMoney(r.totalGuestShare)}</td>
    </tr>`);
  }
  const pad = Math.max(0, ROW_MIN - flat.length);
  for (let i = 0; i < pad; i++) {
    rowsHtml.push(
      "<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>"
    );
  }

  const listDate = fmtTrDateFromYmd(dateYmd);
  const seri = formMeta?.seri ?? branding.defaultSeri;
  const sira = formMeta?.sira ?? "……";
  const block = formMeta?.block ?? "…………………………………………";
  const arrival = data.stays.length
    ? fmtTrDate(data.stays.reduce((a, s) => (a < s.check_in_at ? a : s.check_in_at), data.stays[0].check_in_at))
    : listDate;
  const departDates = data.stays.map((s) => s.check_out_at).filter(Boolean) as string[];
  const departure = departDates.length
    ? fmtTrDate(departDates.sort().reverse()[0])
    : "…/…/……";

  const leftBlock = `
    <div style="font-size:8.5pt;line-height:1.25;">
      ${branding.logoDataUrl ? `<div style="margin-bottom:4px;"><img src="${escapeAttr(branding.logoDataUrl)}" style="max-height:52px;max-width:120px;" alt="" /></div>` : ""}
      <div style="font-weight:700;font-size:9.5pt;">${escapeHtml(branding.legalCompanyName)}</div>
      ${branding.businessActivities ? `<div style="font-size:8pt;margin-top:2px;">${escapeHtml(branding.businessActivities)}</div>` : ""}
      <div style="margin-top:6px;font-size:8.5pt;">${escapeHtml(branding.address)}</div>
      <div style="margin-top:4px;font-size:8.5pt;">Tel: ${escapeHtml(branding.phone)}${branding.fax ? ` · Faks: ${escapeHtml(branding.fax)}` : ""}</div>
    </div>`;

  const rightBlock = `
    <div style="font-size:8.5pt;line-height:1.55;text-align:right;">
      <div><strong>Tarih</strong> ${escapeHtml(listDate)}</div>
      <div><strong>SERİ</strong> ${escapeHtml(seri)} &nbsp; <strong>SIRA</strong> ${escapeHtml(sira)}</div>
      <div style="margin-top:6px;"><strong>Giriş Tarihi</strong> ${escapeHtml(arrival)}</div>
      <div><strong>Çıkış Tarihi</strong> ${escapeHtml(departure)}</div>
    </div>`;

  const footerSmall = branding.footerPrinterLine
    ? `<div style="font-size:6.5pt;color:#333;margin-top:8px;text-align:center;">${escapeHtml(branding.footerPrinterLine)}</div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Günlük Müşteri Listesi — ${escapeHtml(listDate)}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm 12mm; }
    body { font-family: 'Times New Roman', Times, serif; color: #000; font-size: 9pt; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet { max-width: 180mm; margin: 0 auto; }
    .head-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    .head-table td { vertical-align: top; padding: 2px 4px; }
    .seal-wrap { text-align: center; }
    .seal-wrap img { width: 92px; height: auto; display: inline-block; }
    .title { text-align: center; font-size: 14pt; font-weight: 700; letter-spacing: 0.5px; margin: 10px 0 6px 0; }
    .block-line { font-size: 9pt; margin-bottom: 8px; }
    .data-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .data-table th, .data-table td { border: 1px solid #000; padding: 3px 4px; vertical-align: middle; word-wrap: break-word; }
    .data-table th { font-size: 8pt; font-weight: 700; text-align: center; background: #fff; }
    .foot-sig { margin-top: 14px; font-size: 8.5pt; }
  </style>
</head>
<body>
  <div class="sheet">
    <table class="head-table">
      <tr>
        <td style="width:34%;">${leftBlock}</td>
        <td style="width:32%;" class="seal-wrap"><img src="${escapeAttr(sealSrc)}" alt=""/></td>
        <td style="width:34%;">${rightBlock}</td>
      </tr>
    </table>
    <div class="title">GÜNLÜK MÜŞTERİ LİSTESİ</div>
    <div class="block-line"><strong>BLOK</strong> (${escapeHtml(block)})</div>
    <table class="data-table">
      <thead>
        <tr>
          <th style="width:6%">Sıra</th>
          <th style="width:9%">Oda No.</th>
          <th style="width:34%">Müşterinin Adı, Soyadı</th>
          <th style="width:14%">Uyruğu</th>
          <th style="width:18%">Günlük Ücreti</th>
          <th style="width:19%">Toplam Ücret</th>
        </tr>
      </thead>
      <tbody>${rowsHtml.join("")}</tbody>
    </table>
    <div class="foot-sig">
      <div>Liste tarihi: ${escapeHtml(listDate)} · Rapor no: ${escapeHtml(data.reportNumber)} · ${data.totalGuests} müşteri / ${data.totalStays} oda</div>
      <div style="margin-top:6px;">Düzenleyen: ${escapeHtml(branding.authorizedName)} · Üretim: ${escapeHtml(fmtTrDate(data.generatedAt))}</div>
      <div style="margin-top:14px;border-bottom:1px solid #000;width:220px;padding-top:20px;">İmza / Kaşe</div>
    </div>
    ${footerSmall}
  </div>
</body>
</html>`;
}

export async function fetchDailyFormItems(
  supabase: SupabaseClient,
  orgId: string,
  opts: { date?: string; month?: string }
): Promise<DailyFormItem[]> {
  const roomIds = await fetchOrgRoomIds(supabase, orgId);
  if (!roomIds.length) return [];

  let start = "";
  let end = "";
  if (opts.date) {
    const b = dayBoundsUtc(opts.date);
    start = b.start;
    end = b.end;
  } else if (opts.month) {
    start = `${opts.month}-01T00:00:00.000Z`;
    const toDate = new Date(`${opts.month}-01T00:00:00.000Z`);
    toDate.setUTCMonth(toDate.getUTCMonth() + 1);
    end = toDate.toISOString();
  }

  let q = supabase
    .from("guests")
    .select(
      "id, full_name, phone, id_number, nationality, check_in_at, check_out_at, status, room_id, total_amount_net, vat_amount, accommodation_tax_amount, rooms!inner(room_number, price_per_night)"
    )
    .in("room_id", roomIds)
    .not("check_in_at", "is", null);

  if (start && end) {
    if (opts.date) {
      q = q.lte("check_in_at", end).or(`check_out_at.is.null,check_out_at.gte.${start}`);
    } else {
      q = q.lte("check_in_at", end).or(`check_out_at.is.null,check_out_at.gte.${start}`);
    }
  }

  q = q.order("check_in_at", { ascending: false }).limit(500);
  const { data: guestRows, error } = await q;
  if (error) throw new Error(error.message);

  const guests = (guestRows ?? []) as (GuestRow & { phone?: string | null })[];
  const guestIds = guests.map((g) => g.id);
  let acceptanceMap = new Map<string, string>();
  if (guestIds.length) {
    const { data: accRows } = await supabase
      .from("contract_acceptances")
      .select("guest_id, accepted_at")
      .eq("organization_id", orgId)
      .in("guest_id", guestIds)
      .order("accepted_at", { ascending: false });
    for (const row of accRows ?? []) {
      const gid = (row as { guest_id: string; accepted_at: string }).guest_id;
      if (!acceptanceMap.has(gid)) {
        acceptanceMap.set(gid, (row as { accepted_at: string }).accepted_at);
      }
    }
  }

  return guests.map((g) => {
    const nights = nightsBetween(g.check_in_at ?? "", g.check_out_at);
    const pricePerNight = g.rooms?.price_per_night ?? 0;
    let net = Number(g.total_amount_net ?? 0);
    let vat = Number(g.vat_amount ?? 0);
    let acc = Number(g.accommodation_tax_amount ?? 0);
    if (!net && pricePerNight) {
      net = pricePerNight * nights;
      vat = net * VAT_RATE;
      acc = net * ACCOMMODATION_TAX_RATE;
    }
    const gross = net + vat + acc;
    const dailyGross = gross / Math.max(1, nights);
    return {
      id: g.id,
      full_name: g.full_name,
      room_number: g.rooms?.room_number ?? null,
      room_id: g.room_id,
      phone: g.phone ?? null,
      id_number: g.id_number,
      nationality: g.nationality,
      check_in_at: g.check_in_at,
      check_out_at: g.check_out_at,
      total_amount_net: net || null,
      daily_rate_gross: dailyGross || null,
      contract_accepted_at: acceptanceMap.get(g.id) ?? null,
      status: g.status,
    };
  });
}

/** Ay içinde en az bir konaklaması olan günler */
export async function fetchFormDaysInMonth(
  supabase: SupabaseClient,
  orgId: string,
  monthYmd: string
): Promise<{ date: string; count: number }[]> {
  const month = monthYmd.slice(0, 7);
  const items = await fetchDailyFormItems(supabase, orgId, { month });
  const dayMap = new Map<string, Set<string>>();

  for (const item of items) {
    if (!item.check_in_at) continue;
    const inD = new Date(item.check_in_at);
    const outD = item.check_out_at ? new Date(item.check_out_at) : new Date();
    const cur = new Date(Date.UTC(inD.getUTCFullYear(), inD.getUTCMonth(), inD.getUTCDate()));
    const last = new Date(Date.UTC(outD.getUTCFullYear(), outD.getUTCMonth(), outD.getUTCDate()));
    while (cur <= last) {
      const ymd = cur.toISOString().slice(0, 10);
      if (ymd.startsWith(month)) {
        if (!dayMap.has(ymd)) dayMap.set(ymd, new Set());
        dayMap.get(ymd)!.add(item.id);
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  return Array.from(dayMap.entries())
    .map(([date, ids]) => ({ date, count: ids.size }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
