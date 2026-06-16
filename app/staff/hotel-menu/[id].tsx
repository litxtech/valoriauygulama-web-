import { Redirect, useLocalSearchParams } from 'expo-router';
import { HotelKitchenMenuDetail } from '@/components/hotelKitchenMenu/HotelKitchenMenuDetail';

const RESERVED_ROUTES: Record<string, string> = {
  theme: '/staff/fnb-hub/menu-theme',
  manage: '/staff/hotel-menu/manage',
  edit: '/staff/hotel-menu/edit',
};

export default function StaffHotelMenuDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const key = (id ?? '').trim().toLowerCase();
  if (!key) return null;
  const redirect = RESERVED_ROUTES[key];
  if (redirect) return <Redirect href={redirect} />;
  return <HotelKitchenMenuDetail itemId={id!} mode="staff" />;
}
