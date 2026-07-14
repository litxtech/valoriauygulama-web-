import type {
  OfficialSubmissionProvider,
  ProviderCredentials,
  ProviderResponse,
  ProviderTestResponse,
  SubmitCheckInPayload,
  SubmitCheckOutPayload,
  SubmitDeletePayload
} from './types.js';
import { detectEgressIpv4 } from '../../shared/utils/egressIp.js';
import {
  looksLikeAlphanumericPassportNo,
  normalizeKbsBirthDate,
  normalizeKbsDocNo,
  normalizeKbsRoomNo,
  normalizeKbsUlkeCode,
  resolveKbsBelgeSeri
} from '../../shared/utils/kbsFieldNormalize.js';

/**
 * Jandarma KBS SOAP (SrvShsYtkTml).
 * Üç müşteri kolu:
 *  - tc_citizen  → MusteriKimlikNoGiris / Cikis / TCSIil
 *  - ykn_foreign → MusteriYabanciGiris (KimlikNo = YKN)
 *  - foreign     → MusteriYabanciGiris (BelgeNo = pasaport)
 */
export class HttpOfficialProvider implements OfficialSubmissionProvider {
  constructor(private readonly baseUrl: string) {}

  private async soapCall(args: { action: string; bodyXml: string; timeoutMs?: number }) {
    const controller = new AbortController();
    const timeoutMs = args.timeoutMs ?? 25_000;
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'content-type': 'text/xml; charset=utf-8',
          soapaction: args.action
        },
        body: args.bodyXml,
        signal: controller.signal
      });
      const text = await res.text();
      if (!res.ok) {
        const err = new Error(`Provider HTTP ${res.status}`);
        // @ts-expect-error attach details
        err.details = { status: res.status, body: text.slice(0, 2000) };
        throw err;
      }
      return text;
    } finally {
      clearTimeout(t);
    }
  }

  private extractSonuc(xmlText: string): {
    basarili: boolean;
    mesaj?: string | null;
    hataKodu?: string | null;
    raw: { xml: string };
  } {
    const xml = xmlText ?? '';
    const basariliMatch = xml.match(/<\s*(?:\w+:)?Basarili\s*>\s*(true|false)\s*<\s*\/\s*(?:\w+:)?Basarili\s*>/i);
    const mesajMatch = xml.match(/<\s*(?:\w+:)?Mesaj\s*>\s*([\s\S]*?)\s*<\s*\/\s*(?:\w+:)?Mesaj\s*>/i);
    const hataKoduMatch = xml.match(/<\s*(?:\w+:)?HataKodu\s*>\s*([\s\S]*?)\s*<\s*\/\s*(?:\w+:)?HataKodu\s*>/i);
    return {
      basarili: String(basariliMatch?.[1] ?? '').toLowerCase() === 'true',
      mesaj: mesajMatch?.[1]?.trim() ?? null,
      hataKodu: hataKoduMatch?.[1]?.trim() ?? null,
      raw: { xml: xml.slice(0, 4000) }
    };
  }

  private static esc(s: string) {
    return s
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');
  }

  /**
   * WCF DataContractSerializer: Order yoksa alanlar alfabetik beklenir.
   * Yanlış sıra → alanlar deserialize olmaz → boş belge/uyruk/doğum → reddedilir.
   */
  private buildWcfDatacontractObjectXml(
    ns: string,
    fields: Record<string, string | null | undefined>,
    opts?: { prefix?: string }
  ) {
    const prefix = opts?.prefix ?? 'a';
    const iNs = 'http://www.w3.org/2001/XMLSchema-instance';
    const parts: string[] = [];
    const keys = Object.keys(fields)
      .filter((k) => fields[k] !== undefined)
      .sort((a, b) => a.localeCompare(b, 'en'));
    for (const k of keys) {
      const v = fields[k];
      if (v === undefined) continue;
      if (v === null) {
        parts.push(`<${prefix}:${k} xmlns:i="${iNs}" i:nil="true" />`);
      } else {
        parts.push(`<${prefix}:${k}>${HttpOfficialProvider.esc(String(v))}</${prefix}:${k}>`);
      }
    }
    return `<musteri xmlns:${prefix}="${ns}" xmlns:i="${iNs}">${parts.join('')}</musteri>`;
  }

  /** OCR etiket sızıntısı: "Anne" / "Baba" gerçek isim değil → SOAP’a gönderme. */
  private clipParentName(value: string | null | undefined): string | undefined {
    const t = this.clipName(value);
    if (!t) return undefined;
    const fold = t
      .toUpperCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^A-Z]/g, '');
    if (
      /^(?:ANNE|ANNEADI|BABA|BABAADI|MOTHER|FATHER|ANA|ATA|VALID|SURNAME|GIVENNAMES?)$/.test(fold)
    ) {
      return undefined;
    }
    return t;
  }

  /** Giriş/çıkış — KBS: "YYYY-MM-DD HH:MM:SS" (Türkiye saati). */
  private normalizeDateTime(value: string | null | undefined): string | null {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(d);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? '00';
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
  }

  /** Doğum tarihi — KBS: "YYYY-MM-DD". */
  private normalizeDateOnly(value: string | null | undefined): string | null {
    return normalizeKbsBirthDate(value);
  }

  /** KBS alan limitleri — fazla uzun ad/soyad reddedilmesin. */
  private clipName(value: string | null | undefined, max = 80): string | null {
    const t = (value ?? '').trim().replace(/\s+/g, ' ');
    if (!t) return null;
    return t.length > max ? t.slice(0, max).trim() : t;
  }

  private clipDoc(value: string | null | undefined, max = 20): string | null {
    return normalizeKbsDocNo(value, max);
  }

  private credsNumeric(credentials: ProviderCredentials) {
    const userTc = Number(credentials.username);
    const tssKod = Number(credentials.facilityCode);
    if (!Number.isFinite(userTc) || !Number.isFinite(tssKod)) {
      throw new Error('KBS credentials must be numeric (username=KullaniciTC, facilityCode=TssKod)');
    }
    return { userTc, tssKod };
  }

  private personKind(payload: {
    kbsPersonKind?: string | null;
    documentNumber?: string | null;
  }) {
    // AP902390 vb. — asla T.C. sayma (harfler KIMLIKNO’da silinmesin).
    if (looksLikeAlphanumericPassportNo(payload.documentNumber)) {
      return 'foreign' as const;
    }
    const k = String(payload.kbsPersonKind ?? 'foreign');
    if (k === 'tc_citizen') return 'tc_citizen' as const;
    if (k === 'ykn_foreign') return 'ykn_foreign' as const;
    return 'foreign' as const;
  }

  private soapGender(g: string | null | undefined): string | undefined {
    if (g === 'M') return 'ERKEK';
    if (g === 'F') return 'KADIN';
    // Yabancıda cinsiyet zorunlu değil; TANIMSIZ KBS’de sık hata verir → gönderme.
    return undefined;
  }

  private soapUsage(usage: string | null | undefined): string {
    const u = String(usage ?? 'konaklama').toLowerCase();
    if (u === 'gunluk') return 'GUNLUK';
    if (u === 'afetzede') return 'AFETZEDE';
    return 'KONAKLAMA';
  }

  private soapMarital(m: string | null | undefined): string | undefined {
    if (m === 'married') return 'EVLI';
    if (m === 'single') return 'BEKAR';
    return undefined;
  }

  private nameParts(payload: SubmitCheckInPayload) {
    const fullName =
      (payload.fullName ??
        ([payload.firstName, payload.lastName].filter(Boolean).join(' ').trim() || null)) as string | null;
    const firstName = payload.firstName ?? (fullName ? fullName.split(' ')[0] : null);
    const lastName = payload.lastName ?? null;
    const adiFromParts = [firstName, payload.middleName]
      .filter((x) => x != null && String(x).trim().length > 0)
      .join(' ')
      .trim();
    return {
      adi: this.clipName(adiFromParts || firstName || null),
      soyadi: this.clipName(lastName)
    };
  }

  private envelope(opName: string, userTc: number, tssKod: number, password: string, musteriXml: string) {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${opName} xmlns="http://tempuri.org/">
      <KullaniciTC>${userTc}</KullaniciTC>
      <TssKod>${tssKod}</TssKod>
      <Sifre>${HttpOfficialProvider.esc(password)}</Sifre>
      ${musteriXml}
    </${opName}>
  </soap:Body>
</soap:Envelope>`;
  }

  async submitCheckIn(payload: SubmitCheckInPayload, credentials: ProviderCredentials): Promise<ProviderResponse> {
    const { userTc, tssKod } = this.credsNumeric(credentials);
    const kind = this.personKind(payload);
    const { adi, soyadi } = this.nameParts(payload);
    const room = normalizeKbsRoomNo(payload.roomNumber);
    const giris =
      this.normalizeDateTime(payload.checkInAt) ?? this.normalizeDateTime(new Date().toISOString());
    if (!giris) throw new Error('Giriş tarihi zorunlu (KBS)');
    // Doğum: yalnızca gün (datetime / yanlış dilim KBS’de sık reddedilir).
    const dogum = this.normalizeDateOnly(payload.birthDate);
    // Jandarma ülke tablosu: Türkiye = TC (ICAO TUR kabul edilmez).
    const ulke = normalizeKbsUlkeCode(payload.nationalityCode, payload.issuingCountryCode);
    const kimlikOrBelge = this.clipDoc(payload.documentNumber);
    // Pasaport: BELGENO = tam no (AP902390); BELGESERI = harf öneki veya ayrı seri.
    const seri =
      kind === 'foreign' || kind === 'ykn_foreign'
        ? resolveKbsBelgeSeri(kimlikOrBelge, payload.documentSeries)
        : this.clipDoc(payload.documentSeries) || kimlikOrBelge;

    if (!room) throw new Error('Oda No zorunlu (KBS)');
    if (!kimlikOrBelge) throw new Error(kind === 'tc_citizen' ? 'Kimlik No (T.C.) zorunlu' : 'Kimlik/Belge No zorunlu');
    if (kind === 'tc_citizen' && /[A-Z]/.test(kimlikOrBelge)) {
      throw new Error('Alfanümerik pasaport no T.C. girişi ile gönderilemez (örn. AP902390 → yabancı).');
    }

    let opName: string;
    let musteriFields: Record<string, string | null | undefined>;

    if (kind === 'tc_citizen') {
      // T.C.: Kimlik No ile sistem bilgi çeker; konaklama alanları zorunlu.
      opName = 'MusteriKimlikNoGiris';
      musteriFields = {
        KIMLIKNO: kimlikOrBelge.replace(/\D/g, ''),
        BELGESERI: seri || undefined,
        ADI: adi || undefined,
        SOYADI: soyadi || undefined,
        BABAADI: this.clipParentName(payload.fatherName),
        ANAADI: this.clipParentName(payload.motherName),
        DOGUMTARIHI: dogum || undefined,
        ULKE: ulke || 'TC',
        CINSIYET: this.soapGender(payload.gender),
        MEDENIHAL: this.soapMarital(payload.maritalStatus),
        ODANO: room,
        PLAKA: payload.plateNumber?.trim() || undefined,
        TELEFON: payload.phone?.replace(/\D/g, '') || undefined,
        KULLANIMSEKLI: this.soapUsage(payload.usageKind),
        GRSTRH: giris,
        ILERITARIHLI: payload.forwardDated ? 'true' : undefined
      };
    } else {
      // YKN olan yabancı + Yabancı — MusteriYabanciGiris
      opName = 'MusteriYabanciGiris';
      if (!adi) throw new Error('Adı zorunlu (KBS)');
      if (!soyadi) throw new Error('Soyadı zorunlu (KBS)');
      if (!dogum) throw new Error('Doğum Tarihi zorunlu (KBS) — YYYY-MM-DD');
      if (!ulke) {
        throw new Error(
          'Ülke/uyruk KBS kodu geçersiz. ICAO-3 (örn. UZB, SAU) veya ülke adı girin; Türkiye için TC.'
        );
      }
      if (!seri) throw new Error('Belge Seri No zorunlu (KBS)');

      musteriFields = {
        // YKN kolunda kimlik no YKN; yabancıda yalnız BELGENO (KIMLIKNO gönderme).
        KIMLIKNO: kind === 'ykn_foreign' ? kimlikOrBelge : undefined,
        BELGENO: kimlikOrBelge,
        BELGESERI: seri,
        ADI: adi,
        SOYADI: soyadi,
        BABAADI: this.clipParentName(payload.fatherName),
        ANAADI: this.clipParentName(payload.motherName),
        DOGUMTARIHI: dogum,
        ULKE: ulke,
        CINSIYET: this.soapGender(payload.gender),
        MEDENIHAL: this.soapMarital(payload.maritalStatus),
        ODANO: room,
        PLAKA: payload.plateNumber?.trim() || undefined,
        TELEFON: payload.phone?.replace(/\D/g, '') || undefined,
        KULLANIMSEKLI: this.soapUsage(payload.usageKind),
        GRSTRH: giris,
        ILERITARIHLI: payload.forwardDated ? 'true' : undefined
      };
    }

    const musteriXml = this.buildWcfDatacontractObjectXml(
      'http://schemas.datacontract.org/2004/07/KBS_Tesis_Servis',
      musteriFields
    );
    const bodyXml = this.envelope(opName, userTc, tssKod, credentials.password, musteriXml);
    const xmlText = await this.soapCall({ action: `http://tempuri.org/ISrvShsYtkTml/${opName}`, bodyXml });
    const sonuc = this.extractSonuc(xmlText);
    if (!sonuc.basarili) {
      const tip = `${sonuc.hataKodu ?? 'UNKNOWN'} ${sonuc.mesaj ?? ''}`.trim();
      throw new Error(
        `KBS check-in failed: ${tip} [belge=${kimlikOrBelge} seri=${seri ?? ''} ulke=${ulke ?? ''} dogum=${dogum ?? ''} oda=${room} kind=${kind}]`
          .replace(/\s+/g, ' ')
          .trim()
      );
    }
    return {
      summary: { kbs: 'jandarma', action: opName, kind, sonuc: { hataKodu: sonuc.hataKodu, mesaj: sonuc.mesaj } }
    };
  }

  async submitCheckOut(payload: SubmitCheckOutPayload, credentials: ProviderCredentials): Promise<ProviderResponse> {
    const { userTc, tssKod } = this.credsNumeric(credentials);
    const belgeno = this.clipDoc(payload.documentNumber);
    if (!belgeno) throw new Error('documentNumber required for check-out');
    const kind = this.personKind({ ...payload, documentNumber: belgeno });
    const opName = kind === 'tc_citizen' ? 'MusteriKimlikNoCikis' : 'MusteriYabanciCikis';

    const cikis =
      this.normalizeDateTime(payload.checkOutAt) ?? this.normalizeDateTime(new Date().toISOString());
    if (!cikis) throw new Error('Çıkış tarihi zorunlu (KBS)');

    const musteriFields: Record<string, string | null | undefined> =
      kind === 'tc_citizen'
        ? {
            KIMLIKNO: belgeno.replace(/\D/g, ''),
            CKSTRH: cikis,
            CKSTIP: 'TESISTENCIKIS'
          }
        : {
            BELGENO: belgeno,
            CKSTRH: cikis,
            CKSTIP: 'TESISTENCIKIS'
          };

    const musteriXml = this.buildWcfDatacontractObjectXml(
      'http://schemas.datacontract.org/2004/07/KBS_Tesis_Servis',
      musteriFields
    );
    const bodyXml = this.envelope(opName, userTc, tssKod, credentials.password, musteriXml);
    const xmlText = await this.soapCall({ action: `http://tempuri.org/ISrvShsYtkTml/${opName}`, bodyXml });
    const sonuc = this.extractSonuc(xmlText);
    if (!sonuc.basarili) {
      throw new Error(`KBS check-out failed: ${sonuc.hataKodu ?? 'UNKNOWN'} ${sonuc.mesaj ?? ''}`.trim());
    }
    return { summary: { kbs: 'jandarma', action: opName, kind, sonuc: { hataKodu: sonuc.hataKodu, mesaj: sonuc.mesaj } } };
  }

  async submitDelete(payload: SubmitDeletePayload, credentials: ProviderCredentials): Promise<ProviderResponse> {
    const { userTc, tssKod } = this.credsNumeric(credentials);
    const belgeno = this.clipDoc(payload.documentNumber);
    if (!belgeno) throw new Error('documentNumber required for delete');
    const kind = this.personKind({ ...payload, documentNumber: belgeno });
    const opName = kind === 'tc_citizen' ? 'MusteriTCSIil' : 'MusteriYabanciSil';

    const musteriFields: Record<string, string | null | undefined> =
      kind === 'tc_citizen'
        ? { KIMLIKNO: belgeno.replace(/\D/g, '') }
        : { BELGENO: belgeno };

    const musteriXml = this.buildWcfDatacontractObjectXml(
      'http://schemas.datacontract.org/2004/07/KBS_Tesis_Servis',
      musteriFields
    );
    const bodyXml = this.envelope(opName, userTc, tssKod, credentials.password, musteriXml);
    const xmlText = await this.soapCall({ action: `http://tempuri.org/ISrvShsYtkTml/${opName}`, bodyXml });
    const sonuc = this.extractSonuc(xmlText);
    if (!sonuc.basarili) {
      throw new Error(`KBS delete failed: ${sonuc.hataKodu ?? 'UNKNOWN'} ${sonuc.mesaj ?? ''}`.trim());
    }
    return { summary: { kbs: 'jandarma', action: opName, kind, sonuc: { hataKodu: sonuc.hataKodu, mesaj: sonuc.mesaj } } };
  }

  async testConnection(credentials: ProviderCredentials): Promise<ProviderTestResponse> {
    const userTc = Number(credentials.username);
    const tssKod = Number(credentials.facilityCode);
    const egressIp = await detectEgressIpv4();
    if (!Number.isFinite(userTc) || !Number.isFinite(tssKod)) {
      return {
        ok: false,
        message: 'KBS credentials must be numeric (username=KullaniciTC, facilityCode=TssKod)',
        egressIp
      };
    }

    const bodyXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ParametreListele xmlns="http://tempuri.org/">
      <KullaniciTC>${userTc}</KullaniciTC>
      <TssKod>${tssKod}</TssKod>
      <Sifre>${HttpOfficialProvider.esc(credentials.password)}</Sifre>
    </ParametreListele>
  </soap:Body>
</soap:Envelope>`;

    try {
      const xmlText = await this.soapCall({
        action: 'http://tempuri.org/ISrvShsYtkTml/ParametreListele',
        bodyXml,
        timeoutMs: 20_000
      });
      const sonuc = this.extractSonuc(xmlText);
      if (!sonuc.basarili) {
        const base = `KBS connection failed: ${sonuc.hataKodu ?? 'UNKNOWN'} ${sonuc.mesaj ?? ''}`.trim();
        const ipHint =
          /yetkisiz\s*ip/i.test(base) && egressIp
            ? ` (Railway çıkış IP bilgisi: ${egressIp} — sabit IP zorunlu değil; paneldeki kayıtlı IP ile uyuşmuyorsa güncelleyin veya temizleyin.)`
            : '';
        return {
          ok: false,
          message: `${base}${ipHint}`,
          details: sonuc.raw,
          egressIp
        };
      }
      return { ok: true, message: 'KBS connection ok', egressIp };
    } catch (e) {
      const base = e instanceof Error ? e.message : 'KBS connection failed';
      return { ok: false, message: base, egressIp };
    }
  }
}
