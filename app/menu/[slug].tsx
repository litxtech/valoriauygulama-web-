import { useMemo } from 'react';
import { Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { PublicKitchenMenuScreen } from '@/components/hotelKitchenMenu/PublicKitchenMenuScreen';
import { parsePublicMenuSlugFromLocation } from '@/lib/publicWebRoute';

function readParamSlug(raw: string | string[] | undefined): string {
  if (typeof raw === 'string') return raw.trim().toLowerCase();
  if (Array.isArray(raw)) return (raw[0] ?? '').trim().toLowerCase();
  return '';
}

export default function PublicMenuBySlugScreen() {
  const { slug } = useLocalSearchParams<{ slug: string | string[] }>();

  const orgSlug = useMemo(() => {
    const fromParams = readParamSlug(slug);
    if (fromParams) return fromParams;
    if (Platform.OS !== 'web' || typeof window === 'undefined') return '';
    return parsePublicMenuSlugFromLocation(window.location.pathname, window.location.search);
  }, [slug]);

  return <PublicKitchenMenuScreen orgSlug={orgSlug} />;
}
