import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AdminStackBackButton, adminStackGestureForNavigation } from '@/lib/adminStackBack';

export default function DepartmentRulesLayout() {
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
      <Stack.Screen name="index" options={{ title: 'Bölüm Kuralları' }} />
      <Stack.Screen name="list" options={{ title: 'Kurallar' }} />
      <Stack.Screen name="new" options={{ title: 'Yeni kural' }} />
      <Stack.Screen name="[id]" options={{ title: 'Kural detayı' }} />
      <Stack.Screen name="preview" options={{ title: 'Önizleme' }} />
    </Stack>
  );
}
