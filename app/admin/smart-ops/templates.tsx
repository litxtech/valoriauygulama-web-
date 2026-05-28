import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import {
  fetchSmartOpsTemplates,
  toggleSmartOpsTemplate,
  SMART_OPS_ROLE_LABELS,
  SMART_OPS_CRITICAL_LABELS,
  type SmartOpsTemplateRow,
} from '@/lib/smartOps';

function TemplateRow({
  item,
  onToggle,
}: {
  item: SmartOpsTemplateRow;
  onToggle: (id: string, active: boolean) => void;
}) {
  const time = item.send_time ? String(item.send_time).slice(0, 5) : '—';
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={styles.rowTitle}>{item.title ?? item.code}</Text>
        <Switch value={item.active} onValueChange={(v) => onToggle(item.id, v)} />
      </View>
      <Text style={styles.rowMeta}>
        {time} · {SMART_OPS_ROLE_LABELS[item.target_role] ?? item.target_role} ·{' '}
        {SMART_OPS_CRITICAL_LABELS[item.critical_level] ?? item.critical_level}
      </Text>
      <Text style={styles.rowBody} numberOfLines={2}>
        {item.body}
      </Text>
      <Text style={styles.rowFoot}>
        Foto: {item.require_photo} · Son:{' '}
        {item.last_sent_at ? new Date(item.last_sent_at).toLocaleString('tr-TR') : 'Henüz yok'}
      </Text>
    </View>
  );
}

export default function AdminSmartOpsTemplates() {
  const router = useRouter();
  const { staff, canUseAll, orgScoped, canQuery } = useAdminOrganizationQueryScope();
  const [list, setList] = useState<SmartOpsTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orgScoped) {
      setList([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setList(await fetchSmartOpsTemplates(orgScoped));
    } catch {
      setList([]);
    }
    setLoading(false);
  }, [orgScoped]);

  useEffect(() => {
    load();
  }, [load]);

  const onToggle = async (id: string, active: boolean) => {
    await toggleSmartOpsTemplate(id, active);
    setList((prev) => prev.map((t) => (t.id === id ? { ...t, active } : t)));
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListHeaderComponent={
          <>
            <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={staff?.organization_id} />
            <TouchableOpacity style={styles.hubLink} onPress={() => router.push('/admin/smart-ops')}>
              <Text style={styles.hubLinkText}>← Operasyon merkezi</Text>
            </TouchableOpacity>
            {!canQuery || !orgScoped ? (
              <Text style={styles.hint}>İşletme seçin veya varsayılan şablonları yükleyin.</Text>
            ) : null}
            {loading && list.length === 0 ? <ActivityIndicator style={{ marginVertical: 24 }} /> : null}
            {!loading && list.length === 0 && orgScoped ? (
              <Text style={styles.hint}>Şablon yok. Merkez ekrandan “Varsayılan şablonları yükle”ye basın.</Text>
            ) : null}
          </>
        }
        renderItem={({ item }) => <TemplateRow item={item} onToggle={onToggle} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  list: { padding: 16, paddingBottom: 40 },
  hubLink: { marginBottom: 12 },
  hubLinkText: { color: '#2b6cb0', fontWeight: '600' },
  hint: { color: '#718096', marginBottom: 16, fontSize: 14 },
  row: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { fontSize: 16, fontWeight: '600', color: '#1a202c', flex: 1, marginRight: 8 },
  rowMeta: { fontSize: 12, color: '#4a5568', marginTop: 6 },
  rowBody: { fontSize: 13, color: '#718096', marginTop: 6 },
  rowFoot: { fontSize: 11, color: '#a0aec0', marginTop: 8 },
});
