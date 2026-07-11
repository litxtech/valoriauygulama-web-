/** 11 haneli T.C. kimlik no — sadece rakam. */
export function normalizeTcInput(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 11);
}

function mod10(value: number): number {
  return ((value % 10) + 10) % 10;
}

/** Manuel giriş — 11 hane, ilk rakam 0 değil. */
export function isTcFormatValid(tc: string): boolean {
  return /^[1-9]\d{10}$/.test(tc);
}

/** Algoritma doğrulaması (checksum). */
export function isValidTurkishTc(tc: string): boolean {
  if (!isTcFormatValid(tc)) return false;
  const d = tc.split('').map(Number);
  const odd = d[0]! + d[2]! + d[4]! + d[6]! + d[8]!;
  const even = d[1]! + d[3]! + d[5]! + d[7]!;
  const digit10 = mod10(odd * 7 - even);
  if (digit10 !== d[9]) return false;
  const digit11 = mod10(odd + even + d[9]!);
  return digit11 === d[10];
}

/** Kimlik çekim ekranı — format yeterli; checksum zorunlu değil. */
export function isTcManualEntryAcceptable(tc: string): boolean {
  return isTcFormatValid(tc);
}
