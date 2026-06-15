import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import { adminTheme } from '@/constants/adminTheme';
import { useLivePeople } from '@/hooks/useLivePeople';
import { useAdminLiveTrackingMap } from '@/hooks/useAdminLiveTrackingMap';
import { resolveStaffPresenceStatus } from '@/lib/workStatusAura';

type Props = {
  refreshKey?: number;
  /** Harita konumu rozeti için ek sorgu; ana panelde false bırakın */
  includeMapSnapshot?: boolean;
};

function formatLastActive(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'Az önce';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa önce`;
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

/** Admin ana panel: uygulamada o an çevrimiçi personel listesi */
export function AdminLivePeopleList({ refreshKey = 0, includeMapSnapshot = false }: Props) {
  const router = useRouter();
  const { people: rawPeople, loading } = useLivePeople(refreshKey);
  const people = Array.isArray(rawPeople) ? rawPeople : [];
  const { snapshot } = useAdminLiveTrackingMap(refreshKey, 'all', includeMapSnapshot);
  const onMap = snapshot?.onMap ?? [];
  const staffOnMapIds = new Set(
    onMap.filter((p) => p.userType === 'staff').map((p) => p.id)
  );

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="radio-outline" size={18} color={adminTheme.colors.accent} />
          <Text style={styles.title}>Canlı kişiler</Text>
        </View>
        <View style={styles.headerRight}>
          {!loading ? <Text style={styles.count}>{people.length}</Text> : null}
          <TouchableOpacity
            onPress={() => router.push('/admin/map' as never)}
            style={styles.mapBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Harita"
          >
            <Ionicons name="map-outline" size={18} color={adminTheme.colors.accent} />
          </TouchableOpacity>
        </View>
      </View>

      {loading && people.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={adminTheme.colors.accent} />
          <Text style={styles.hint}>Güncelleniyor…</Text>
        </View>
      ) : people.length === 0 ? (
        <Text style={styles.empty}>
          Şu an uygulamada çevrimiçi personel yok. Personel uygulamayı açıp çevrimiçi olduğunda burada
          görünür.
        </Text>
      ) : (
        <View style={styles.list}>
          {people.map((person, index) => {
            const presence = resolveStaffPresenceStatus({
              isOnline: person.is_online,
              workStatus: person.work_status,
            });
            const activeLabel = formatLastActive(person.last_active);
            const onMap = staffOnMapIds.has(person.id);
            return (
              <TouchableOpacity
                key={person.id}
                style={[styles.row, index < people.length - 1 && styles.rowBorder]}
                onPress={() => router.push(`/admin/staff/${person.id}` as never)}
                activeOpacity={0.75}
              >
                <View style={styles.avatarWrap}>
                  {person.profile_image ? (
                    <CachedImage uri={person.profile_image} style={styles.avatar} contentFit="cover" />
                  ) : (
                    <View style={styles.avatarPh}>
                      <Text style={styles.avatarLetter}>{(person.full_name ?? '?').charAt(0)}</Text>
                    </View>
                  )}
                  <View
                    style={[
                      styles.presenceDot,
                      presence === 'available' && styles.presenceActive,
                      presence === 'busy' && styles.presenceBusy,
                      presence === 'urgent' && styles.presenceUrgent,
                      presence === 'break' && styles.presenceBreak,
                    ]}
                  />
                </View>
                <View style={styles.meta}>
                  <Text style={styles.name} numberOfLines={1}>
                    {person.full_name ?? '—'}
                  </Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {[person.department, person.role].filter(Boolean).join(' · ') || 'Personel'}
                    {activeLabel ? ` · ${activeLabel}` : ''}
                    {onMap ? ' · Haritada' : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.textMuted} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.borderLight,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mapBtn: { padding: 2 },
  title: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text },
  count: {
    fontSize: 13,
    fontWeight: '800',
    color: adminTheme.colors.accent,
    minWidth: 24,
    textAlign: 'right',
  },
  centered: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  hint: { fontSize: 13, color: adminTheme.colors.textMuted },
  empty: {
    fontSize: 13,
    lineHeight: 19,
    color: adminTheme.colors.textMuted,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  list: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 12,
  },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: adminTheme.colors.border },
  avatarWrap: { position: 'relative' },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarPh: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.textSecondary },
  presenceDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: adminTheme.colors.surface,
    backgroundColor: adminTheme.colors.textMuted,
  },
  presenceActive: { backgroundColor: adminTheme.colors.success },
  presenceBusy: { backgroundColor: adminTheme.colors.warning },
  presenceUrgent: { backgroundColor: adminTheme.colors.error },
  presenceBreak: { backgroundColor: adminTheme.colors.textMuted },
  meta: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  sub: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
});
