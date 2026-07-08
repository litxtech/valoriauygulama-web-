/**
 * WhatsApp / telefon için ülke kodları (çekmeceli seçim).
 * Sıralama: Türkiye önce, sonra yaygın ülkeler, alfabetik.
 */
export type CountryCode = { dial: string; name: string; code: string };

export const COUNTRY_PHONE_CODES: CountryCode[] = [
  { dial: '+90', name: 'Türkiye', code: 'TR' },
  { dial: '+1', name: 'ABD / Kanada', code: 'US' },
  { dial: '+44', name: 'Birleşik Krallık', code: 'GB' },
  { dial: '+49', name: 'Almanya', code: 'DE' },
  { dial: '+33', name: 'Fransa', code: 'FR' },
  { dial: '+39', name: 'İtalya', code: 'IT' },
  { dial: '+34', name: 'İspanya', code: 'ES' },
  { dial: '+31', name: 'Hollanda', code: 'NL' },
  { dial: '+32', name: 'Belçika', code: 'BE' },
  { dial: '+43', name: 'Avusturya', code: 'AT' },
  { dial: '+41', name: 'İsviçre', code: 'CH' },
  { dial: '+7', name: 'Rusya / KZ', code: 'RU' },
  { dial: '+380', name: 'Ukrayna', code: 'UA' },
  { dial: '+48', name: 'Polonya', code: 'PL' },
  { dial: '+40', name: 'Romanya', code: 'RO' },
  { dial: '+30', name: 'Yunanistan', code: 'GR' },
  { dial: '+351', name: 'Portekiz', code: 'PT' },
  { dial: '+46', name: 'İsveç', code: 'SE' },
  { dial: '+47', name: 'Norveç', code: 'NO' },
  { dial: '+45', name: 'Danimarka', code: 'DK' },
  { dial: '+358', name: 'Finlandiya', code: 'FI' },
  { dial: '+353', name: 'İrlanda', code: 'IE' },
  { dial: '+972', name: 'İsrail', code: 'IL' },
  { dial: '+971', name: 'BAE', code: 'AE' },
  { dial: '+966', name: 'Suudi Arabistan', code: 'SA' },
  { dial: '+965', name: 'Kuveyt', code: 'KW' },
  { dial: '+973', name: 'Bahreyn', code: 'BH' },
  { dial: '+974', name: 'Katar', code: 'QA' },
  { dial: '+968', name: 'Umman', code: 'OM' },
  { dial: '+20', name: 'Mısır', code: 'EG' },
  { dial: '+213', name: 'Cezayir', code: 'DZ' },
  { dial: '+212', name: 'Fas', code: 'MA' },
  { dial: '+216', name: 'Tunus', code: 'TN' },
  { dial: '+964', name: 'Irak', code: 'IQ' },
  { dial: '+98', name: 'İran', code: 'IR' },
  { dial: '+994', name: 'Azerbaycan', code: 'AZ' },
  { dial: '+995', name: 'Gürcistan', code: 'GE' },
  { dial: '+374', name: 'Ermenistan', code: 'AM' },
  { dial: '+993', name: 'Türkmenistan', code: 'TM' },
  { dial: '+998', name: 'Özbekistan', code: 'UZ' },
  { dial: '+996', name: 'Kırgızistan', code: 'KG' },
  { dial: '+992', name: 'Tacikistan', code: 'TJ' },
  { dial: '+62', name: 'Endonezya', code: 'ID' },
  { dial: '+60', name: 'Malezya', code: 'MY' },
  { dial: '+66', name: 'Tayland', code: 'TH' },
  { dial: '+84', name: 'Vietnam', code: 'VN' },
  { dial: '+81', name: 'Japonya', code: 'JP' },
  { dial: '+82', name: 'Güney Kore', code: 'KR' },
  { dial: '+86', name: 'Çin', code: 'CN' },
  { dial: '+91', name: 'Hindistan', code: 'IN' },
  { dial: '+92', name: 'Pakistan', code: 'PK' },
  { dial: '+880', name: 'Bangladeş', code: 'BD' },
  { dial: '+61', name: 'Avustralya', code: 'AU' },
  { dial: '+64', name: 'Yeni Zelanda', code: 'NZ' },
  { dial: '+27', name: 'Güney Afrika', code: 'ZA' },
  { dial: '+234', name: 'Nijerya', code: 'NG' },
  { dial: '+254', name: 'Kenya', code: 'KE' },
  { dial: '+20', name: 'Mısır', code: 'EG' },
  { dial: '+55', name: 'Brezilya', code: 'BR' },
  { dial: '+54', name: 'Arjantin', code: 'AR' },
  { dial: '+52', name: 'Meksika', code: 'MX' },
  { dial: '+57', name: 'Kolombiya', code: 'CO' },
  { dial: '+56', name: 'Şili', code: 'CL' },
  { dial: '+51', name: 'Peru', code: 'PE' },
  { dial: '+58', name: 'Venezuela', code: 'VE' },
  { dial: '+593', name: 'Ekvador', code: 'EC' },
  { dial: '+598', name: 'Uruguay', code: 'UY' },
  { dial: '+595', name: 'Paraguay', code: 'PY' },
  { dial: '+591', name: 'Bolivya', code: 'BO' },
  { dial: '+506', name: 'Kosta Rika', code: 'CR' },
  { dial: '+507', name: 'Panama', code: 'PA' },
  { dial: '+502', name: 'Guatemala', code: 'GT' },
  { dial: '+53', name: 'Küba', code: 'CU' },
  { dial: '+1-809', name: 'Dominik Cum.', code: 'DO' },
  { dial: '+962', name: 'Ürdün', code: 'JO' },
  { dial: '+961', name: 'Lübnan', code: 'LB' },
  { dial: '+963', name: 'Suriye', code: 'SY' },
  { dial: '+970', name: 'Filistin', code: 'PS' },
  { dial: '+966', name: 'Suudi Arabistan', code: 'SA' },
  { dial: '+218', name: 'Libya', code: 'LY' },
  { dial: '+249', name: 'Sudan', code: 'SD' },
  { dial: '+255', name: 'Tanzanya', code: 'TZ' },
  { dial: '+256', name: 'Uganda', code: 'UG' },
  { dial: '+233', name: 'Gana', code: 'GH' },
  { dial: '+237', name: 'Kamerun', code: 'CM' },
  { dial: '+212', name: 'Fas', code: 'MA' },
  { dial: '+213', name: 'Cezayir', code: 'DZ' },
  { dial: '+381', name: 'Sırbistan', code: 'RS' },
  { dial: '+385', name: 'Hırvatistan', code: 'HR' },
  { dial: '+386', name: 'Slovenya', code: 'SI' },
  { dial: '+420', name: 'Çekya', code: 'CZ' },
  { dial: '+421', name: 'Slovakya', code: 'SK' },
  { dial: '+36', name: 'Macaristan', code: 'HU' },
  { dial: '+359', name: 'Bulgaristan', code: 'BG' },
  { dial: '+355', name: 'Arnavutluk', code: 'AL' },
  { dial: '+389', name: 'Kuzey Makedonya', code: 'MK' },
  { dial: '+387', name: 'Bosna Hersek', code: 'BA' },
  { dial: '+382', name: 'Karadağ', code: 'ME' },
  { dial: '+383', name: 'Kosova', code: 'XK' },
  { dial: '+370', name: 'Litvanya', code: 'LT' },
  { dial: '+371', name: 'Letonya', code: 'LV' },
  { dial: '+372', name: 'Estonya', code: 'EE' },
  { dial: '+353', name: 'İrlanda', code: 'IE' },
  { dial: '+354', name: 'İzlanda', code: 'IS' },
  { dial: '+356', name: 'Malta', code: 'MT' },
  { dial: '+357', name: 'Kıbrıs', code: 'CY' },
  { dial: '+375', name: 'Belarus', code: 'BY' },
  { dial: '+373', name: 'Moldova', code: 'MD' },
  { dial: '+998', name: 'Özbekistan', code: 'UZ' },
  { dial: '+976', name: 'Moğolistan', code: 'MN' },
  { dial: '+855', name: 'Kamboçya', code: 'KH' },
  { dial: '+95', name: 'Myanmar', code: 'MM' },
  { dial: '+63', name: 'Filipinler', code: 'PH' },
  { dial: '+65', name: 'Singapur', code: 'SG' },
  { dial: '+673', name: 'Brunei', code: 'BN' },
  { dial: '+670', name: 'Doğu Timor', code: 'TL' },
  { dial: '+689', name: 'Fransız Polinezyası', code: 'PF' },
  { dial: '+687', name: 'Yeni Kaledonya', code: 'NC' },
  { dial: '+686', name: 'Kiribati', code: 'KI' },
  { dial: '+679', name: 'Fiji', code: 'FJ' },
  { dial: '+685', name: 'Samoa', code: 'WS' },
  { dial: '+688', name: 'Tuvalu', code: 'TV' },
  { dial: '+690', name: 'Tokelau', code: 'TK' },
  { dial: '+691', name: 'Mikronezya', code: 'FM' },
  { dial: '+692', name: 'Marshall Adaları', code: 'MH' },
  { dial: '+850', name: 'Kuzey Kore', code: 'KP' },
  { dial: '+886', name: 'Tayvan', code: 'TW' },
  { dial: '+852', name: 'Hong Kong', code: 'HK' },
  { dial: '+853', name: 'Makao', code: 'MO' },
  { dial: '+673', name: 'Brunei', code: 'BN' },
  { dial: '+95', name: 'Myanmar', code: 'MM' },
  { dial: '+856', name: 'Laos', code: 'LA' },
  { dial: '+673', name: 'Brunei', code: 'BN' },
];

