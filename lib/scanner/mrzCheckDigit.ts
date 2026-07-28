/** ICAO 9303 MRZ check digit (ağırlık 7-3-1). */

function mrzCharValue(c: string): number {
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
  if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 55;
  if (c === '<') return 0;
  return -1;
}

/** Verilen alanın check digit'i (0–9). Geçersiz karakterde -1. */
export function mrzComputeCheckDigit(data: string): number {
  const weights = [7, 3, 1] as const;
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = mrzCharValue(data[i]!.toUpperCase());
    if (v < 0) return -1;
    sum += v * weights[i % 3]!;
  }
  return sum % 10;
}

export function mrzCheckDigitMatches(data: string, checkChar: string): boolean {
  if (!/^[0-9]$/.test(checkChar)) return false;
  const expected = mrzComputeCheckDigit(data);
  if (expected < 0) return false;
  return expected === Number(checkChar);
}
