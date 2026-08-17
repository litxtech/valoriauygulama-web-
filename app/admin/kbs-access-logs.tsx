import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme as T } from '@/constants/adminTheme';
import {
  fetchKbsDocumentAccessEvents,
  formatKbsAccessDwell,
  kbsAccessActorLabel,
  KBS_ACCESS_EVENT_LABELS,
  KBS_ACCESS_REASON_LABELS,
  type KbsDocumentAccessEventRow,
  type KbsAccessEventType,
} from '@/lib/kbsDocumentAccessLog';

const FILTERS: { key: 'all' | KbsAccessEventType; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'view_close', label: 'Bakış' },
  { key: 'image_zoom', label: 'Zoom' },
  { key: 'pdf_share', label: 'PDF' },
  { key: 'field_copy', label: 'Kopya' },
  { key: 'screenshot', label: 'Ekran' },
  { key: 'notify', label: 'Bildir' },
  { key: 'assign_room', label: 'Oda' },
  { key: 'manual_edit', label: 'Düzeltme' },
];

const ROLE_TR: Record<string, string> = {
  admin: 'Yönetici',
  manager: 'Müdür',
  reception: 'Resepsiyon',
  reception_chief: 'Resepsiyon şefi',
  housekeeping: 'Kat hizmetleri',
  kitchen: 'Mutfak',
  technical: 'Teknik',
  security: 'Güvenlik',
  staff: 'Personel',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function guestLine(item: KbsDocumentAccessEventRow): string {
  const guest = item.guest_name_snapshot?.trim() || 'İsimsiz belge';
  const doc = item.document_number_snapshot?.trim();
  return doc ? `${guest} · ${doc}` : guest;
}

function extraMeta(item: KbsDocumentAccessEventRow): string | null {
  const meta = item.metadata;
  if (!meta) return null;
  const field = typeof meta.field === 'string' ? meta.field.trim() : '';
  if (field && field !== 'all') return `Alan: ${field}`;
  if (field === 'all' && typeof meta.count === 'number') return `${meta.count} alan kopyalandı`;
  if (typeof meta.room_key === 'string' && meta.room_key.trim()) return `Oda: ${meta.room_key}`;
  return null;
}

export default function AdminKbsAccessLogsScreen() {
  const [rows, setRows] = useState<KbsDocumentAccessEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchKbsDocumentAccessEvents(300);
    setRows(res.rows);
    setError(res.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible =
    filter === 'all'
      ? rows.filter((r) => r.event_type !== 'view_open')
      : rows.filter((r) => r.event_type === filter);

  return (
    <View style={styles.container}>
      <Text style={styles.intro}>
        Hangi personel, hangi kimlikte ne yaptı: bakış süresi, zoom, kopya, PDF, bildir, ekran görüntüsü.
      </Text>
      {error ? <Text style={styles.error}>Kayıtlar okunamadı: {error}</Text> : null}
      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(i) => i.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        style={styles.filterList}
        renderItem={({ item }) => {
          const on = filter === item.key;
          return (
            <Pressable onPress={() => setFilter(item.key)} style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{item.label}</Text>
            </Pressable>
          );
        }}
      />
      <FlatList
        data={visible}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {loading
              ? 'Yükleniyor…'
              : error
                ? 'Liste alınamadı'
                : 'Henüz erişim kaydı yok.\nBir kimlik detayını açıp çıkınca burada görünür.'}
          </Text>
        }
        renderItem={({ item }) => {
          const who = kbsAccessActorLabel(item);
          const action = KBS_ACCESS_EVENT_LABELS[item.event_type] ?? item.event_type;
          const dwell = item.event_type === 'view_close' ? formatKbsAccessDwell(item.dwell_ms) : null;
          const reason = item.reason_code ? KBS_ACCESS_REASON_LABELS[item.reason_code] : null;
          const role = item.actor_staff_role ? ROLE_TR[item.actor_staff_role] ?? item.actor_staff_role : null;
          const extra = extraMeta(item);
          return (
            <View style={styles.row}>
              <View style={styles.rowTop}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(who)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.who}>{who}</Text>
                  {role ? <Text style={styles.role}>{role}</Text> : null}
                </View>
                <View style={styles.actionPill}>
                  <Text style={styles.actionPillText}>{action}</Text>
                </View>
              </View>
              <View style={styles.guestRow}>
                <Ionicons name="id-card-outline" size={15} color={T.colors.textMuted} />
                <Text style={styles.guest}>{guestLine(item)}</Text>
              </View>
              {extra ? <Text style={styles.extra}>{extra}</Text> : null}
              <Text style={styles.meta}>
                {new Date(item.created_at).toLocaleString('tr-TR')}
                {dwell ? ` · Kaldığı süre: ${dwell}` : ''}
                {reason ? ` · ${reason}` : ''}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.surfaceSecondary },
  intro: {
    marginHorizontal: 16,
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
    color: T.colors.textMuted,
    lineHeight: 18,
  },
  error: {
    marginHorizontal: 16,
    marginTop: 8,
    fontSize: 12,
    fontWeight: '700',
    color: T.colors.error,
  },
  filterList: { flexGrow: 0, marginTop: 10 },
  filters: { paddingHorizontal: 12, gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: T.colors.surface,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  chipOn: { backgroundColor: T.colors.primary, borderColor: T.colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: T.colors.textSecondary },
  chipTextOn: { color: '#fff' },
  content: { padding: 16, paddingBottom: 32 },
  empty: {
    textAlign: 'center',
    paddingVertical: 28,
    fontSize: 14,
    fontWeight: '600',
    color: T.colors.textMuted,
    lineHeight: 20,
  },
  row: {
    backgroundColor: T.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.colors.border,
    padding: 14,
    marginBottom: 10,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: T.colors.warningLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 13, fontWeight: '800', color: T.colors.text },
  who: { fontSize: 16, fontWeight: '800', color: T.colors.text },
  role: { fontSize: 12, fontWeight: '600', color: T.colors.textMuted, marginTop: 2 },
  actionPill: {
    backgroundColor: T.colors.surfaceTertiary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: 140,
  },
  actionPillText: { fontSize: 11, fontWeight: '800', color: T.colors.textSecondary },
  guestRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  guest: { flex: 1, fontSize: 14, fontWeight: '700', color: T.colors.text, lineHeight: 19 },
  extra: { marginTop: 4, fontSize: 12, fontWeight: '600', color: T.colors.textSecondary },
  meta: { marginTop: 8, fontSize: 12, fontWeight: '600', color: T.colors.textMuted },
});
