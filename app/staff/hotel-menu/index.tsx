import { HotelKitchenMenuBrowse } from '@/components/hotelKitchenMenu/HotelKitchenMenuBrowse';
import { useAuthStore } from '@/stores/authStore';
import { canManageHotelKitchenMenu } from '@/lib/staffPermissions';

export default function StaffHotelMenuScreen() {
  const staff = useAuthStore((s) => s.staff);
  const canManage = canManageHotelKitchenMenu(staff);

  return (
    <HotelKitchenMenuBrowse
      mode="staff"
      detailHref={(id) => `/staff/hotel-menu/${id}`}
      showManage={canManage}
      showPublicQr
      manageHref="/staff/hotel-menu/manage"
    />
  );
}
