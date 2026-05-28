import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import { fetchSmartOpsLiveSummary, SMART_OPS_STATUS_LABELS, SMART_OPS_ROLE_LABELS } from '@/lib/smartOps';

export default function AdminSmartOpsLive() {
  const router = useRouter();
  const { staff, canUseAll, orgScoped, canQuery } = useAdminOrganizationQueryScope();
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, unknown>[]>([]);
  const [overdue, setOverdue] = useState<Record<string, unknown>[]>([]);
  const [done, setDone] = useState<Record<string, unknown>[]>([]);

  const load = useCallback(async () => {
    if (!orgScoped) {
      setOpen([]);
      setOverdue([]);
      setDone([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const s = await fetchSmartOpsLiveSummary(orgScoped);
      setOpen(s.open as Record<string, unknown>[]);
      setOverdue(s.overdue as Record<string, unknown>[]);
      setDone(s.done as Record<string, unknown>[]);
    } catch {
      setOpen([]);
      setOverdue([]);
      setDone([]);
    }
    setLoading(false);
  }, [orgScoped]);

  useEffect(() => {
    load();
  }, [load]);

  const renderBlock = (title: string, items: Record<string, unknown>[], accent: string) => (
    <View style={styles.block}>
      <Text style={[styles.blockTitle, { color: accent }]}>{title} ({items.length})</Text>
      {items.length === 0 ? (
        <Text style={styles.empty}>Kayıt yok</Text>
      ) : (
        items.slice(0, 30).map((r) => (
          <View key={String(r.id)} style={styles.item}>
            <Text style={styles.itemTitle}>{String(r.title ?? '—')}</Text>
            <Text style={styles.itemMeta}>
              {SMART_OPS_STATUS_LABELS[String(r.status)] ?? String(r.status)} ·{' '}
              {SMART_OPS_ROLE_LABELS[String(r.assigned_role)] ?? String(r.assigned_role)}
            </Text>
          </View>
        ))
      )}
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={staff?.organization_id} />
      <TouchableOpacity onPress={() => router.push('/admin/smart-ops')}>
        <Text style={styles.back}>← Operasyon merkezi</Text>
      </TouchableOpacity>

      {!canQuery || !orgScoped ? (
        <Text style={styles.hint}>Canlı panel için işletme seçin.</Text>
      ) : (
        <>
          <View style={styles.kpiRow}>
            <View style={[styles.kpi, { backgroundColor: '#ebf8ff' }]}>
              <Text style={styles.kpiNum}>{open.length}</Text>
              <Text style={styles.kpiLabel}>Açık</Text>
            </View>
            <View style={[styles.kpi, { backgroundColor: '#fff5f5' }]}>
              <Text style={styles.kpiNum}>{overdue.length}</Text>
              <Text style={styles.kpiLabel}>Geciken</Text>
            </View>
            <View style={[styles.kpi, { backgroundColor: '#f0fff4' }]}>
              <Text style={styles.kpiNum}>{done.length}</Text>
              <Text style={styles.kpiLabel}>Tamamlanan (24s)</Text>
            </View>
          </View>
          {renderBlock('Geciken görevler', overdue, '#c53030')}
          {renderBlock('Açık görevler', open, '#2b6cb0')}
          {renderBlock('Tamamlanan', done, '#276749')}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 16, paddingBottom: 40 },
  back: { color: '#2b6cb0', fontWeight: '600', marginBottom: 12 },
  hint: { color: '#718096', fontSize: 14 },
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  kpi: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
  kpiNum: { fontSize: 24, fontWeight: '800', color: '#1a202c' },
  kpiLabel: { fontSize: 12, color: '#4a5568', marginTop: 4 },
  block: { marginBottom: 20 },
  blockTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  empty: { color: '#a0aec0', fontSize: 13 },
  item: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#edf2f7',
  },
  itemTitle: { fontSize: 14, fontWeight: '600', color: '#2d3748' },
  itemMeta: { fontSize: 12, color: '#718096', marginTop: 4 },
});
