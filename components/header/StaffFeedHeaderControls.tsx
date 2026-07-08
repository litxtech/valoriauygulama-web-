import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { pds } from '@/constants/personelDesignSystem';
import { useStaffNotificationStore } from '@/stores/staffNotificationStore';
import { useStaffNewAssignmentHintStore } from '@/stores/staffNewAssignmentHintStore';
import { useStaffHamburgerUiStore } from '@/stores/staffHamburgerUiStore';
import { useStaffHamburgerMenuActions } from '@/hooks/useStaffHamburgerMenuActions';
import { ModernHeaderIconButton } from '@/components/header/ModernHeaderIconButton';
import { ModernMenuButton } from '@/components/header/ModernMenuButton';
import { FastPress } from '@/components/ui/FastPress';
import { useHotelInHousePopulation } from '@/hooks/useHotelInHousePopulation';

const HEADER_BTN = {
  notify: '#ea580c',
  menu: '#7c3aed',
} as const;

const CTRL = 36;
const SHARE_ACCENT = pds.indigo;
const POP_ACCENT = '#0f766e';

/** Otel nüfusu (içeride konaklayan) — tıklanınca maskeli liste açılır. */
function HotelPopulationPill() {
  const router = useRouter();
  const { count } = useHotelInHousePopulation();
  return (
    <FastPress
      onPress={() => router.push('/staff/in-house')}
      accessibilityRole="button"
      accessibilityLabel={`Otel nüfusu: ${count}`}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      rippleColor={`${POP_ACCENT}28`}
      activeOpacity={0.82}
      style={styles.popHit}
    >
      <View style={styles.popPill}>
        <Ionicons name="people" size={15} color={POP_ACCENT} />
        <Text style={styles.popText}>{count}</Text>
      </View>
    </FastPress>
  );
}

type StaffFeedHeaderLeftProps = {
  menuOpen: boolean;
  onMenuPress: () => void;
  menuHighlightLabel?: string | null;
  showShare: boolean;
  onSharePress: () => void;
  shareAccessibilityLabel: string;
};

function FeedShareHeaderButton({
  onPress,
  accessibilityLabel,
}: {
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <FastPress
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
      rippleColor={`${SHARE_ACCENT}28`}
      activeOpacity={0.82}
      style={styles.shareHit}
    >
      <View style={styles.sharePill}>
        <View
          style={[
            styles.sharePillBase,
            { borderColor: `${SHARE_ACCENT}40`, backgroundColor: `${SHARE_ACCENT}12` },
          ]}
        />
        <Ionicons name="add" size={22} color={SHARE_ACCENT} />
      </View>
    </FastPress>
  );
}

/** Feed header sol: hamburger + gönderi paylaş */
export function StaffFeedHeaderLeft({
  menuOpen,
  onMenuPress,
  menuHighlightLabel,
  showShare,
  onSharePress,
  shareAccessibilityLabel,
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
      {showShare ? (
        <FeedShareHeaderButton onPress={onSharePress} accessibilityLabel={shareAccessibilityLabel} />
      ) : null}
    </View>
  );
}

type StaffFeedHeaderLeftConnectedProps = {
  showShare: boolean;
  onSharePress: () => void;
  shareAccessibilityLabel: string;
};

/** Store’a bağlı — menü açılınca tüm tab layout yeniden çizilmez. */
export const StaffFeedHeaderLeftConnected = memo(function StaffFeedHeaderLeftConnected({
  showShare,
  onSharePress,
  shareAccessibilityLabel,
}: StaffFeedHeaderLeftConnectedProps) {
  const { t } = useTranslation();
  const menuOpen = useStaffHamburgerUiStore((s) => s.visible);
  const newAssignMenuLabel = useStaffNewAssignmentHintStore((s) => s.showHamburgerLabel);
  const { toggleMenu } = useStaffHamburgerMenuActions();

  return (
    <StaffFeedHeaderLeft
      menuOpen={menuOpen}
      onMenuPress={toggleMenu}
      menuHighlightLabel={newAssignMenuLabel ? t('newBtn') : null}
      showShare={showShare}
      onSharePress={onSharePress}
      shareAccessibilityLabel={shareAccessibilityLabel}
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
      <HotelPopulationPill />
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
export function feedHeaderLeftMinWidth(showShare: boolean) {
  const shareW = showShare ? CTRL + 6 : 0;
  return CTRL + shareW + 12;
}

/** Sağ kol genişliği (nüfus rozeti + bildirim) */
export function feedHeaderRightMinWidth() {
  return 34 + 12 + 58;
}

export function feedHeaderSideMinWidth(showShare: boolean) {
  return Math.max(feedHeaderLeftMinWidth(showShare), feedHeaderRightMinWidth());
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
  popHit: {
    height: CTRL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 28,
    paddingHorizontal: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: `${POP_ACCENT}40`,
    backgroundColor: `${POP_ACCENT}12`,
  },
  popText: { fontSize: 13, fontWeight: '800', color: POP_ACCENT, minWidth: 10, textAlign: 'center' },
  shareHit: {
    width: CTRL,
    height: CTRL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharePill: {
    width: CTRL,
    height: CTRL,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharePillBase: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    borderWidth: 1,
  },
});
