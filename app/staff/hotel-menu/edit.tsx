import { useLocalSearchParams } from 'expo-router';
import { HotelKitchenMenuEditor } from '@/components/hotelKitchenMenu/HotelKitchenMenuEditor';
import { useLayoutEffect } from 'react';
import { useNavigation } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StaffStackBackButton } from '@/lib/staffStackBack';
import { useAuthStore } from '@/stores/authStore';
import { canManageHotelKitchenMenu } from '@/lib/staffPermissions';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

export default function StaffHotelMenuEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const staff = useAuthStore((s) => s.staff);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: id ? t('hotelKitchenMenuEditTitle') : t('hotelKitchenMenuNewTitle'),
      headerLeft: () => (
        <StaffStackBackButton accessibilityLabel={t('back')} fallback="/staff/hotel-menu/manage" />
      ),
    });
  }, [navigation, id, t]);

  if (!canManageHotelKitchenMenu(staff)) {
    return (
      <View style={styles.centered}>
        <Text style={styles.denied}>{t('hotelKitchenMenuNoPermissionMessage')}</Text>
      </View>
    );
  }

  return <HotelKitchenMenuEditor itemId={id} backFallback="/staff/hotel-menu/manage" />;
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', padding: 24 },
  denied: { textAlign: 'center', color: theme.colors.textSecondary },
});
