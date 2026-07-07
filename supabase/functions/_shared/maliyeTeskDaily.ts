/**
 * TESK (Türkiye Esnaf ve Sanatkârları Konfederasyonu) — GÜNLÜK MÜŞTERİ LİSTESİ.
 * Kağıt formun dijitali: Oda No | Müşterinin Adı - Soyadı | Oda Ücreti (iki sütun yan yana),
 * Seri / Sıra No / Mükellef Kaşesi. Uygulamadan misafir girildikçe günlük otomatik dolar.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchGuestsForDay, type HmbBranding } from "./maliyeHmbDaily.ts";

export type TeskSerialConfig = {
  seri: string;
  start_sira: number;
  anchor_date: string; // YYYY-MM-DD
  per_page: number;
};

export const DEFAULT_TESK_SERIAL: TeskSerialConfig = {
  seri: "A",
  start_sira: 1,
  anchor_date: new Date().toISOString().slice(0, 10),
  per_page: 14,
};

export type TeskRow = { room: string; name: string; fee: string };

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

function fmtFee(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n)) || Number(n) <= 0) return "";
  return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Number(n))} TL`;
}

function fmtTrDateFromYmd(ymd: string): string {
  const p = ymd.split("-");
  if (p.length !== 3) return ymd;
  return `${p[2]}.${p[1]}.${p[0]}`;
}

/** Konfigürasyonu Supabase'den yükle (service role). Yoksa varsayılan. */
export async function loadTeskSerial(
  supabase: SupabaseClient,
  orgId: string
): Promise<TeskSerialConfig> {
  const { data } = await supabase
    .from("maliye_tesk_serial")
    .select("seri, start_sira, anchor_date, per_page")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!data) return { ...DEFAULT_TESK_SERIAL };
  return {
    seri: String((data as { seri?: string }).seri ?? "A") || "A",
    start_sira: Number((data as { start_sira?: number }).start_sira ?? 1),
    anchor_date: String((data as { anchor_date?: string }).anchor_date ?? DEFAULT_TESK_SERIAL.anchor_date),
    per_page: Math.max(2, Number((data as { per_page?: number }).per_page ?? 14)),
  };
}

/** Belirli bir gün için sıra numarası: start_sira + (gün - anchor). */
export function siraForDate(cfg: TeskSerialConfig, dateYmd: string): number {
  const anchor = Date.parse(`${cfg.anchor_date}T00:00:00Z`);
  const day = Date.parse(`${dateYmd}T00:00:00Z`);
  if (Number.isNaN(anchor) || Number.isNaN(day)) return cfg.start_sira;
  const diffDays = Math.floor((day - anchor) / (24 * 60 * 60 * 1000));
  return Math.max(cfg.start_sira, cfg.start_sira + diffDays);
}

/** Seçilen gün için TESK satırları (oda, ad-soyad, gecelik oda ücreti). */
export async function fetchTeskRowsForDay(
  supabase: SupabaseClient,
  orgId: string,
  dateYmd: string
): Promise<TeskRow[]> {
  const guests = await fetchGuestsForDay(supabase, orgId, dateYmd);
  return guests.map((g) => ({
    room: g.rooms?.room_number ?? "—",
    name: g.full_name ?? "",
    fee: fmtFee(g.rooms?.price_per_night ?? null),
  }));
}

