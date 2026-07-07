// Mobil uygulamadan (lib/scanner/mrzIssuingLabel.ts) birebir port.

const ICAO3_TR: Record<string, string> = {
  TUR: 'Türkiye',
  DEU: 'Almanya',
  FRA: 'Fransa',
  GBR: 'Birleşik Krallık',
  USA: 'ABD',
  ITA: 'İtalya',
  ESP: 'İspanya',
  NLD: 'Hollanda',
  BEL: 'Belçika',
  AUT: 'Avusturya',
  CHE: 'İsviçre',
  SWE: 'İsveç',
  NOR: 'Norveç',
  DNK: 'Danimarka',
  FIN: 'Finlandiya',
  POL: 'Polonya',
  UKR: 'Ukrayna',
  RUS: 'Rusya',
  IRN: 'İran',
  IRQ: 'Irak',
  SYR: 'Suriye',
  AFG: 'Afganistan',
  PAK: 'Pakistan',
  IND: 'Hindistan',
  CHN: 'Çin',
  JPN: 'Japonya',
  KOR: 'Kore',
  ARE: 'BAE',
  SAU: 'Suudi Arabistan',
  EGY: 'Mısır',
  GRC: 'Yunanistan',
  BGR: 'Bulgaristan',
  ROU: 'Romanya',
  SRB: 'Sırbistan',
  XKX: 'Kosova',
  UNO: 'BM / belirsiz',
  UTO: 'Utopia (örnek kod)',
};

export function formatIcao3ForTr(code: string | null | undefined): string {
  if (!code || !String(code).trim()) return '—';
  const c = String(code).trim().toUpperCase();
  const label = ICAO3_TR[c];
  return label ? `${c} — ${label}` : c;
}
