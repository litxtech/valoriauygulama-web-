import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard, AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import {
  fetchAccountingActivityFeed,
  type AccountingActivityItem,
} from '@/lib/accountingActivityFeed';

type SourceFilter = 'all' | AccountingActivityItem['source'];

const SOURCE_LABELS: Record<AccountingActivityItem['source'], string> = {
  movement: 'Defter',
  staff_expense: 'Personel harc.',
  check: 'Çek',
  debt_payment: 'Borç ödeme',
};

export default function AccountingActivityIndex() {
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const [rows, setRows] = useState<AccountingActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  const orgFilter = useMemo(() => {
    if (me?.app_permissions?.super_admin === true || me?.role === 'admin') {
      return selectedOrganizationId;
    }
    return me?.organization_id ?? 'all';
  }, [me, selectedOrganizationId]);

  const load = useCallback(async () => {
    if (!orgFilter || orgFilter === 'all') {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const feed = await fetchAccountingActivityFeed(orgFilter, 50);
    setRows(feed);
    setLoading(false);
  }, [orgFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const filtered = useMemo(() => {
    let list = rows;
    if (sourceFilter !== 'all') list = list.filter((r) => r.source === sourceFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.subtitle.toLowerCase().includes(q) ||
          r.amountLabel.toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, sourceFilter, search]);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={styles.backHub} onPress={() => router.push('/admin/accounting')} activeOpacity={0.8}>
          <Ionicons name="calculator-outline" size={18} color={adminTheme.colors.primary} />
          <Text style={styles.backHubText}>Muhasebe özet</Text>
        </TouchableOpacity>

        <AdminOrganizationPicker
          canUseAll={me?.app_permissions?.super_admin === true || me?.role === 'admin'}
          ownOrganizationId={me?.organization_id}
        />

        {(!orgFilter || orgFilter === 'all') && (
          <Text style={styles.empty}>Liste için üstten tek bir işletme seçin.</Text>
        )}

        {orgFilter && orgFilter !== 'all' && (
          <>
            <Text style={styles.hint}>
              Gelir, gider, personel harcaması, çek ve borç ödemeleri — seçili işletmenin tüm kayıtları.
            </Text>

            <TextInput
              style={styles.search}
              placeholder="Ara…"
              placeholderTextColor={adminTheme.colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
              <TouchableOpacity
                style={[styles.chip, sourceFilter === 'all' && styles.chipOn]}
                onPress={() => setSourceFilter('all')}
              >
                <Text style={[styles.chipText, sourceFilter === 'all' && styles.chipTextOn]}>Tümü</Text>
              </TouchableOpacity>
              {(Object.keys(SOURCE_LABELS) as AccountingActivityItem['source'][]).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, sourceFilter === s && styles.chipOn]}
                  onPress={() => setSourceFilter(s)}
                >
                  <Text style={[styles.chipText, sourceFilter === s && styles.chipTextOn]}>
                    {SOURCE_LABELS[s]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {loading && !refreshing ? (
              <View style={styles.loadingInline}>
                <ActivityIndicator color={adminTheme.colors.accent} />
                <Text style={styles.loadingInlineText}>Liste yükleniyor…</Text>
              </View>
            ) : null}

            <Text style={styles.count}>{loading ? '…' : `${filtered.length} kayıt`}</Text>

            {!loading && filtered.length === 0 ? (
              <Text style={styles.empty}>Kayıt yok.</Text>
            ) : null}
            {!loading
              ? filtered.map((a) => (
                  <TouchableOpacity key={a.id} onPress={() => router.push(a.href)} activeOpacity={0.85}>
                    <AdminCard style={styles.card}>
                      <View style={styles.cardTop}>
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{SOURCE_LABELS[a.source]}</Text>
                        </View>
                        <Text
                          style={[styles.amt, a.direction === 'in' ? styles.amtIn : styles.amtOut]}
                        >
                          {a.amountLabel}
                        </Text>
                      </View>
                      <Text style={styles.title} numberOfLines={2}>
                        {a.title}
                      </Text>
                      <Text style={styles.sub} numberOfLines={3}>
                        {a.subtitle}
                      </Text>
                    </AdminCard>
                  </TouchableOpacity>
                ))
              : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backHub: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  backHubText: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.primary },
  hint: { fontSize: 13, color: adminTheme.colors.textMuted, marginBottom: 12, lineHeight: 18 },
  search: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: adminTheme.colors.text,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginBottom: 10,
  },
  chips: { marginBottom: 10 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  chipOn: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  chipText: { fontSize: 13, color: adminTheme.colors.text },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  count: { fontSize: 12, color: adminTheme.colors.textMuted, marginBottom: 10 },
  loadingInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 24,
    justifyContent: 'center',
  },
  loadingInlineText: { fontSize: 14, color: adminTheme.colors.textMuted },
  empty: { textAlign: 'center', color: adminTheme.colors.textMuted, marginTop: 24 },
  card: { marginBottom: 10, padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  badge: {
    backgroundColor: adminTheme.colors.surfaceSecondary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: adminTheme.colors.textMuted },
  amt: { fontSize: 15, fontWeight: '800' },
  amtIn: { color: '#16a34a' },
  amtOut: { color: '#dc2626' },
  title: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.text },
  sub: { fontSize: 13, color: adminTheme.colors.textMuted, marginTop: 4 },
});
