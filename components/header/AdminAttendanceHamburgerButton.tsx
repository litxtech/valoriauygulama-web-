import { memo, useCallback } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAdminAttendanceToday } from '@/hooks/useAdminAttendanceToday';
import { hapticImpactLight } from '@/lib/hapticsSafe';

const IS_ANDROID = Platform.OS === 'android';

type Props = {
  menuOpen?: boolean;
  onNavigate?: () => void;
};

export const AdminAttendanceHamburgerButton = memo(function AdminAttendanceHamburgerButton({
  menuOpen = false,
  onNavigate,
}: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const { dailyQuery, trackingStats } = useAdminAttendanceToday({
    enabled: menuOpen,
    previewLimit: 0,
  });

  const openDetails = useCallback(() => {
    hapticImpactLight();
    onNavigate?.();
    router.push('/admin/attendance');
  }, [onNavigate, router]);

  const summary = t('adminAttButtonSummary', {
    onShift: trackingStats.onShift,
    notStarted: trackingStats.notStarted,
  });

  const body = (
    <>
      <View style={styles.iconBubble}>
        {dailyQuery.isFetching && !dailyQuery.isLoading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name="time-outline" size={22} color="#fff" />
        )}
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title}>{t('adminAttMenuLabel')}</Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {dailyQuery.isLoading ? t('adminAttButtonLoading') : summary}
        </Text>
      </View>
      <View style={styles.badgesCol}>
        {trackingStats.onShift > 0 ? (
          <View style={[styles.badge, styles.badgeOnShift]}>
            <Text style={styles.badgeText}>{trackingStats.onShift}</Text>
          </View>
        ) : null}
        {trackingStats.notStarted > 0 ? (
          <View style={[styles.badge, styles.badgeMissing]}>
            <Text style={styles.badgeText}>{trackingStats.notStarted}</Text>
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.9)" />
      </View>
    </>
  );

  if (IS_ANDROID) {
    return (
      <Pressable
        onPress={openDetails}
        android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
        style={styles.wrap}
        accessibilityRole="button"
        accessibilityLabel={t('adminAttMenuLabel')}
      >
        <View style={[styles.btn, { backgroundColor: '#1d4ed8' }]} pointerEvents="none">
          {body}
        </View>
      </Pressable>
    );
  }

  return (
    <TouchableOpacity onPress={openDetails} activeOpacity={0.9} style={styles.wrap} accessibilityRole="button">
      <LinearGradient colors={['#1e3a8a', '#2563eb', '#6366f1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btn}>
        {body}
      </LinearGradient>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 8,
  },
  btn: {
    minHeight: 64,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  iconBubble: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
  badgesCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOnShift: {
    backgroundColor: 'rgba(16,185,129,0.35)',
  },
  badgeMissing: {
    backgroundColor: 'rgba(239,68,68,0.35)',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
});
