import { Platform, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

/** Misafir sohbet / yeni sohbet — tek geri (çift ok önlenir). */
export function CustomerChatHeaderBack() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.back()}
      hitSlop={12}
      style={{ marginLeft: Platform.OS === 'ios' ? 0 : 4, paddingVertical: 4 }}
      accessibilityRole="button"
      accessibilityLabel="Geri"
    >
      <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
    </Pressable>
  );
}

export const customerChatHeaderBackOptions = {
  headerBackVisible: false,
  headerBackTitle: ' ',
  headerBackTitleVisible: false,
  ...(Platform.OS === 'ios' ? { headerBackButtonDisplayMode: 'minimal' as const } : {}),
  headerLeft: () => <CustomerChatHeaderBack />,
} as const;
