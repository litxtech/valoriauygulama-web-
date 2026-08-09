import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { adminTheme } from '@/constants/adminTheme';
import { CounterpartyListCard } from '@/components/admin/CounterpartyListCard';
import { CounterpartyQuickPaySheet } from '@/components/admin/CounterpartyQuickPaySheet';
import {
  fetchCounterpartyBalanceMap,
  invalidateCounterpartyBalanceCache,
} from '@/lib/financeCounterpartyBalances';
import { fetchOpenDebtTotalsByCounterparty, type CounterpartyOpenDebtTotals } from '@/lib/financeCounterpartyAgreements';
import {
  mergeCounterpartyBalancesForOrgs,
  organizationNameById,
  resolveAccountingOrgScope,
} from '@/lib/accountingOrgScope';
import { normalizeCounterpartyName } from '@/lib/financeCounterpartyUi';
import type { FinanceCounterpartyType, FinanceLedgerScope } from '@/lib/financeLedger';

type Row = {
  id: string;
  organization_id: string;
  name: string;
  party_type: FinanceCounterpartyType;
  party_type_label: string | null;
  phone: string | null;
  profile_image: string | null;
};

export default function SameNameCounterpartiesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ name?: string }>();
  const targetName = typeof params.name === 'string' ? params.name : '';
  const targetKey = normalizeCounterpartyName(targetName);

  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const organizations = useAdminOrgStore((s) => s.organizations);
  const orgScope = useMemo(
    () => resolveAccountingOrgScope(me, selectedOrganizationId),
    [me, selectedOrganizationId]
  );

  const [rows, setRows] = useState<Row[]>([]);
  const [balances, setBalances] = useState<Map<string, { income: number; expense: number; net: number }>>(
    new Map()
  );
  const [openDebtTotals, setOpenDebtTotals] = useState<Map<string, CounterpartyOpenDebtTotals>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payPerson, setPayPerson] = useState<Row | null>(null);

  const load = useCallback(async () => {
    if (!orgScope || !targetKey) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let q = supabase
      .from('finance_counterparties')
      .select('id, organization_id, name, party_type, party_type_label, phone, profile_image')
      .eq('is_active', true)
      .order('name');
    if (orgScope !== 'all') q = q.eq('organization_id', orgScope);
    const { data } = await q;
    const all = (data as Row[]) ?? [];
    const matched = all.filter((r) => normalizeCounterpartyName(r.name) === targetKey);
    setRows(matched);
    const debtOrgScope = orgScope === 'all' ? 'all' : orgScope;
    void fetchOpenDebtTotalsByCounterparty(
      debtOrgScope,
      matched.map((r) => r.id)
    )
      .then(setOpenDebtTotals)
      .catch(() => setOpenDebtTotals(new Map()));
    if (orgScope === 'all') {
      setBalances(
        await mergeCounterpartyBalancesForOrgs(
          matched.map((r) => r.organization_id),
          (oid) => fetchCounterpartyBalanceMap(oid, null)
        )
      );
    } else {
      setBalances(await fetchCounterpartyBalanceMap(orgScope, null));
    }
    setLoading(false);
  }, [orgScope, targetKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayTitle = rows[0]?.name?.trim() || targetName.trim() || 'Aynı isim';

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={styles.banner}>
        <Ionicons name="people" size={22} color="#7c3aed" />
        <View style={styles.bannerBody}>
          <Text style={styles.bannerTitle} numberOfLines={2}>
            {displayTitle}
          </Text>
          <Text style={styles.bannerSub}>
            {rows.length} kayıt · Dokunarak detaya girin, ödeme ikonu ile hızlı ödeyin
          </Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={adminTheme.colors.accent} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load().finally(() => setRefreshing(false));
              }}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Bu isimde aktif kayıt bulunamadı.</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const bal = balances.get(item.id);
            return (
              <CounterpartyListCard
                id={item.id}
                name={item.name}
                party_type={item.party_type}
                party_type_label={item.party_type_label}
                phone={item.phone}
                profileImage={item.profile_image}
                income={bal?.income ?? 0}
                expense={bal?.expense ?? 0}
                net={bal?.net ?? 0}
                openDebt={openDebtTotals.get(item.id)?.remaining ?? 0}
                openedDebt={openDebtTotals.get(item.id)?.opened ?? 0}
                paidDebt={openDebtTotals.get(item.id)?.paid ?? 0}
                organizationName={
                  orgScope === 'all'
                    ? organizationNameById(item.organization_id, organizations)
                    : undefined
                }
                sameNameIndex={index + 1}
                sameNameTotal={rows.length}
                onPress={() =>
                  router.push({
                    pathname: '/admin/accounting/counterparties/[id]',
                    params: { id: item.id },
                  } as never)
                }
                onPayPress={() => setPayPerson(item)}
              />
            );
          }}
        />
      )}

      <CounterpartyQuickPaySheet
        visible={!!payPerson}
        person={payPerson}
        defaultLedgerScope={
          (payPerson?.party_type === 'private_person' ? 'personal' : 'hotel') as FinanceLedgerScope
        }
        staffId={me?.id}
        onClose={() => setPayPerson(null)}
        onSaved={() => {
          if (payPerson) invalidateCounterpartyBalanceCache(payPerson.organization_id);
          void load();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    margin: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#f5f3ff',
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },
  bannerBody: { flex: 1, minWidth: 0 },
  bannerTitle: { fontSize: 17, fontWeight: '800', color: adminTheme.colors.text },
  bannerSub: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 4, lineHeight: 17 },
  list: { paddingHorizontal: 16, paddingBottom: 28 },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: adminTheme.colors.textMuted, textAlign: 'center' },
});