function teskSealSvg(provinceCode: string): string {
  const code = (provinceCode || "06").replace(/[<&]/g, "");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="120" height="120">
  <circle cx="100" cy="100" r="96" fill="none" stroke="#111" stroke-width="2.4"/>
  <circle cx="100" cy="100" r="80" fill="none" stroke="#111" stroke-width="1"/>
  <text x="100" y="52" text-anchor="middle" font-family="Times New Roman, serif" font-size="15" font-weight="700">T.C.</text>
  <text x="100" y="78" text-anchor="middle" font-family="Times New Roman, serif" font-size="9" font-weight="700">HAZİNE VE MALİYE</text>
  <text x="100" y="92" text-anchor="middle" font-family="Times New Roman, serif" font-size="9" font-weight="700">BAKANLIĞI</text>
  <text x="100" y="140" text-anchor="middle" font-family="Times New Roman, serif" font-size="26" font-weight="700">${escapeHtml(code)}</text>
</svg>`;
}

/**
 * TESK Günlük Müşteri Listesi HTML — kağıt forma birebir yakın, iki sütun.
 */
export function buildTeskDailyListHtml(
  rows: TeskRow[],
  branding: HmbBranding,
  dateYmd: string,
  serial: { seri: string; sira: number }
): string {
  const listDate = fmtTrDateFromYmd(dateYmd);
  const perPage = 14;
  const rowsPerCol = Math.max(Math.ceil(perPage / 2), Math.ceil(rows.length / 2));

  const cell = (r: TeskRow | null, mid: boolean): string => {
    const roomCls = mid ? "c-room mid" : "c-room";
    if (!r) {
      return `<td class="${roomCls}">&nbsp;</td><td class="c-name">&nbsp;</td><td class="c-fee">&nbsp;</td>`;
    }
    return `<td class="${roomCls}">${escapeHtml(r.room)}</td><td class="c-name">${escapeHtml(r.name)}</td><td class="c-fee">${escapeHtml(r.fee)}</td>`;
  };

  const bodyRows: string[] = [];
  for (let i = 0; i < rowsPerCol; i++) {
    const left = rows[i] ?? null;
    const right = rows[i + rowsPerCol] ?? null;
    bodyRows.push(`<tr>${cell(left, false)}${cell(right, true)}</tr>`);
  }

  const sealSrc = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(teskSealSvg(branding.provinceCode))}`;

  const teskLogo = branding.logoDataUrl
    ? `<img src="${escapeAttr(branding.logoDataUrl)}" alt="" style="max-height:60px;max-width:70px;" />`
    : `<div class="tesk-emblem">TESK</div>`;

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Günlük Müşteri Listesi — ${escapeHtml(listDate)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: 'Times New Roman', Times, serif; color:#111; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .sheet { max-width: 190mm; margin: 0 auto; padding: 6mm; }
    .top { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
    .brand { display:flex; align-items:center; gap:10px; }
    .tesk-emblem { width:60px; height:60px; border:2px solid #111; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:13px; }
    .brand-text { font-size:11pt; font-weight:800; line-height:1.15; text-transform:uppercase; max-width:210px; }
    .brand-text small { display:block; font-size:8pt; font-weight:600; color:#333; margin-top:3px; text-transform:none; }
    .seal { text-align:center; }
    .seal img { width:96px; height:96px; }
    .meta { border:1px solid #111; min-width:210px; }
    .stamp-box { height:70px; border-bottom:1px solid #111; padding:4px 6px; font-size:8pt; color:#444; }
    .meta-row { display:flex; border-bottom:1px solid #111; }
    .meta-row:last-child { border-bottom:none; }
    .meta-row .k { width:64px; padding:4px 6px; font-size:9pt; font-weight:700; border-right:1px solid #111; }
    .meta-row .v { flex:1; padding:4px 6px; font-size:9.5pt; font-weight:700; }
    .title { text-align:center; font-size:14pt; font-weight:800; letter-spacing:.5px; margin:12px 0 8px; }
    table.list { width:100%; border-collapse:collapse; table-layout:fixed; }
    table.list th, table.list td { border:1px solid #111; padding:5px 6px; font-size:9.5pt; height:26px; }
    table.list th { font-size:8.5pt; font-weight:700; background:#f3f4f6; text-align:center; }
    .c-room { width:9%; text-align:center; }
    .c-name { width:32%; }
    .c-fee { width:9%; text-align:right; white-space:nowrap; }
    .mid { border-left:2px solid #111 !important; }
    .foot { margin-top:10px; font-size:8pt; color:#333; display:flex; justify-content:space-between; }
    .no-print { background:#f1f5f9; padding:10px 16px; text-align:center; border-bottom:1px solid #e2e8f0; }
    .no-print button { padding:10px 24px; font-size:14px; font-weight:700; border:none; border-radius:8px; cursor:pointer; margin:0 6px; }
    .no-print .p { background:#1d4ed8; color:#fff; }
    .no-print .c { background:#e2e8f0; color:#334155; }
    @media print { .no-print { display:none !important; } body { margin:0; } }
  </style>
</head>
<body>
  <div class="no-print">
    <button class="p" onclick="window.print()">Yazdır</button>
    <button class="c" onclick="window.close()">Kapat</button>
  </div>
  <div class="sheet">
    <div class="top">
      <div class="brand">
        ${teskLogo}
        <div class="brand-text">
          Türkiye Esnaf ve Sanatkârları Konfederasyonu
          <small>${escapeHtml(branding.legalCompanyName)}</small>
        </div>
      </div>
      <div class="seal"><img src="${escapeAttr(sealSrc)}" alt=""/></div>
      <div class="meta">
        <div class="stamp-box">Mükellef Kaşesi</div>
        <div class="meta-row"><div class="k">Seri</div><div class="v">${escapeHtml(serial.seri)}</div></div>
        <div class="meta-row"><div class="k">Sıra No</div><div class="v">${escapeHtml(String(serial.sira))}</div></div>
        <div class="meta-row"><div class="k">Tarih</div><div class="v">${escapeHtml(listDate)}</div></div>
      </div>
    </div>

    <div class="title">GÜNLÜK MÜŞTERİ LİSTESİ</div>

    <table class="list">
      <thead>
        <tr>
          <th class="c-room">Oda No</th>
          <th class="c-name">Müşterinin Adı - Soyadı</th>
          <th class="c-fee">Oda Ücreti</th>
          <th class="c-room mid">Oda No</th>
          <th class="c-name">Müşterinin Adı - Soyadı</th>
          <th class="c-fee">Oda Ücreti</th>
        </tr>
      </thead>
      <tbody>${bodyRows.join("")}</tbody>
    </table>

    <div class="foot">
      <span>${escapeHtml(branding.address)}</span>
      <span>${rows.length} müşteri · ${escapeHtml(listDate)}</span>
    </div>
  </div>
</body>
</html>`;
}
