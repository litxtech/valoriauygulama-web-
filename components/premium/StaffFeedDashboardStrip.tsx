import { memo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useHotelLiveMetrics } from '@/hooks/useHotelLiveMetrics';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
import { useAuthStore } from '@/stores/authStore';
import { canAccessOccupancyOps } from '@/lib/staffPermissions';
import { occupancyHubPathForStaff } from '@/lib/occupancyOpsPaths';
import { pds } from '@/constants/personelDesignSystem';
import { FeedQuickAssignButton } from '@/components/premium/FeedQuickAssignButton';
import { AiReceptionFab } from '@/components/premium/AiReceptionFab';

type Props = { refreshKey?: number };

/** Feed üstü: ince metrik şeridi + kısayol ikonları (AI, görev) — akışa yer bırakır */
export const StaffFeedDashboardStrip = memo(function StaffFeedDashboardStrip({ refreshKey = 0 }: Props) {
  const metrics = useHotelLiveMetrics(refreshKey, { enablePolling: false });
  const router = useRouter();
  const { isNight, toggleNight, colors } = usePremiumTheme();
  const staff = useAuthStore((s) => s.staff);
  const canOcc = canAccessOccupancyOps(staff);
  const hubPath = occupancyHubPathForStaff(staff);

  const chips = [
    {
      key: 'active',
      icon: 'people' as const,
      value: metrics.loading ? '…' : String(metrics.activeStaff),
      label: 'aktif',
      color: pds.online,
      onPress: undefined as (() => void) | undefined,
    },
    {
      key: 'occ',
      icon: 'bed' as const,
      value: metrics.loading ? '…' : `%${metrics.occupancyPercent}`,
      label: 'doluluk',
      color: pds.indigo,
      onPress: canOcc ? () => router.push(hubPath as never) : undefined,
    },
    {
      key: 'tasks',
      icon: 'checkbox' as const,
      value: metrics.loading ? '…' : String(metrics.pendingTasks),
      label: 'görev',
      color: pds.purple,
      onPress: () => router.navigate('/staff/tasks' as never),
    },
  ];

  return (
    <View style={styles.wrap}>
      <View style={[styles.bar, isNight && { borderBottomColor: colors.borderLight }]}>
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          style={styles.chipsScroll}
        >
          {chips.map((c) => {
            const inner = (
              <>
                <Ionicons name={c.icon} size={11} color={c.color} />
                <Text style={[styles.chipVal, isNight && { color: colors.text }]}>{c.value}</Text>
                <Text style={[styles.chipLabel, isNight && { color: colors.subtext }]}>{c.label}</Text>
              </>
            );
            if (!c.onPress) {
              return (
                <View key={c.key} style={[styles.chip, isNight && styles.chipNight]}>
                  {inner}
                </View>
              );
            }
            return (
              <Pressable
                key={c.key}
                style={[styles.chip, isNight && styles.chipNight]}
                onPress={c.onPress}
                hitSlop={4}
              >
                {inner}
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.actions}>
          <FeedQuickAssignButton variant="icon" />
          <AiReceptionFab variant="icon" />
          <Pressable onPress={toggleNight} style={styles.iconBtn} hitSlop={6} accessibilityRole="button">
            <Ionicons name={isNight ? 'moon' : 'sunny-outline'} size={17} color={colors.subtext} />
          </Pressable>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { paddingTop: 0 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: pds.cardBorder,
    minHeight: 40,
  },
  chipsScroll: { flex: 1, minWidth: 0 },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(99,102,241,0.08)',
  },
  chipNight: { backgroundColor: 'rgba(255,255,255,0.06)' },
  chipVal: { fontSize: 12, fontWeight: '800', color: pds.text },
  chipLabel: { fontSize: 10, fontWeight: '600', color: pds.subtext },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
