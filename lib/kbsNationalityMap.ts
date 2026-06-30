/** Uyruk metni → ICAO-3; kişi adı sanılmasın diye sıkı eşleme. */
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
  AZE: 'Azerbaycan',
  GEO: 'Gürcistan',
  KAZ: 'Kazakistan',
  UZB: 'Özbekistan',
  TKM: 'Türkmenistan',
  LBN: 'Lübnan',
  JOR: 'Ürdün',
  ISR: 'İsrail',
  PSE: 'Filistin',
  LBY: 'Libya',
  TUN: 'Tunus',
  DZA: 'Cezayir',
  MAR: 'Fas',
  SDN: 'Sudan',
  ETH: 'Etiyopya',
  SOM: 'Somali',
  NGA: 'Nijerya',
  ZAF: 'G.Afrika',
  BRA: 'Brezilya',
  ARG: 'Arjantin',
  MEX: 'Meksika',
  CAN: 'Kanada',
  AUS: 'Avustralya',
};

const NAME_TO_ICAO: Record<string, string> = {
  TURKIYE: 'TUR',
  TURKEY: 'TUR',
  TURK: 'TUR',
  TC: 'TUR',
  ALMANYA: 'DEU',
  GERMANY: 'DEU',
  DEUTSCHLAND: 'DEU',
  FRANSA: 'FRA',
  FRANCE: 'FRA',
  ITALYA: 'ITA',
  ITALY: 'ITA',
  ISPANYA: 'ESP',
  SPAIN: 'ESP',
  HOLLANDA: 'NLD',
  NETHERLANDS: 'NLD',
  BELCIKA: 'BEL',
  BELGIUM: 'BEL',
  AVUSTURYA: 'AUT',
  AUSTRIA: 'AUT',
  ISVICRE: 'CHE',
  SWITZERLAND: 'CHE',
  RUSYA: 'RUS',
  RUSSIA: 'RUS',
  UKRAYNA: 'UKR',
  UKRAINE: 'UKR',
  IRAN: 'IRN',
  IRAK: 'IRQ',
  IRAQ: 'IRQ',
  SURİYE: 'SYR',
  SURYE: 'SYR',
  SYRIA: 'SYR',
  AFGANISTAN: 'AFG',
  PAKISTAN: 'PAK',
  HINDISTAN: 'IND',
  INDIA: 'IND',
  CIN: 'CHN',
  CHINA: 'CHN',
  JAPONYA: 'JPN',
  JAPAN: 'JPN',
  MISIR: 'EGY',
  EGYPT: 'EGY',
  YUNANISTAN: 'GRC',
  GREECE: 'GRC',
  BULGARISTAN: 'BGR',
  BULGARIA: 'BGR',
  ROMANYA: 'ROU',
  ROMANIA: 'ROU',
  AZERBAYCAN: 'AZE',
  AZERBAIJAN: 'AZE',
  GURCISTAN: 'GEO',
  GEORGIA: 'GEO',
  KAZAKISTAN: 'KAZ',
  OZBEKISTAN: 'UZB',
  UNITEDKINGDOM: 'GBR',
  ENGLAND: 'GBR',
  AMERICA: 'USA',
  UNITEDSTATES: 'USA',
};

const ICAO3_SET = new Set(Object.keys(ICAO3_TR));

function foldTr(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Z0-9]/g, '');
}

export function isKnownIcao3(code: string | null | undefined): boolean {
  const c = (code ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) && ICAO3_SET.has(c);
}

export function isNationalityLikeText(raw: string | null | undefined): boolean {
  const t = (raw ?? '').trim();
  if (!t) return false;
  const up = t.toUpperCase();
  if (/^[A-Z]{3}$/.test(up) && ICAO3_SET.has(up)) return true;
  const folded = foldTr(t);
  if (NAME_TO_ICAO[folded]) return true;
  if (/^(?:TURKIYE|TURKEY|CUMHURIYET|REPUBLIC|UYRUK|NATIONALITY|VATANDAS|VATANDAS)/.test(folded)) return true;
  return false;
}

export function mapNationalityTextToCode(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  const up = t.toUpperCase();
  if (/^[A-Z]{3}$/.test(up) && ICAO3_SET.has(up)) return up;
  const folded = foldTr(t);
  if (NAME_TO_ICAO[folded]) return NAME_TO_ICAO[folded]!;
  if (/^TC$|^TURK/.test(folded)) return 'TUR';
  return null;
}

export function formatKbsNationalityCode(code: string | null | undefined): string | null {
  if (!code?.trim()) return null;
  const c = code.trim().toUpperCase();
  const label = ICAO3_TR[c];
  return label ? `${c} — ${label}` : c;
}