// Benzersiz dial kodları (ilk görülen ülke adı ile)
const byDial = new Map<string, CountryCode>();
COUNTRY_PHONE_CODES.forEach((c) => {
  if (!byDial.has(c.dial)) byDial.set(c.dial, c);
});
export const UNIQUE_DIAL_CODES: CountryCode[] = Array.from(byDial.values());

/**
 * ISO 3166-1 alpha-3 (MRZ / kimlik uyruk-veren ülke kodu) → uluslararası arama kodu (+ yok).
 * Körfez ve yaygın ülkeler önceliklidir; listede olmayan ülke için varsayılan uygulanır.
 */
export const ISO3_DIAL_CODES: Record<string, string> = {
  TUR: '90',
  // Körfez / Orta Doğu
  SAU: '966', KWT: '965', QAT: '974', ARE: '971', BHR: '973', OMN: '968',
  IRQ: '964', IRN: '98', JOR: '962', LBN: '961', SYR: '963', PSE: '970', YEM: '967', ISR: '972',
  // Kuzey Afrika
  EGY: '20', LBY: '218', SDN: '249', DZA: '213', MAR: '212', TUN: '216', MRT: '222',
  // Avrupa
  GBR: '44', DEU: '49', FRA: '33', ITA: '39', ESP: '34', NLD: '31', BEL: '32', AUT: '43',
  CHE: '41', PRT: '351', SWE: '46', NOR: '47', DNK: '45', FIN: '358', IRL: '353', ISL: '354',
  GRC: '30', POL: '48', ROU: '40', HUN: '36', CZE: '420', SVK: '421', BGR: '359', HRV: '385',
  SVN: '386', SRB: '381', BIH: '387', MKD: '389', ALB: '355', MNE: '382', XKX: '383', UNK: '383',
  LTU: '370', LVA: '371', EST: '372', MLT: '356', CYP: '357', LUX: '352', MCO: '377',
  UKR: '380', BLR: '375', MDA: '373', RUS: '7',
  // Kafkasya / Orta Asya
  AZE: '994', GEO: '995', ARM: '374', KAZ: '7', TKM: '993', UZB: '998', KGZ: '996', TJK: '992', MNG: '976',
  // Amerika
  USA: '1', CAN: '1', MEX: '52', BRA: '55', ARG: '54', CHL: '56', COL: '57', PER: '51',
  VEN: '58', ECU: '593', URY: '598', PRY: '595', BOL: '591', CRI: '506', PAN: '507', GTM: '502',
  CUB: '53', DOM: '1',
  // Asya
  CHN: '86', JPN: '81', KOR: '82', PRK: '850', TWN: '886', HKG: '852', MAC: '853', IND: '91',
  PAK: '92', BGD: '880', LKA: '94', NPL: '977', IDN: '62', MYS: '60', THA: '66', VNM: '84',
  PHL: '63', SGP: '65', KHM: '855', MMR: '95', LAO: '856', BRN: '673', TLS: '670',
  // Okyanusya
  AUS: '61', NZL: '64',
  // Afrika (yaygın)
  ZAF: '27', NGA: '234', KEN: '254', TZA: '255', UGA: '256', GHA: '233', CMR: '237',
  ETH: '251', SEN: '221', CIV: '225',
};

