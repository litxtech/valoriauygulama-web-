import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AdminStackBackButton, adminStackGestureForNavigation } from '@/lib/adminStackBack';

export default function ManagedContractsLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={({ navigation }) => ({
        ...adminStackGestureForNavigation(navigation),
        headerShown: true,
        headerStyle: { backgroundColor: '#fff' },
        headerTintColor: '#1a202c',
        headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        headerBackVisible: false,
        headerLeft: () => <AdminStackBackButton tintColor="#1a202c" accessibilityLabel={t('back')} />,
      })}
    >
      <Stack.Screen name="index" options={{ title: 'Sözleşme Yönetimi' }} />
      <Stack.Screen name="list" options={{ title: 'Sözleşmeler' }} />
      <Stack.Screen name="new" options={{ title: 'Yeni sözleşme' }} />
      <Stack.Screen name="edit" options={{ title: 'Sözleşmeyi düzenle' }} />
      <Stack.Screen name="[id]" options={{ title: 'Sözleşme detayı' }} />
    </Stack>
  );
}
