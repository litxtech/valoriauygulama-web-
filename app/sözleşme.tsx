import { Redirect, useLocalSearchParams } from 'expo-router';

/** Eski QR: /sözleşme → /sozlesme (ASCII) */
export default function SozlesmeTrPublicAliasScreen() {
  const params = useLocalSearchParams<{ t?: string; token?: string; l?: string; lang?: string }>();
  const t = (typeof params.t === 'string' ? params.t : params.token) ?? '';
  const l =
    (typeof params.l === 'string' ? params.l : typeof params.lang === 'string' ? params.lang : '') || 'tr';
  return <Redirect href={{ pathname: '/sozlesme', params: { t, l } }} />;
}
