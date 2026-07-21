/** Jandarma KBS SOAP — ParametreListele (doğrudan Edge → Jandarma; Railway şart değil). */

import { detectEgressIpv4 } from "./kbsEgressIp.ts";

const DEFAULT_SOAP_URL =
  "https://vatandas.jandarma.gov.tr/KBS_Tesis_Servis/SrvShsYtkTml.svc";

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
    /<\s*(?:\w+:)?Basarili\s*>\s*(true|false)\s*<\s*\/\s*(?:\w+:)?Basarili\s*>/i
  );
  const mesajMatch = xml.match(/<\s*(?:\w+:)?Mesaj\s*>\s*([\s\S]*?)\s*<\s*\/\s*(?:\w+:)?Mesaj\s*>/i);
  const hataKoduMatch = xml.match(
    /<\s*(?:\w+:)?HataKodu\s*>\s*([\s\S]*?)\s*<\s*\/\s*(?:\w+:)?HataKodu\s*>/i
  );
  return {
    basarili: String(basariliMatch?.[1] ?? "").toLowerCase() === "true",
    mesaj: mesajMatch?.[1]?.trim() ?? null,
    hataKodu: hataKoduMatch?.[1]?.trim() ?? null,
  };
}

function enrichYetkisizIp(message: string, egressIp: string | null): string {
  if (!/yetkisiz\s*ip|yetkihatasi/i.test(message)) return message;
  const ipLine = egressIp
    ? ` ★ KAYDEDİLECEK IP (Supabase Edge çıkış): ${egressIp} — Jandarma panelinde bunu yazın VEYA tüm IP listesini SİLİN/BOŞALTIN.`
    : " ★ IP okunamadı — Jandarma panelinde yetkili IP listesini tamamen SİLİN/BOŞALTIN.";
  return `${message} ${ipLine} Eski VPS IP kayıtlıysa Yetkisiz IP verir. Sabit IP şart değil.`;
}

export async function testJandarmaKbsConnection(args: {
  facilityCode: string;
  kullaniciTc: string;
  password: string;
  soapBaseUrl?: string;
}): Promise<{ ok: boolean; message: string; egressIp?: string | null }> {
  const egressIp = await detectEgressIpv4();
  const userTc = Number(args.kullaniciTc.replace(/\D/g, ""));
  const tssKod = Number(String(args.facilityCode).replace(/\s/g, ""));
  if (!Number.isFinite(userTc) || userTc <= 0 || !Number.isFinite(tssKod) || tssKod <= 0) {
    return { ok: false, message: "Tesis kodu ve KullaniciTC sayısal olmalıdır.", egressIp };
  }
  if (!args.password?.trim()) {
    return { ok: false, message: "KBS otel şifresi kayıtlı değil. Önce şifreyi kaydedin.", egressIp };
  }

  const baseUrl = (args.soapBaseUrl ?? Deno.env.get("KBS_SOAP_BASE_URL") ?? DEFAULT_SOAP_URL).trim();
  const bodyXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ParametreListele xmlns="http://tempuri.org/">
      <KullaniciTC>${userTc}</KullaniciTC>
      <TssKod>${tssKod}</TssKod>
      <Sifre>${esc(args.password)}</Sifre>
    </ParametreListele>
  </soap:Body>
</soap:Envelope>`;

  const action = "http://tempuri.org/ISrvShsYtkTml/ParametreListele";
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 22_000);
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
    if (!res.ok) {
      return { ok: false, message: `Jandarma HTTP ${res.status}`, egressIp };
    }
    const sonuc = extractSonuc(text);
    if (!sonuc.basarili) {
      const base = `KBS reddetti: ${sonuc.hataKodu ?? "?"} ${sonuc.mesaj ?? ""}`.trim();
      return {
        ok: false,
        message: enrichYetkisizIp(base, egressIp),
        egressIp,
      };
    }
    return {
      ok: true,
      message: egressIp
        ? `Jandarma KBS bağlantısı başarılı. (Edge çıkış IP: ${egressIp})`
        : "Jandarma KBS bağlantısı başarılı.",
      egressIp,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/abort/i.test(msg)) {
      return {
        ok: false,
        message: "Jandarma yanıt vermedi (zaman aşımı). Ağ veya KBS servisini kontrol edin.",
        egressIp,
      };
    }
    return { ok: false, message: enrichYetkisizIp(`Jandarma erişim hatası: ${msg}`, egressIp), egressIp };
  } finally {
    clearTimeout(t);
  }
}
