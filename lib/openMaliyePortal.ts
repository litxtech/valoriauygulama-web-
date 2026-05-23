import { Linking, Platform } from 'react-native';
import { buildPublicMaliyeWebUrl } from '@/lib/maliyePortalUrl';

/** Maliye denetim portalını tam sayfa açar (Expo SPA içinde ham HTML göstermez). */
export function openPublicMaliyePortal(token?: string): void {
  const url = buildPublicMaliyeWebUrl(token);
  if (!url) return;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.assign(url);
    return;
  }
  void Linking.openURL(url);
}
