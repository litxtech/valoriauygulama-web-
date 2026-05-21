import { StyleSheet, Platform, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { pds } from '@/constants/personelDesignSystem';
import { useStaffNotificationStore } from '@/stores/staffNotificationStore';
import { ModernHeaderIconButton } from '@/components/header/ModernHeaderIconButton';
import { ModernMenuButton } from '@/components/header/ModernMenuButton';
import { FastPress } from '@/components/ui/FastPress';

const HEADER_BTN = {
  mrz: '#0f766e',
  notify: '#ea580c',
  menu: '#7c3aed',
} as const;

const CTRL = 36;
/** Gönderi paylaş — dış halka + iç gradient daire */
const SHARE_OUTER = 38;
const SHARE_RING = 2.5;

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
  const innerSize = SHARE_OUTER - SHARE_RING * 2;

  return (
    <FastPress
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
      rippleColor="rgba(255, 60, 172, 0.28)"
      activeOpacity={0.86}
      style={styles.shareHit}
    >
      <LinearGradient
        colors={[...pds.gradientStoryRing, pds.purple]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.shareRing}
      >
        <View style={[styles.shareInnerShell, { width: innerSize, height: innerSize, borderRadius: innerSize / 2 }]}>
          {Platform.OS === 'android' ? (
            <View style={[styles.shareCore, styles.shareCoreAndroid, { width: innerSize - 4, height: innerSize - 4, borderRadius: (innerSize - 4) / 2 }]}>
              <Ionicons name="create-outline" size={18} color="#fff" />
            </View>
          ) : (
            <LinearGradient
              colors={pds.gradientCta}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.shareCore, { width: innerSize - 4, height: innerSize - 4, borderRadius: (innerSize - 4) / 2 }]}
            >
              <Ionicons name="create-outline" size={18} color="#fff" />
            </LinearGradient>
          )}
        </View>
      </LinearGradient>
      <View style={styles.shareMediaBadge} pointerEvents="none">
        <Ionicons name="images" size={9} color="#fff" />
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

type StaffFeedHeaderRightProps = {
  showMrz?: boolean;
  onMrzPress?: () => void;
};

/** Feed header sağ: MRZ (varsa) + bildirim */
export function StaffFeedHeaderRight({ showMrz, onMrzPress }: StaffFeedHeaderRightProps) {
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
  const shareW = showShare ? SHARE_OUTER + 6 : 0;
  return CTRL + shareW + 12;
}

/** Sağ kol genişliği */
export function feedHeaderRightMinWidth(showMrz: boolean) {
  const iconW = 34;
  const mrzW = showMrz ? iconW + 4 : 0;
  return mrzW + iconW + 12;
}

export function feedHeaderSideMinWidth(showShare: boolean, showMrz: boolean) {
  return Math.max(feedHeaderLeftMinWidth(showShare), feedHeaderRightMinWidth(showMrz));
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
    width: SHARE_OUTER,
    height: SHARE_OUTER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareRing: {
    width: SHARE_OUTER,
    height: SHARE_OUTER,
    borderRadius: SHARE_OUTER / 2,
    padding: SHARE_RING,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ff3cac',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32,
    shadowRadius: 8,
    elevation: 5,
  },
  shareInnerShell: {
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareCore: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareCoreAndroid: {
    backgroundColor: pds.pink,
  },
  shareMediaBadge: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: pds.indigo,
    borderWidth: 1.5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
