import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

/** Statik rotalar ([id] dinamik rotasından önce eşleşsin). */
export default function StaffHotelMenuLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: t('screenHotelKitchenMenu'), headerBackTitle: t('back') }} />
      <Stack.Screen name="manage" options={{ title: t('hotelKitchenMenuManageTitle'), headerBackTitle: t('back') }} />
      <Stack.Screen name="edit" options={{ headerBackTitle: t('back') }} />
      <Stack.Screen name="theme" options={{ title: t('hotelKitchenMenuThemeTitle'), headerBackTitle: t('back') }} />
      <Stack.Screen name="[id]" options={{ title: t('screenHotelKitchenMenu'), headerBackTitle: t('back') }} />
    </Stack>
  );
}
