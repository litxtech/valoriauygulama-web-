import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useStaffBoardStore } from '@/stores/staffBoardStore';

const AUTO_HIDE_MS = 7000;

export function StaffBoardAnnouncementToast() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pending = useStaffBoardStore((s) => s.pendingToast);
  const dismissToast = useStaffBoardStore((s) => s.dismissToast);
  const slide = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }

    if (!pending) {
      Animated.parallel([
        Animated.timing(slide, { toValue: -120, duration: 220, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.spring(slide, {
        toValue: 0,
        friction: 7,
        tension: 90,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    hideTimer.current = setTimeout(() => dismissToast(), AUTO_HIDE_MS);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [pending, dismissToast, slide, opacity]);

  if (!pending) return null;

  const openBoard = () => {
    dismissToast();
    router.push('/staff/board');
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          top: insets.top + 52,
          opacity,
          transform: [{ translateY: slide }],
        },
      ]}
    >
      <Pressable style={styles.card} onPress={openBoard} accessibilityRole="button">
        <View style={styles.eyeCol}>
          <View style={styles.eyeBubble}>
            <Ionicons name="eye" size={20} color="#3b82f6" />
          </View>
        </View>
        <View style={styles.textCol}>
          <Text style={styles.kicker}>{t('staffBoardToastKicker')}</Text>
          <Text style={styles.title} numberOfLines={1}>
            {pending.title}
          </Text>
          <Text style={styles.hint}>{t('staffBoardToastHint')}</Text>
        </View>
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            dismissToast();
          }}
          hitSlop={12}
          style={styles.close}
          accessibilityLabel={t('close')}
        >
          <Ionicons name="close" size={18} color="#94a3b8" />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 200,
    elevation: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 10,
    paddingLeft: 6,
    paddingRight: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#dbeafe',
    shadowColor: '#1e3a8a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 8,
  },
  eyeCol: {
    marginRight: 8,
  },
  eyeBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#bfdbfe',
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3b82f6',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  hint: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  close: {
    padding: 4,
  },
});
