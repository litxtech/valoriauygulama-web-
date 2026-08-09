import { memo, useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useHotelLiveMetrics } from '@/hooks/useHotelLiveMetrics';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
import { FeedEnergyStrip, type FeedEnergyChip } from '@/components/feed/FeedEnergyStrip';

type Props = {
  refreshKey?: number;
  onCreatePost?: () => void;
};

/** Personel feed üstü — sade canlı operasyon şeridi */
export const StaffFeedDashboardStrip = memo(function StaffFeedDashboardStrip({
  refreshKey = 0,
  onCreatePost,
}: Props) {
  const metrics = useHotelLiveMetrics(refreshKey, { enablePolling: true });
  const router = useRouter();
  const { isNight, toggleNight } = usePremiumTheme();

  const chips = useMemo<FeedEnergyChip[]>(
    () => [
      {
        key: 'tasks',
        icon: 'clipboard-outline',
        value: metrics.loading ? '…' : String(metrics.pendingTasks),
        label: 'görev',
        onPress: () => router.navigate('/staff/tasks' as never),
      },
      {
        key: 'weather',
        icon: 'partly-sunny-outline',
        value: metrics.weatherLabel?.split(' ')[0] || '—',
        label: 'hava',
      },
      {
        key: 'checkout',
        icon: 'exit-outline',
        value: 'Çıkış',
        label: 'odalar',
        onPress: () => router.push('/staff/checkout-board' as never),
      },
      {
        key: 'payments',
        icon: 'cash-outline',
        value: 'Ödeme',
        label: 'pano',
        onPress: () => router.push('/staff/payment-board' as never),
      },
    ],
    [metrics.loading, metrics.pendingTasks, metrics.weatherLabel, router]
  );

  return (
    <View style={styles.wrap}>
      <FeedEnergyStrip
        title="Vardiya canlı"
        chips={chips}
        onCreatePress={onCreatePost}
        trailing={
          <Pressable
            onPress={toggleNight}
            style={[styles.iconBtn, isNight && styles.iconBtnNight]}
            hitSlop={6}
          >
            <Ionicons
              name={isNight ? 'sunny-outline' : 'moon-outline'}
              size={16}
              color={isNight ? '#99F6E4' : '#0F766E'}
            />
          </Pressable>
        }
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { paddingTop: 2 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#F3FAF8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 118, 110, 0.14)',
  },
  iconBtnNight: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.1)',
  },
});
