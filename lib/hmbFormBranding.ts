/**
 * Günlük müşteri listesi (VUK Md. 240) PDF üst bilgisi — cihazda saklanır, kod varsayılanlarını override eder.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HMB_HOTEL_INFO } from '@/constants/hmbHotel';

const STORAGE_KEY = 'hmb_daily_list_branding_v1';

export type HmbFormBranding = {
  /** Ticari ünvan / şirket satırı (sol üst) */
  legalCompanyName: string;
  /** İkinci satır: faaliyet alanı vb. */
  businessActivities: string;
  address: string;
  phone: string;
  fax: string;
  provinceCode: string;
  defaultSeri: string;
  footerPrinterLine: string;
  /** data:image/...;base64,... veya null */
  logoDataUrl: string | null;
  /** Maliye mührü — null ise gömülü SVG kullanılır */
  ministrySealDataUrl: string | null;
};

export const DEFAULT_HMB_FORM_BRANDING: HmbFormBranding = {
  legalCompanyName: HMB_HOTEL_INFO.title,
  businessActivities: '',
  address: HMB_HOTEL_INFO.address,
  phone: HMB_HOTEL_INFO.phone,
  fax: '',
  provinceCode: '34',
  defaultSeri: 'A',
  footerPrinterLine: '',
  logoDataUrl: null,
  ministrySealDataUrl: null,
};

export type HmbFormMeta = {
  /** Form üzerindeki tarih (örn. 19.04.2026) */
  listDate: string;
  seri: string;
  sira: string;
  arrivalDate: string;
  departureDate: string;
  block: string;
};

export function mergeHmbBranding(partial: Partial<HmbFormBranding> | null): HmbFormBranding {
  return { ...DEFAULT_HMB_FORM_BRANDING, ...(partial ?? {}) };
}

export async function loadHmbFormBranding(): Promise<HmbFormBranding> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_HMB_FORM_BRANDING };
    const parsed = JSON.parse(raw) as Partial<HmbFormBranding>;
    return mergeHmbBranding(parsed);
  } catch {
    return { ...DEFAULT_HMB_FORM_BRANDING };
  }
}

export async function saveHmbFormBranding(b: HmbFormBranding): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(b));
  try {
    const { supabase } = await import('@/lib/supabase');
    await supabase.from('app_settings').upsert(
      { key: 'hmb_form_branding', value: b as unknown as Record<string, unknown>, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
  } catch {
    /* Maliye portal varsayılanları kullanır */
  }
}
