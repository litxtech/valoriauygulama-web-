const MRZ_LINE_CANDIDATE_MIN = 18;
const MRZ_LINE_CANDIDATE_MAX = 60;

/**
 * Hızlı, ucuz aşama: tüm belge türlü/parse/işe almadan önce
 * MRZ'ye benzer (uzun, çok < karakterli) satırlar var mı.
 * Sadece kamera "bekçi" modu ile "kilit" modu arasında geçiş sinyali için.
 */
export function ocrLinesLookLikeMrz(lines: string[] | null | undefined): boolean {
  if (!lines || lines.length < 1) return false;
  for (const raw of lines) {
    const t = (raw ?? '')
      .replace(/[\r\n\u2028\u2029]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/0/g, 'O')
      .replace(/1/g, 'I')
      .toUpperCase()
      .trim();
    if (t.length < MRZ_LINE_CANDIDATE_MIN) continue;
    if (t.length > MRZ_LINE_CANDIDATE_MAX) {
      if ((t.split('<').length - 1) >= 3) return true;
      continue;
    }
    const chevrons = (t.match(/</g) ?? []).length;
    if (chevrons < 2) continue;
    const alnum = t.replace(/</g, '').replace(/\s/g, '');
    if (alnum.length < 12) continue;
    return true;
  }
  return false;
}
