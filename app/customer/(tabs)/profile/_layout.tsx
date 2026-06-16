import { TouchableOpacity, Text } from 'react-native';
import { Stack, useRouter, useNavigation } from 'expo-router';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { theme } from '@/constants/theme';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';
import { customerStackScrollSafeGestureOptions } from '@/lib/customerStackNavigation';
import { useTranslation } from 'react-i18next';

function ProfileBackButton() {
  const router = useRouter();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { t } = useTranslation();
  const onPress = () => {
    if ((navigation.getState()?.routes?.length ?? 0) > 1) {
      navigation.goBack();
      return;
    }
    router.replace('/customer/profile');
  };
  return (
    <TouchableOpacity onPress={onPress} style={{ marginLeft: 8, paddingRight: 6 }} activeOpacity={0.7}>
      <Text style={{ fontSize: 17, color: theme.colors.primary }}>{t('back')}</Text>
    </TouchableOpacity>
  );
}

const profileSubScreenOptions = {
  ...customerStackScrollSafeGestureOptions,
  headerLeft: () => <ProfileBackButton />,
} as const;

export default function ProfileLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: t('back'),
        headerTitleStyle: { fontSize: 17, fontWeight: '600' },
        contentStyle: { backgroundColor: P.bg },
        ...customerStackScrollSafeGestureOptions,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false, contentStyle: { backgroundColor: P.bg } }} />
      <Stack.Screen
        name="edit"
        options={{
          title: t('screenEditProfile'),
          headerBackTitle: t('back'),
          ...profileSubScreenOptions,
        }}
      />
      <Stack.Screen
        name="delete-account"
        options={{
          title: t('screenDeleteAccount'),
          headerBackTitle: t('back'),
          ...profileSubScreenOptions,
        }}
      />
      <Stack.Screen
        name="notification-settings"
        options={{
          title: t('notifications'),
          headerBackTitle: t('back'),
          ...profileSubScreenOptions,
        }}
      />
      <Stack.Screen
        name="blocked-users"
        options={{
          title: t('blockedUsersTitle'),
          headerBackTitle: t('back'),
          ...profileSubScreenOptions,
        }}
      />
      <Stack.Screen
        name="my-posts"
        options={{
          title: t('customerProfileMyPostsMenuTitle'),
          headerBackTitle: t('back'),
          headerTitleAlign: 'center',
          headerLargeTitle: false,
          ...profileSubScreenOptions,
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          title: t('customerProfileSettingsTitle'),
          headerBackTitle: t('back'),
          ...profileSubScreenOptions,
        }}
      />
    </Stack>
  );
}
