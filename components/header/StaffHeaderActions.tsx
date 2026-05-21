import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useStaffBoardStore } from '@/stores/staffBoardStore';
import { useStaffNotificationStore } from '@/stores/staffNotificationStore';
import { AnimatedBoardEyeButton } from '@/components/header/AnimatedBoardEyeButton';

/** Feed header ortası: duyuru panosu (göz) */
export function StaffBoardHeaderEye() {
  const router = useRouter();
  const { t } = useTranslation();
  const eyeVisible = useStaffBoardStore((s) => s.eyeVisible);
  const hasUnread = useStaffBoardStore((s) => s.hasUnread);
  const unreadCount = useStaffBoardStore((s) => s.unreadCount);
  const dismissToast = useStaffBoardStore((s) => s.dismissToast);

  if (!eyeVisible) return null;

  return (
    <View style={styles.eyeCenter} pointerEvents="box-none">
      <AnimatedBoardEyeButton
        active={hasUnread}
        onPress={() => {
          dismissToast();
          router.push('/staff/board');
        }}
        accessibilityLabel={
          hasUnread ? t('staffBoardUnread', { count: unreadCount }) : t('staffBoardTitle')
        }
        color="#3b82f6"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  eyeCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
});
