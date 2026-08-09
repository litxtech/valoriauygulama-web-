import { memo, useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useGuestHotelPulse } from '@/hooks/useGuestHotelPulse';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
import { FeedEnergyStrip, type FeedEnergyChip } from '@/components/feed/FeedEnergyStrip';

type Props = {
  refreshKey?: number;
};

/** Misafir feed üstü — sade canlı şerit (çevrimiçi / otel / keşfet) */
export const GuestFeedDashboardStrip = memo(function GuestFeedDashboardStrip({
  refreshKey = 0,
}: Props) {
  const pulse = useGuestHotelPulse(refreshKey, true);
  const router = useRouter();
  const { isNight } = usePremiumTheme();

  const loading = pulse.loading && pulse.stats.totalRooms === 0;
  const staffOnline = pulse.ops.staffOnline;

  const chips = useMemo<FeedEnergyChip[]>(
    () => [
      {
        key: 'online',
        icon: 'radio-outline',
        value: loading ? '…' : String(staffOnline),
        label: 'çevrimiçi',
        live: staffOnline > 0,
      },
      {
        key: 'hotel',
        icon: 'business-outline',
        value: 'Otel',
        label: 'giriş',
        onPress: () => router.push('/customer/hotel-info'),
      },
      {
        key: 'explore',
        icon: 'compass-outline',
        value: 'Keşfet',
        label: 'çevre',
        onPress: () => router.push('/customer/surroundings' as never),
      },
    ],
    [loading, staffOnline, router]
  );

  return (
    <View style={styles.wrap}>
      <FeedEnergyStrip
        title="Otel canlı"
        chips={chips}
        trailing={
          <Pressable
            onPress={() => router.push('/customer/hotel-info')}
            style={[styles.iconBtn, isNight && styles.iconBtnNight]}
            hitSlop={6}
          >
            <Ionicons name="sparkles-outline" size={16} color={isNight ? '#99F6E4' : '#0F766E'} />
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
