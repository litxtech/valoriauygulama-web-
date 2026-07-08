import { Platform } from 'react-native';
import { DEFAULT_PUBLIC_APP_ORIGIN } from '@/constants/appOrigin';

/** Magic link / şifre sıfırlama — web: valoria.tr/auth/callback, native: valoria://auth/callback */
export function getAuthCallbackRedirectUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin.replace(/\/$/, '')}/auth/callback`;
  }
  const base = (process.env.EXPO_PUBLIC_APP_URL ?? DEFAULT_PUBLIC_APP_ORIGIN).replace(/\/$/, '');
  if (Platform.OS === 'web') {
    return `${base}/auth/callback`;
  }
  return 'valoria://auth/callback';
}

/** Oturum callback URL'si (hash ile token) — web'de adres çubuğundan okunur. */
export function readAuthCallbackUrl(): string | null {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const href = window.location.href;
    return href.includes('auth/callback') ? href : null;
  }
  return null;
}
