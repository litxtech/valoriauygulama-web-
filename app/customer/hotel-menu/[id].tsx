import { useLocalSearchParams } from 'expo-router';
import { HotelKitchenMenuDetail } from '@/components/hotelKitchenMenu/HotelKitchenMenuDetail';

export default function CustomerHotelMenuDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <HotelKitchenMenuDetail itemId={id} mode="guest" />;
}
