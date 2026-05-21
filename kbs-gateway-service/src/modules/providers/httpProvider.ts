import type {
  OfficialSubmissionProvider,
  ProviderCredentials,
  ProviderResponse,
  ProviderTestResponse,
  SubmitCheckInPayload,
  SubmitCheckOutPayload,
  SubmitDeletePayload
} from './types.js';

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

  private extractSonuc(xmlText: string): { basarili: boolean; mesaj?: string | null; hataKodu?: string | null; raw: { xml: string } } {
    // Minimal parsing (WCF SOAP). We only need Sonuc.{Basarili,Mesaj,HataKodu}.
    // Keep raw XML for debugging, but truncate to avoid huge logs.
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

  private buildWcfDatacontractObjectXml(ns: string, fields: Record<string, string | null | undefined>, opts?: { prefix?: string }) {
    const prefix = opts?.prefix ?? 'a';
    const iNs = 'http://www.w3.org/2001/XMLSchema-instance';
    const parts: string[] = [];
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue; // omit
      if (v === null) {
        parts.push(`<${prefix}:${k} xmlns:i="${iNs}" i:nil="true" />`);
      } else {
        parts.push(`<${prefix}:${k}>${HttpOfficialProvider.esc(String(v))}</${prefix}:${k}>`);
      }
    }
    return `<musteri xmlns:${prefix}="${ns}" xmlns:i="${iNs}">${parts.join('')}</musteri>`;
  }

  private normalizeDateTime(value: string | null | undefined): string | null {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  async submitCheckIn(payload: SubmitCheckInPayload, credentials: ProviderCredentials): Promise<ProviderResponse> {
    // Real endpoint (WCF SOAP): https://vatandas.jandarma.gov.tr/KBS_Tesis_Servis/SrvShsYtkTml.svc
    // Real operations (SOAP actions): MusteriYabanciGiris / MusteriYabanciCikis / ...
    // NOTE: We implement the "Yabanci" path (passport/MRZ) here.

    const userTc = Number(credentials.username);
    const tssKod = Number(credentials.facilityCode);
    if (!Number.isFinite(userTc) || !Number.isFinite(tssKod)) throw new Error('KBS credentials must be numeric (username=KullaniciTC, facilityCode=TssKod)');
    if (!payload.documentNumber) throw new Error('documentNumber required for check-in');

    const gender = payload.gender === 'M' ? 'ERKEK' : payload.gender === 'F' ? 'KADIN' : 'TANIMSIZ';
    const fullName = (payload.fullName ??
      (([payload.firstName, payload.lastName].filter(Boolean).join(' ').trim() || null) as string | null)) as string | null;
    const firstName = payload.firstName ?? (fullName ? fullName.split(' ')[0] : null);
    const lastName = payload.lastName ?? null;
    const adiFromParts = [firstName, payload.middleName].filter((x) => x != null && String(x).trim().length > 0).join(' ').trim();
    const adi = adiFromParts || firstName || null;

    const musteriFields: Record<string, string | null | undefined> = {
      ADI: adi,
      SOYADI: lastName ?? null,
      BELGENO: payload.documentNumber,
      DOGUMTARIHI: payload.birthDate ? this.normalizeDateTime(payload.birthDate) : null,
      GRSTRH: this.normalizeDateTime(payload.checkInAt) ?? new Date().toISOString(),
      ODANO: payload.roomNumber ?? null,
      CINSIYET: gender
      // Ek KBS alanları (seri, kullanım, plaka, telefon vb.) resmi WSDL ile doğrulanana kadar SOAP’a eklenmez;
      // gateway yükünde taşınır ve log / ileri entegrasyon için kullanılabilir.
    };

    const musteriXml = this.buildWcfDatacontractObjectXml('http://schemas.datacontract.org/2004/07/KBS_Tesis_Servis', musteriFields);

    const bodyXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <MusteriYabanciGiris xmlns="http://tempuri.org/">
      <KullaniciTC>${userTc}</KullaniciTC>
      <TssKod>${tssKod}</TssKod>
      <Sifre>${HttpOfficialProvider.esc(credentials.password)}</Sifre>
      ${musteriXml}
    </MusteriYabanciGiris>
  </soap:Body>
</soap:Envelope>`;

    const xmlText = await this.soapCall({ action: 'http://tempuri.org/ISrvShsYtkTml/MusteriYabanciGiris', bodyXml });
    const sonuc = this.extractSonuc(xmlText);
    if (!sonuc.basarili) throw new Error(`KBS check-in failed: ${sonuc.hataKodu ?? 'UNKNOWN'} ${sonuc.mesaj ?? ''}`.trim());
    return { summary: { kbs: 'jandarma', action: 'MusteriYabanciGiris', sonuc: { hataKodu: sonuc.hataKodu, mesaj: sonuc.mesaj } } };
  }

  async submitCheckOut(payload: SubmitCheckOutPayload, credentials: ProviderCredentials): Promise<ProviderResponse> {
    const userTc = Number(credentials.username);
    const tssKod = Number(credentials.facilityCode);
    if (!Number.isFinite(userTc) || !Number.isFinite(tssKod)) throw new Error('KBS credentials must be numeric (username=KullaniciTC, facilityCode=TssKod)');
    if (!payload.documentNumber) throw new Error('documentNumber required for check-out');

    const musteriFields: Record<string, string | null | undefined> = {
      BELGENO: payload.documentNumber,
      CKSTRH: this.normalizeDateTime(payload.checkOutAt) ?? new Date().toISOString(),
      CKSTIP: 'TESISTENCIKIS'
    };
    const musteriXml = this.buildWcfDatacontractObjectXml('http://schemas.datacontract.org/2004/07/KBS_Tesis_Servis', musteriFields);

    const bodyXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <MusteriYabanciCikis xmlns="http://tempuri.org/">
      <KullaniciTC>${userTc}</KullaniciTC>
      <TssKod>${tssKod}</TssKod>
      <Sifre>${HttpOfficialProvider.esc(credentials.password)}</Sifre>
      ${musteriXml}
    </MusteriYabanciCikis>
  </soap:Body>
</soap:Envelope>`;

    const xmlText = await this.soapCall({ action: 'http://tempuri.org/ISrvShsYtkTml/MusteriYabanciCikis', bodyXml });
    const sonuc = this.extractSonuc(xmlText);
    if (!sonuc.basarili) throw new Error(`KBS check-out failed: ${sonuc.hataKodu ?? 'UNKNOWN'} ${sonuc.mesaj ?? ''}`.trim());
    return { summary: { kbs: 'jandarma', action: 'MusteriYabanciCikis', sonuc: { hataKodu: sonuc.hataKodu, mesaj: sonuc.mesaj } } };
  }

  /**
   * KBS kayıt silme — yabancı: MusteriYabanciSil; T.C.: MusteriTCSIil (belge no = BELGENO).
   */
  async submitDelete(payload: SubmitDeletePayload, credentials: ProviderCredentials): Promise<ProviderResponse> {
    const userTc = Number(credentials.username);
    const tssKod = Number(credentials.facilityCode);
    if (!Number.isFinite(userTc) || !Number.isFinite(tssKod)) {
      throw new Error('KBS credentials must be numeric (username=KullaniciTC, facilityCode=TssKod)');
    }
    if (!payload.documentNumber) throw new Error('documentNumber required for delete');

    const isTc = payload.kbsPersonKind === 'tc_citizen';
    const opName = isTc ? 'MusteriTCSIil' : 'MusteriYabanciSil';
    const action = `http://tempuri.org/ISrvShsYtkTml/${opName}`;

    const musteriFields: Record<string, string | null | undefined> = {
      BELGENO: payload.documentNumber
    };
    const musteriXml = this.buildWcfDatacontractObjectXml(
      'http://schemas.datacontract.org/2004/07/KBS_Tesis_Servis',
      musteriFields
    );

    const bodyXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${opName} xmlns="http://tempuri.org/">
      <KullaniciTC>${userTc}</KullaniciTC>
      <TssKod>${tssKod}</TssKod>
      <Sifre>${HttpOfficialProvider.esc(credentials.password)}</Sifre>
      ${musteriXml}
    </${opName}>
  </soap:Body>
</soap:Envelope>`;

    const xmlText = await this.soapCall({ action, bodyXml });
    const sonuc = this.extractSonuc(xmlText);
    if (!sonuc.basarili) {
      throw new Error(`KBS delete failed: ${sonuc.hataKodu ?? 'UNKNOWN'} ${sonuc.mesaj ?? ''}`.trim());
    }
    return { summary: { kbs: 'jandarma', action: opName, sonuc: { hataKodu: sonuc.hataKodu, mesaj: sonuc.mesaj } } };
  }

  async testConnection(credentials: ProviderCredentials): Promise<ProviderTestResponse> {
    // Lowest-risk "connectivity" check: call ParametreListele (no guest payload).
    const userTc = Number(credentials.username);
    const tssKod = Number(credentials.facilityCode);
    if (!Number.isFinite(userTc) || !Number.isFinite(tssKod)) return { ok: false, message: 'KBS credentials must be numeric (username=KullaniciTC, facilityCode=TssKod)' };

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
      const xmlText = await this.soapCall({ action: 'http://tempuri.org/ISrvShsYtkTml/ParametreListele', bodyXml, timeoutMs: 20_000 });
      const sonuc = this.extractSonuc(xmlText);
      if (!sonuc.basarili) return { ok: false, message: `KBS connection failed: ${sonuc.hataKodu ?? 'UNKNOWN'} ${sonuc.mesaj ?? ''}`.trim(), details: sonuc.raw };
      return { ok: true, message: 'KBS connection ok' };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'KBS connection failed' };
    }
  }
}

