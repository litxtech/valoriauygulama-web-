/** TD1/TD3 satır 1: P<SAU / I<KWT — veren ülke ICAO-3 */
export function extractIssuingCountryFromMrz(rawMrz: string | null | undefined): string | null {
  const line1 = (rawMrz ?? '').replace(/\r/g, '\n').split('\n')[0]?.trim().toUpperCase() ?? '';
  if (!line1) return null;
  const m = line1.match(/^[IPAVC]<?([A-Z]{3})/);
  return m?.[1] ?? null;
}
