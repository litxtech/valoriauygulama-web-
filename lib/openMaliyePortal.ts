import { router } from 'expo-router';
import { Platform } from 'react-native';
import { FIXED_MALIYE_QR_TOKEN } from '@/constants/maliyeQr';
import { buildPublicMaliyeDocumentUrl } from '@/lib/maliyePortalUrl';

/** Maliye portalını statik HTML olarak açar (Expo SPA / ham kaynak metni önlenir). */
export function openPublicMaliyePortal(token?: string): void {
  const t = (token?.trim() || FIXED_MALIYE_QR_TOKEN).trim();
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.replace(buildPublicMaliyeDocumentUrl(t, { bustCache: true }));
    return;
  }
  router.push({ pathname: '/maliye', params: { token: t } });
}
