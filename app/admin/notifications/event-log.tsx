import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme as T } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import {
  NOTIFICATION_SOUND_FEATURES,
  getNotificationSoundFeatureDef,
} from '@/lib/notificationSoundCatalog';
import {
  fetchAdminNotificationEvents,
  fetchAdminNotificationEventsSummary,
  type NotificationEventRow,
  type NotificationEventsSummary,
} from '@/lib/notificationEventLog';

const FEATURE_FILTERS = [{ key: '', label: 'Tümü' }, ...NOTIFICATION_SOUND_FEATURES.map((f) => ({
  key: f.featureKey,
  label: f.titleTr,
}))];

function StatChip({ label, value, tint }: { label: string; value: number; tint?: string }) {
  return (
    <View style={[styles.statChip, tint ? { borderColor: tint } : null]}>
      <Text style={[styles.statValue, tint ? { color: tint } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function statusLabel(row: NotificationEventRow): string {
  if (row.acknowledged_at) return 'Onaylandı';
  if (row.opened_at) return 'Açıldı';
  if (row.delivery_status === 'sent') return 'Gönderildi';
  return row.delivery_status ?? '—';
}

function statusColor(row: NotificationEventRow): string {
  if (row.acknowledged_at) return T.colors.success;
  if (row.opened_at) return T.colors.info;
  if (row.feature_key === 'emergency_alert' && !row.acknowledged_at) return T.colors.error;
  return T.colors.textMuted;
}

export default function AdminNotificationEventLogScreen() {
  const insets = useSafeAreaInsets();
  const { orgScoped, canQuery, canUseAll, staff } = useAdminOrganizationQueryScope();
  const [rows, setRows] = useState<NotificationEventRow[]>([]);
  const [summary, setSummary] = useState<NotificationEventsSummary | null>(null);
  const [featureFilter, setFeatureFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<NotificationEventRow | null>(null);

  const load = useCallback(async () => {
    if (!canQuery || !orgScoped) {
      setRows([]);
      setSummary(null);
      setLoading(false);
      return;
    }
    const [list, sum] = await Promise.all([
      fetchAdminNotificationEvents(orgScoped, featureFilter || null, 120),
      fetchAdminNotificationEventsSummary(orgScoped, 48),
    ]);
    setRows(list);
    setSummary(sum);
    setLoading(false);
  }, [canQuery, orgScoped, featureFilter]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const groupedEmergency = useMemo(() => {
    const pending = rows.filter(
      (r) => r.feature_key === 'emergency_alert' && !r.acknowledged_at
    );
    return pending.length;
  }, [rows]);

  return (
    <>
      <Stack.Screen options={{ title: 'Bildirim Log & Takip' }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
      >
        <AdminOrganizationPicker
          canUseAll={canUseAll}
          ownOrganizationId={staff?.organization_id}
        />

        <Text style={styles.intro}>
          Hangi bildirimin kime gittiği, hangi sesin kullanıldığı ve kim onayladı — son 48 saat özeti.
        </Text>

        {summary ? (
          <View style={styles.statsRow}>
            <StatChip label="Toplam" value={summary.total} />
            <StatChip label="Açılan" value={summary.opened} tint={T.colors.info} />
            <StatChip label="Onay" value={summary.acknowledged} tint={T.colors.success} />
            <StatChip label="Acil bekleyen" value={summary.pending_ack} tint={T.colors.error} />
          </View>
        ) : null}

        {groupedEmergency > 0 ? (
          <View style={styles.alertBox}>
            <Ionicons name="warning" size={20} color={T.colors.error} />
            <Text style={styles.alertText}>
              {groupedEmergency} acil durum bildirimi henüz onaylanmadı.
            </Text>
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {FEATURE_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key || 'all'}
              style={[styles.filterChip, featureFilter === f.key && styles.filterChipActive]}
              onPress={() => setFeatureFilter(f.key)}
            >
              <Text style={[styles.filterChipText, featureFilter === f.key && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {!canQuery ? (
          <Text style={styles.empty}>İşletme seçin.</Text>
        ) : loading ? (
          <ActivityIndicator color={T.colors.accent} style={{ marginTop: 24 }} />
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>Henüz log kaydı yok. Push gönderildikçe burada görünür.</Text>
        ) : (
          rows.map((row) => {
            const def = getNotificationSoundFeatureDef(row.feature_key ?? '');
            return (
              <TouchableOpacity
                key={row.id}
                style={styles.row}
                activeOpacity={0.85}
                onPress={() => setSelected(row)}
              >
                <View style={styles.rowHead}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {row.notification_title || '—'}
                  </Text>
                  <Text style={[styles.rowStatus, { color: statusColor(row) }]}>{statusLabel(row)}</Text>
                </View>
                <Text style={styles.rowMeta}>
                  {def?.titleTr ?? row.feature_key ?? '—'}
                  {' · '}
                  {row.user_kind === 'guest' ? 'Misafir' : row.user_kind === 'staff' ? 'Personel' : '—'}
                  {row.staff_name ? ` · ${row.staff_name}` : ''}
                </Text>
                {row.sound_file_name ? (
                  <Text style={styles.rowSound} numberOfLines={1}>
                    Ses: {row.sound_file_name}
                  </Text>
                ) : row.sound_key ? (
                  <Text style={styles.rowSound}>Ses anahtarı: {row.sound_key}</Text>
                ) : null}
                <Text style={styles.rowTime}>
                  {new Date(row.created_at).toLocaleString('tr-TR')}
                </Text>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSelected(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            {selected ? (
              <>
                <Text style={styles.modalTitle}>{selected.notification_title}</Text>
                {selected.notification_body ? (
                  <Text style={styles.modalBody}>{selected.notification_body}</Text>
                ) : null}
                <Text style={styles.modalLine}>
                  Özellik: {getNotificationSoundFeatureDef(selected.feature_key ?? '')?.titleTr ?? selected.feature_key}
                </Text>
                <Text style={styles.modalLine}>
                  Alıcı: {selected.staff_name || selected.user_id || '—'} ({selected.user_kind})
                </Text>
                <Text style={styles.modalLine}>Ses: {selected.sound_file_name || selected.sound_key || 'varsayılan'}</Text>
                <Text style={styles.modalLine}>Durum: {statusLabel(selected)}</Text>
                <Text style={styles.modalLine}>
                  Gönderim: {new Date(selected.created_at).toLocaleString('tr-TR')}
                </Text>
                {selected.opened_at ? (
                  <Text style={styles.modalLine}>
                    Açılma: {new Date(selected.opened_at).toLocaleString('tr-TR')}
                  </Text>
                ) : null}
                {selected.acknowledged_at ? (
                  <Text style={[styles.modalLine, { color: T.colors.success, fontWeight: '700' }]}>
                    Onay: {new Date(selected.acknowledged_at).toLocaleString('tr-TR')}
                  </Text>
                ) : null}
                {selected.feature_key === 'emergency_alert' && !selected.acknowledged_at ? (
                  <View style={styles.modalPending}>
                    <Text style={styles.modalPendingText}>Personel henüz "Gördüm" onayı vermedi.</Text>
                  </View>
                ) : null}
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: T.colors.surfaceSecondary },
  content: { padding: T.spacing.lg },
  intro: { fontSize: 14, color: T.colors.textSecondary, lineHeight: 20, marginBottom: T.spacing.md },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: T.spacing.md },
  statChip: {
    flex: 1,
    minWidth: 72,
    backgroundColor: T.colors.surface,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: T.colors.border,
    alignItems: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '800', color: T.colors.text },
  statLabel: { fontSize: 11, color: T.colors.textMuted, marginTop: 2, textAlign: 'center' },
  alertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: T.colors.errorLight,
    padding: 12,
    borderRadius: 10,
    marginBottom: T.spacing.md,
  },
  alertText: { flex: 1, color: T.colors.error, fontSize: 13, fontWeight: '600' },
  filterScroll: { marginBottom: T.spacing.md, maxHeight: 44 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: T.colors.surface,
    borderWidth: 1,
    borderColor: T.colors.border,
    marginRight: 8,
  },
  filterChipActive: { backgroundColor: T.colors.primary, borderColor: T.colors.primary },
  filterChipText: { fontSize: 13, color: T.colors.textSecondary, fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  empty: { textAlign: 'center', color: T.colors.textMuted, marginTop: 24 },
  row: {
    backgroundColor: T.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: T.colors.text },
  rowStatus: { fontSize: 12, fontWeight: '700' },
  rowMeta: { fontSize: 12, color: T.colors.textSecondary },
  rowSound: { fontSize: 11, color: T.colors.textMuted, marginTop: 4 },
  rowTime: { fontSize: 11, color: T.colors.textMuted, marginTop: 6 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: T.colors.surface,
    borderRadius: 16,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: T.colors.text, marginBottom: 8 },
  modalBody: { fontSize: 14, color: T.colors.textSecondary, lineHeight: 20, marginBottom: 12 },
  modalLine: { fontSize: 13, color: T.colors.text, marginBottom: 6 },
  modalPending: {
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    backgroundColor: T.colors.warningLight,
  },
  modalPendingText: { color: T.colors.warning, fontSize: 13, fontWeight: '600' },
});