/** Ülke kodundan (alpha-3 veya alpha-2) uluslararası arama kodunu (+ yok) döndürür. */
export function dialCodeForCountry(code?: string | null): string | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  if (c.length === 3) return ISO3_DIAL_CODES[c] ?? null;
  if (c.length === 2) {
    const found = COUNTRY_PHONE_CODES.find((x) => x.code === c);
    return found ? found.dial.replace(/\D/g, '') : null;
  }
  return null;
}

/**
 * Serbest girilmiş numarayı WhatsApp/wa.me için uluslararası formata (yalnız rakam) çevirir.
 * - `+90…` / `0090…` → zaten uluslararası, olduğu gibi.
 * - Baş `0` (yerel) → misafirin belge ülkesinin kodu eklenir (bilinmiyorsa varsayılan).
 * - Baş `0` yok → ülke koduyla başlamıyorsa kod eklenir (Körfez'de yerel numaralar 0'sız yazılır).
 */
export function toInternationalPhoneNumber(
  raw: string | null | undefined,
  countryCode?: string | null,
  fallbackDial = '90'
): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (trimmed.startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.slice(2);
  const cc = dialCodeForCountry(countryCode) ?? fallbackDial;
  if (digits.startsWith('0')) return `${cc}${digits.slice(1)}`;
  if (cc && !digits.startsWith(cc)) return `${cc}${digits}`;
  return digits;
}
