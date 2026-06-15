import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
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

const HEADER_BTN = {
  mrz: '#0f766e',
  idCapture: '#2563eb',
  notify: '#ea580c',
  menu: '#7c3aed',
} as const;

const CTRL = 36;
const SHARE_ACCENT = pds.indigo;

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

type StaffFeedHeaderRightProps = {
  showMrz?: boolean;
  onMrzPress?: () => void;
  showIdCapture?: boolean;
  onIdCapturePress?: () => void;
};

/** Feed header sağ: MRZ (varsa) + bildirim */
export function StaffFeedHeaderRight({
  showMrz,
  onMrzPress,
  showIdCapture,
  onIdCapturePress,
}: StaffFeedHeaderRightProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const unreadNotify = useStaffNotificationStore((s) => s.unreadCount);

  return (
    <View style={styles.rightRow}>
      {showMrz && onMrzPress ? (
        <ModernHeaderIconButton
          icon="scan-outline"
          onPress={onMrzPress}
          accessibilityLabel={t('kbsNavScanSerial')}
          color={HEADER_BTN.mrz}
        />
      ) : null}
      {showIdCapture && onIdCapturePress ? (
        <ModernHeaderIconButton
          icon="id-card-outline"
          onPress={onIdCapturePress}
          accessibilityLabel="Kimlik çekim sistemi"
          color={HEADER_BTN.idCapture}
        />
      ) : null}
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

/** Sağ kol genişliği */
export function feedHeaderRightMinWidth(showMrz: boolean, showIdCapture = false) {
  const iconW = 34;
  const mrzW = showMrz ? iconW + 4 : 0;
  const idCaptureW = showIdCapture ? iconW + 4 : 0;
  return mrzW + idCaptureW + iconW + 12;
}

export function feedHeaderSideMinWidth(showShare: boolean, showMrz: boolean, showIdCapture = false) {
  return Math.max(feedHeaderLeftMinWidth(showShare), feedHeaderRightMinWidth(showMrz, showIdCapture));
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
    gap: 2,
    marginRight: 2,
    minHeight: 44,
  },
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
