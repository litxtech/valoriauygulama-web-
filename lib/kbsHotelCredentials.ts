/** Jandarma KBS web servisi — otel başına tesis kodu + şifre + kullanıcı TC. */

/** Bu otel için KBS’den verilen tesis kodu (TssKod) — admin formunda boşsa öneri olarak gösterilir. */
export const KBS_DEFAULT_FACILITY_CODE = '255579';

export function normalizeKbsFacilityCode(raw: string): string {
  return raw.trim().replace(/\s+/g, '');
}

export function isValidKbsFacilityCode(code: string): boolean {
  const c = normalizeKbsFacilityCode(code);
  return /^\d{1,12}$/.test(c);
}

export function normalizeKbsKullaniciTc(raw: string): string {
  return raw.trim().replace(/\D/g, '');
}

export function isValidKbsKullaniciTc(tc: string): boolean {
  const d = normalizeKbsKullaniciTc(tc);
  return d.length === 11;
}

export type KbsCredentialsFormValues = {
  facilityCode: string;
  kullaniciTc: string;
  password?: string;
  apiKey?: string;
  providerType: string;
  isActive: boolean;
};

export function kbsCredentialsToApiPayload(values: KbsCredentialsFormValues): {
  facilityCode: string;
  username: string;
  password?: string;
  apiKey?: string;
  providerType: string;
  isActive: boolean;
} {
  const payload: ReturnType<typeof kbsCredentialsToApiPayload> = {
    facilityCode: normalizeKbsFacilityCode(values.facilityCode),
    username: normalizeKbsKullaniciTc(values.kullaniciTc),
    providerType: values.providerType || 'default',
    isActive: values.isActive,
  };
  if (values.password?.trim()) payload.password = values.password.trim();
  if (values.apiKey?.trim()) payload.apiKey = values.apiKey.trim();
  return payload;
}
