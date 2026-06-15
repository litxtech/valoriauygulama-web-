import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassSurface } from '@/components/premium/GlassSurface';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
import type { HotelLiveMetrics } from '@/hooks/useHotelLiveMetrics';
import { pds } from '@/constants/personelDesignSystem';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { occupancyHubPathForStaff } from '@/lib/occupancyOpsPaths';
import { canAccessOccupancyOps } from '@/lib/staffPermissions';
import { isStaffHamburgerTabHref } from '@/lib/staffHamburgerNavigation';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { playPremiumTap } from '@/lib/premiumSounds';

type Props = { metrics: HotelLiveMetrics };

const WIDGETS = (m: HotelLiveMetrics, t: TFunction, hub: string) => {
  const base = hub.split('?')[0];
  return [
    { key: 'in', icon: 'log-in-outline' as const, label: t('staffOpsCheckIn'), value: m.checkInsToday, color: '#22c55e', href: `${base}?tab=today` },
    { key: 'out', icon: 'log-out-outline' as const, label: t('staffOpsCheckOut'), value: m.checkOutsToday, color: '#f59e0b', href: `${base}?tab=today` },
    { key: 'vacant', icon: 'bed-outline' as const, label: t('staffOpsVacantRoom'), value: m.vacantRooms, color: pds.indigo, href: base },
    { key: 'emergency', icon: 'warning-outline' as const, label: t('staffOpsEmergency'), value: m.emergencyActive, color: '#ef4444', href: '/staff/emergency' },
    {
      key: 'tasks',
      icon: 'checkbox-outline' as const,
      label: t('tasks'),
      value: m.pendingTasks,
      color: pds.purple,
      href: '/staff/tasks',
    },
  ] as const;
};

export function OpsWidgetGrid({ metrics }: Props) {
  const { t } = useTranslation();
  const { colors } = usePremiumTheme();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const hub = canAccessOccupancyOps(staff) ? occupancyHubPathForStaff(staff) : '/staff/tasks';
  const items = WIDGETS(metrics, t, hub);

  const openWidget = (href: string) => {
    void playPremiumTap();
    const path = href.split('?')[0];
    if (isStaffHamburgerTabHref(path)) {
      router.navigate(href as never);
    } else {
      router.push(href as never);
    }
  };

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.grid}
    >
      {items.map((w) => (
        <Pressable
          key={w.key}
          style={styles.cellWrap}
          onPress={() => openWidget(w.href)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={w.label}
        >
          <GlassSurface style={styles.cell} borderRadius={14} intensity={40} blur={false}>
            <View style={[styles.iconCircle, { backgroundColor: w.color + '18' }]}>
              <Ionicons name={w.icon} size={18} color={w.color} />
            </View>
            <Text style={[styles.value, { color: colors.text }]}>{w.value}</Text>
            <Text style={[styles.label, { color: colors.subtext }]} numberOfLines={1}>
              {w.label}
            </Text>
          </GlassSurface>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 12,
  },
  cellWrap: { width: 76 },
  cell: { alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4 },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  value: { fontSize: 17, fontWeight: '800' },
  label: { fontSize: 9, fontWeight: '600', textAlign: 'center', marginTop: 2 },
});
