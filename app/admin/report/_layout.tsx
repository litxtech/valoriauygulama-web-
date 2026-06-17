import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { adminTheme } from '@/constants/adminTheme';
import {
  AdminStackBackButton,
  ADMIN_TABS_FALLBACK,
  adminStackGestureForNavigation,
} from '@/lib/adminStackBack';

const REPORT_HUB = '/admin/report' as const;

export default function ReportLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={({ navigation }) => ({
        headerShown: true,
        headerStyle: { backgroundColor: adminTheme.colors.surface },
        headerTintColor: adminTheme.colors.text,
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        ...adminStackGestureForNavigation(navigation),
        headerBackVisible: false,
        headerLeft: () => <AdminStackBackButton accessibilityLabel={t('back')} />,
      })}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Günlük doluluk raporu',
          headerLeft: () => <AdminStackBackButton fallback={ADMIN_TABS_FALLBACK} accessibilityLabel={t('back')} />,
        }}
      />
      <Stack.Screen
        name="operations"
        options={{
          title: 'Konaklama operasyon',
          headerLeft: () => <AdminStackBackButton fallback={REPORT_HUB} accessibilityLabel={t('back')} />,
        }}
      />
      <Stack.Screen name="breakfast-briefing" options={{ title: 'Sabah kahvaltı sayısı' }} />
    </Stack>
  );
}
