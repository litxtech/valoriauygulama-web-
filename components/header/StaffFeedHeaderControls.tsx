import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useStaffNotificationStore } from '@/stores/staffNotificationStore';
import { useStaffNewAssignmentHintStore } from '@/stores/staffNewAssignmentHintStore';
import { useStaffHamburgerUiStore } from '@/stores/staffHamburgerUiStore';
import { useStaffHamburgerMenuActions } from '@/hooks/useStaffHamburgerMenuActions';
import { ModernHeaderIconButton } from '@/components/header/ModernHeaderIconButton';
import { ModernMenuButton } from '@/components/header/ModernMenuButton';

const HEADER_BTN = {
  notify: '#D97706',
  menu: '#0F766E',
} as const;

const CTRL = 36;

type StaffFeedHeaderLeftProps = {
  menuOpen: boolean;
  onMenuPress: () => void;
  menuHighlightLabel?: string | null;
};

/** Feed header sol: hamburger */
export function StaffFeedHeaderLeft({
  menuOpen,
  onMenuPress,
  menuHighlightLabel,
}: StaffFeedHeaderLeftProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.leftRow}>
      <ModernMenuButton
        onPress={onMenuPress}
        open={menuOpen}
        highlightLabel={menuHighlightLabel}
        accessibilityLabel={t('more')}
        color={HEADER_BTN.menu}
      />
    </View>
  );
}

/** Store’a bağlı — menü açılınca tüm tab layout yeniden çizilmez. */
export const StaffFeedHeaderLeftConnected = memo(function StaffFeedHeaderLeftConnected() {
  const { t } = useTranslation();
  const menuOpen = useStaffHamburgerUiStore((s) => s.visible);
  const newAssignMenuLabel = useStaffNewAssignmentHintStore((s) => s.showHamburgerLabel);
  const { toggleMenu } = useStaffHamburgerMenuActions();

  return (
    <StaffFeedHeaderLeft
      menuOpen={menuOpen}
      onMenuPress={toggleMenu}
      menuHighlightLabel={newAssignMenuLabel ? t('newBtn') : null}
    />
  );
});

/** Feed header sağ: bildirim */
export function StaffFeedHeaderRight() {
  const router = useRouter();
  const { t } = useTranslation();
  const unreadNotify = useStaffNotificationStore((s) => s.unreadCount);

  return (
    <View style={styles.rightRow}>
      <ModernHeaderIconButton
        icon="notifications-outline"
        badge={unreadNotify}
        onPress={() => router.push('/staff/notifications')}
        accessibilityLabel={t('notifications')}
        color={HEADER_BTN.notify}
        badgeColor="#dc2626"
      />
    </View>
  );
}

/** Sol kol genişliği (göz ortalaması için) */
export function feedHeaderLeftMinWidth() {
  return CTRL + 12;
}

/** Sağ kol genişliği (bildirim) */
export function feedHeaderRightMinWidth() {
  return CTRL + 8;
}

export function feedHeaderSideMinWidth() {
  return Math.max(feedHeaderLeftMinWidth(), feedHeaderRightMinWidth());
}

const styles = StyleSheet.create({
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 4,
    minHeight: 44,
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 2,
    minHeight: 44,
  },
});
