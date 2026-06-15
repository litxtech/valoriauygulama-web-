import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PremiumColorScheme } from '@/constants/premiumTheme';

const STORAGE_KEY = 'valoria_premium_color_scheme_v1';

export async function loadPremiumColorScheme(): Promise<PremiumColorScheme | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'night') return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export async function savePremiumColorScheme(scheme: PremiumColorScheme): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, scheme);
  } catch {
    /* ignore */
  }
}
