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

type Props = { metrics: HotelLiveMetrics };

function MetricPill({
  icon,
  label,
  color,
  bg,
  textColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  bg?: string;
  textColor?: string;
}) {
  return (
    <View
      style={[
        styles.pill,
        { borderColor: color + '55' },
        bg ? { backgroundColor: bg, borderColor: color + '33' } : null,
      ]}
    >
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.pillGlow, { backgroundColor: color + '12' }]}
      />
      <Ionicons name={icon} size={13} color={color} />
      <Text style={[styles.pillText, textColor ? { color: textColor } : null]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Dynamic Island tarzı canlı üst şerit — aktif personel, doluluk, görev */
export function LiveStatusIsland({ metrics }: Props) {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const canOcc = canAccessOccupancyOps(staff);
  const hubPath = occupancyHubPathForStaff(staff);
  const { isNight, toggleNight, colors } = usePremiumTheme();
  const stat = isNight && 'stat' in colors ? colors.stat : null;

  const pills = [
    {
      key: 'active',
      icon: 'people' as const,
      label: metrics.loading ? 'Aktif …' : `${metrics.activeStaff} aktif`,
      color: stat?.active.text ?? pds.online,
      bg: stat?.active.bg,
      textColor: stat?.active.text,
    },
    {
      key: 'occ',
      icon: 'bed' as const,
      label: metrics.loading ? 'Doluluk …' : `Doluluk %${metrics.occupancyPercent}`,
      color: stat ? colors.subtext : pds.indigo,
      bg: isNight ? 'rgba(255,255,255,0.04)' : undefined,
      textColor: isNight ? colors.text : undefined,
    },
    {
      key: 'tasks',
      icon: 'clipboard' as const,
      label: metrics.loading ? 'Görev …' : `${metrics.pendingTasks} görev`,
      color: stat?.task.text ?? pds.orange,
      bg: stat?.task.bg,
      textColor: stat?.task.text,
    },
    {
      key: 'weather',
      icon: 'partly-sunny' as const,
      label: metrics.weatherLabel,
      color: stat?.weather.text ?? '#38bdf8',
      bg: stat?.weather.bg,
      textColor: stat?.weather.text,
    },
  ];

  return (
    <GlassSurface style={styles.wrap} borderRadius={16} intensity={56} blur={false}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {pills.map((p) => {
          const onPress =
            p.key === 'occ' && canOcc
              ? () => router.push(hubPath as never)
              : p.key === 'tasks'
                ? () => router.navigate('/staff/tasks' as never)
                : undefined;

          if (!onPress) {
            return (
              <MetricPill
                key={p.key}
                icon={p.icon}
                label={p.label}
                color={p.color}
                bg={p.bg}
                textColor={p.textColor}
              />
            );
          }

          return (
            <Pressable
              key={p.key}
              onPress={onPress}
              hitSlop={8}
              style={styles.pillPressable}
              accessibilityRole="button"
              accessibilityLabel={p.key === 'tasks' ? 'Görevlerim' : 'Doluluk merkezini aç'}
            >
              <MetricPill
                icon={p.icon}
                label={p.label}
                color={p.color}
                bg={p.bg}
                textColor={p.textColor}
              />
            </Pressable>
          );
        })}
        <Pressable onPress={toggleNight} style={styles.nightBadge} hitSlop={8}>
          <Ionicons name={isNight ? 'moon' : 'sunny'} size={14} color={premiumNightAccent} />
        </Pressable>
      </ScrollView>
    </GlassSurface>
  );
}

const premiumNightAccent = '#B86EFF';

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.62)',
    overflow: 'hidden',
    minHeight: 32,
  },
  pillGlow: {
    borderRadius: 999,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
    color: pds.text,
    flexShrink: 0,
  },
  nightBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(139,92,246,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillPressable: {
    borderRadius: 999,
  },
});
