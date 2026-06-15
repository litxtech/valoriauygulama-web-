import { TouchableOpacity, Text } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { theme } from '@/constants/theme';
import { useTranslation } from 'react-i18next';

function ProfileBackButton() {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <TouchableOpacity onPress={() => router.replace('/customer/profile')} style={{ marginLeft: 8, paddingRight: 6 }} activeOpacity={0.7}>
      <Text style={{ fontSize: 17, color: theme.colors.primary }}>{t('back')}</Text>
    </TouchableOpacity>
  );
}

export default function ProfileLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: t('back'),
        headerTitleStyle: { fontSize: 17, fontWeight: '600' },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="edit"
        options={{
          title: t('screenEditProfile'),
          headerBackTitle: t('back'),
          headerLeft: () => <ProfileBackButton />,
        }}
      />
      <Stack.Screen
        name="delete-account"
        options={{
          title: t('screenDeleteAccount'),
          headerBackTitle: t('back'),
          headerLeft: () => <ProfileBackButton />,
        }}
      />
      <Stack.Screen
        name="notification-settings"
        options={{
          title: t('notifications'),
          headerBackTitle: t('back'),
          headerLeft: () => <ProfileBackButton />,
        }}
      />
      <Stack.Screen
        name="blocked-users"
        options={{
          title: t('blockedUsersTitle'),
          headerBackTitle: t('back'),
          headerLeft: () => <ProfileBackButton />,
        }}
      />
      <Stack.Screen
        name="my-posts"
        options={{
          title: t('customerProfileMyPostsMenuTitle'),
          headerBackTitle: t('back'),
          headerLeft: () => <ProfileBackButton />,
          headerTitleAlign: 'center',
          headerLargeTitle: false,
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          title: t('customerProfileSettingsTitle'),
          headerBackTitle: t('back'),
          headerLeft: () => <ProfileBackButton />,
        }}
      />
    </Stack>
  );
}
