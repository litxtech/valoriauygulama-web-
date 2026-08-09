import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIcon } from 'lucide-react-native';
import {
  Camera,
  ClipboardCheck,
  Image as ImageIcon,
  ListChecks,
  Megaphone,
  Mic,
  QrCode,
  Receipt,
  ScanLine,
  Video,
  BookImage,
} from 'lucide-react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FastPress } from '@/components/ui/FastPress';
import { pds, pdsNight } from '@/constants/personelDesignSystem';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
import { useAuthStore } from '@/stores/authStore';
import { hapticSelection } from '@/lib/hapticsSafe';

export type CreateSheetItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  accent: string;
  href: Href;
  adminOnly?: boolean;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  items?: CreateSheetItem[];
};

const IS_ANDROID = Platform.OS === 'android';

function buildDefaultItems(t: (k: string) => string): CreateSheetItem[] {
  return [
    {
      key: 'photo',
      label: t('navCreatePhoto'),
      icon: ImageIcon,
      accent: '#0F766E',
      href: '/staff/feed/new' as Href,
    },
    {
      key: 'video',
      label: t('navCreateVideo'),
      icon: Video,
      accent: '#0891B2',
      href: '/staff/feed/new' as Href,
    },
    {
      key: 'story',
      label: t('navCreateStory'),
      icon: BookImage,
      accent: '#E11D48',
      href: '/staff/feed/story-new' as Href,
    },
    {
      key: 'announce',
      label: t('navCreateAnnounce'),
      icon: Megaphone,
      accent: '#D97706',
      href: '/staff/board' as Href,
    },
    {
      key: 'audit',
      label: t('navCreateAudit'),
      icon: ClipboardCheck,
      accent: '#7C3AED',
      href: '/admin/audits' as Href,
      adminOnly: true,
    },
    {
      key: 'task',
      label: t('navCreateTask'),
      icon: ListChecks,
      accent: '#DB2777',
      href: '/admin/tasks/assign' as Href,
      adminOnly: true,
    },
    {
      key: 'qr',
      label: t('navCreateQr'),
      icon: QrCode,
      accent: '#2563EB',
      href: '/staff/payment-board' as Href,
    },
    {
      key: 'receipt',
      label: t('navCreateReceipt'),
      icon: Receipt,
      accent: '#0D9488',
      href: '/admin/accounting/pos-receipts/new' as Href,
      adminOnly: true,
    },
    {
      key: 'pdf',
      label: t('navCreatePdf'),
      icon: ScanLine,
      accent: '#64748B',
      href: '/staff/documents' as Href,
    },
    {
      key: 'voice',
      label: t('navCreateVoice'),
      icon: Mic,
      accent: '#EA580C',
      href: '/staff/feed/new' as Href,
    },
    {
      key: 'camera',
      label: t('navCreateCamera'),
      icon: Camera,
      accent: '#0F766E',
      href: '/staff/cameras' as Href,
    },
  ];
}

/** Premium bottom sheet for the center Create FAB. */
export function CreateActionSheet({ visible, onClose, items: itemsProp }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isNight } = usePremiumTheme();
  const colors = isNight ? pdsNight : pds;
  const isAdmin = useAuthStore((s) => s.staff?.role === 'admin');
  const progress = useRef(new Animated.Value(0)).current;

  const items = useMemo(() => {
    const base = itemsProp ?? buildDefaultItems(t);
    return base.filter((it) => !it.adminOnly || isAdmin);
  }, [itemsProp, t, isAdmin]);

  const closeAnimated = useCallback(() => {
    Animated.timing(progress, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClose();
    });
  }, [onClose, progress]);

  useEffect(() => {
    if (!visible) {
      progress.setValue(0);
      return;
    }
    progress.setValue(0);
    Animated.spring(progress, {
      toValue: 1,
      damping: 20,
      stiffness: 280,
      mass: 0.85,
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  const sheetY = progress.interpolate({ inputRange: [0, 1], outputRange: [420, 0] });
  const backdropOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  if (!items.length) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={closeAnimated}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
          pointerEvents="none"
        />
        {!IS_ANDROID ? (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]} pointerEvents="none">
            <BlurView intensity={32} tint="dark" style={StyleSheet.absoluteFill} />
          </Animated.View>
        ) : null}
        <Pressable style={StyleSheet.absoluteFill} onPress={closeAnimated} accessibilityRole="button" />

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.cardBg,
              paddingBottom: Math.max(insets.bottom, 16) + 8,
              transform: [{ translateY: sheetY }],
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: isNight ? '#3D524D' : '#C5D5D1' }]} />
          <Text style={[styles.title, { color: colors.text }]} maxFontSizeMultiplier={1.3}>
            {t('navCreate')}
          </Text>
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.grid}
          >
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <FastPress
                  key={item.key}
                  onPress={() => {
                    hapticSelection();
                    closeAnimated();
                    setTimeout(() => router.push(item.href), 80);
                  }}
                  style={styles.cell}
                  rippleColor="rgba(0,0,0,0.06)"
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                >
                  <View style={[styles.iconCircle, { backgroundColor: item.accent }]}>
                    <Icon size={22} color="#fff" strokeWidth={2.2} />
                  </View>
                  <Text
                    style={[styles.cellLabel, { color: colors.text }]}
                    numberOfLines={2}
                    maxFontSizeMultiplier={1.25}
                  >
                    {item.label}
                  </Text>
                </FastPress>
              );
            })}
          </ScrollView>
          <FastPress
            onPress={closeAnimated}
            style={[styles.cancel, { backgroundColor: isNight ? '#1A2E2A' : '#F0F5F3' }]}
            accessibilityRole="button"
            accessibilityLabel={t('cancel')}
          >
            <Text style={[styles.cancelText, { color: colors.subtext }]}>{t('cancel')}</Text>
          </FastPress>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,18,16,0.45)',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 16,
    maxHeight: '78%',
    shadowColor: '#0B3D36',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.2,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: 8,
  },
  cell: {
    width: '30.5%',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    minHeight: 88,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 14,
  },
  cancel: {
    marginTop: 8,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
