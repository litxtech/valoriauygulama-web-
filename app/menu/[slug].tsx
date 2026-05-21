import { useLocalSearchParams } from 'expo-router';
import { PublicKitchenMenuScreen } from '@/components/hotelKitchenMenu/PublicKitchenMenuScreen';

export default function PublicMenuBySlugScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const s = typeof slug === 'string' ? slug : Array.isArray(slug) ? slug[0] : '';
  return <PublicKitchenMenuScreen orgSlug={s ?? ''} />;
}
