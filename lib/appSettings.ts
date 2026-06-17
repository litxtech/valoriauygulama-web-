/** app_settings.value (jsonb) → düz metin */
export function appSettingToString(raw: unknown): string {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'boolean') return raw ? '1' : '0';
  if (typeof raw === 'number') return String(raw);
  try {
    const parsed = JSON.parse(String(raw));
    if (typeof parsed === 'string') return parsed.trim();
  } catch {
    // jsonb primitive
  }
  return String(raw).replace(/^"|"$/g, '').trim();
}

export function appSettingsRowsToMap(rows: { key: string; value: unknown }[] | null | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  (rows ?? []).forEach((r) => {
    const v = appSettingToString(r.value);
    if (v) map[r.key] = v;
  });
  return map;
}
