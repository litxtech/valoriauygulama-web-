import { Platform, Linking } from 'react-native';
import { VALORIA_GOOGLE_PLAY_URL, valoriaAppStoreUrl } from '@/constants/appStoreLinks';

/** Web UA'dan mağaza URL'si — Android Play, Apple App Store, diğer null (ikisini de göster) */
export function detectWebStoreUrl(lang?: string | null): {
  url: string | null;
  platform: 'android' | 'ios' | 'other';
} {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') {
    return { url: null, platform: 'other' };
  }
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) {
    return { url: VALORIA_GOOGLE_PLAY_URL, platform: 'android' };
  }
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return { url: valoriaAppStoreUrl(lang), platform: 'ios' };
  }
  // iPadOS 13+ desktop UA
  if (navigator.platform === 'MacIntel' && (navigator as { maxTouchPoints?: number }).maxTouchPoints! > 1) {
    return { url: valoriaAppStoreUrl(lang), platform: 'ios' };
  }
  return { url: null, platform: 'other' };
}

/** Pazarlık sonrası web'de mağazaya yönlendir (mümkünse otomatik) */
export async function redirectWebToAppStore(lang?: string | null): Promise<'android' | 'ios' | 'other'> {
  const { url, platform } = detectWebStoreUrl(lang);
  if (url && typeof window !== 'undefined') {
    // Kısa gecikme: kullanıcı success ekranını görsün
    setTimeout(() => {
      window.location.href = url;
    }, 900);
    return platform;
  }
  return 'other';
}

export async function openStoreUrl(url: string): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.href = url;
    return;
  }
  const can = await Linking.canOpenURL(url);
  if (can) await Linking.openURL(url);
}
