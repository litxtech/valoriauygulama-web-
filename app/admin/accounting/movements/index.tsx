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
  fmtMoneyTry,
  MOVEMENT_KIND_LABELS,
  LEDGER_SCOPE_LABELS,
  PAYMENT_METHOD_LABELS,
  type FinanceMovementKind,
  type FinanceLedgerScope,
} from '@/lib/financeLedger';
import { resolveCategoryLabel } from '@/lib/financeCategoriesApi';
import { formatDateShort } from '@/lib/date';
import { FinanceMovementReceiptActionsById } from '@/components/admin/FinanceMovementReceiptActionsById';
import { FinanceReportExportButtons } from '@/components/admin/FinanceReportExportButtons';
import { resolveFinanceReportFooter } from '@/lib/financeCounterpartyReport';
import { footerOptsFromOrganization } from '@/lib/financeReportBranding';
import {
  fetchPaymentsLedger,
  summarizePaymentsLedger,
  buildPaymentsLedgerReportHtml,
  type PaymentLedgerRow,
} from '@/lib/financePaymentsLedgerReport';

type FilterKind = 'all' | FinanceMovementKind;
type ScopeFilter = 'all' | FinanceLedgerScope;

const PERIOD_PRESETS = [
  { id: 'this_month', label: 'Bu ay' },
  { id: 'last_month', label: 'Geçen ay' },
  { id: 'last_7', label: 'Son 7 gün' },
  { id: 'last_30', label: 'Son 30 gün' },
  { id: 'all_time', label: 'Tümü' },
] as const;

type PeriodPresetId = (typeof PERIOD_PRESETS)[number]['id'];

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getDefaultDates(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

function getPeriodDates(id: PeriodPresetId): { start: string; end: string } | null {
  const now = new Date();
  if (id === 'all_time') return null;
  if (id === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: toIsoDate(start), end: toIsoDate(end) };
  }
  if (id === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: toIsoDate(start), end: toIsoDate(end) };
  }
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - (id === 'last_7' ? 6 : 29));
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

function formatPeriodLabel(start: string | null, end: string | null): string {
  if (!start || !end) return 'Tüm dönem';
  return `${formatDateShort(start)} – ${formatDateShort(end)}`;
}

function partyLabel(r: PaymentLedgerRow): string {
  return (
    r.counterparty?.name?.trim() ||
    r.counterparty_name?.trim() ||
    r.guest?.full_name?.trim() ||
    '—'
  );
}

function paymentMethodLabel(method: string): string {
  const key = method as keyof typeof PAYMENT_METHOD_LABELS;
  return PAYMENT_METHOD_LABELS[key] ?? method;
}

function StatTile({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color?: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.statTile}>
      <View style={[styles.statIconWrap, { backgroundColor: (color ?? '#0d9488') + '18' }]}>
        <Ionicons name={icon} size={16} color={color ?? '#0d9488'} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export default function AccountingMovementsIndex() {
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const organizations = useAdminOrgStore((s) => s.organizations);
  const defaults = getDefaultDates();
  const [rows, setRows] = useState<PaymentLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [kindFilter, setKindFilter] = useState<FilterKind>('all');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [search, setSearch] = useState('');
  const [periodPreset, setPeriodPreset] = useState<PeriodPresetId>('this_month');
  const [dateStart, setDateStart] = useState(defaults.start);
  const [dateEnd, setDateEnd] = useState(defaults.end);
  const [loadError, setLoadError] = useState<string | null>(null);

  const orgFilter = useMemo(() => {
    if (me?.app_permissions?.super_admin === true || me?.role === 'admin') {
      return selectedOrganizationId;
    }
    return me?.organization_id ?? 'all';
  }, [me, selectedOrganizationId]);

  const selectedOrg = useMemo(
    () => organizations.find((o) => o.id === orgFilter),
    [organizations, orgFilter]
  );

  const periodLabel = formatPeriodLabel(
    periodPreset === 'all_time' ? null : dateStart,
    periodPreset === 'all_time' ? null : dateEnd
  );

  const load = useCallback(async () => {
    if (!orgFilter) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchPaymentsLedger({
        organizationId: orgFilter,
        dateStart: periodPreset === 'all_time' ? null : dateStart,
        dateEnd: periodPreset === 'all_time' ? null : dateEnd,
        limit: 500,
      });
      setRows(data);
    } catch (e) {
      setRows([]);
      setLoadError((e as Error).message || 'Kayıtlar yüklenemedi');
    }
    setLoading(false);
  }, [orgFilter, dateStart, dateEnd, periodPreset]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const applyPreset = (id: PeriodPresetId) => {
    setPeriodPreset(id);
    const range = getPeriodDates(id);
    if (range) {
      setDateStart(range.start);
      setDateEnd(range.end);
    }
  };

  const filtered = useMemo(() => {
    let list = rows;
    if (kindFilter !== 'all') list = list.filter((r) => r.kind === kindFilter);
    if (scopeFilter !== 'all') list = list.filter((r) => r.ledger_scope === scopeFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const who = partyLabel(r).toLowerCase();
        const desc = (r.description || '').toLowerCase();
        const cat = resolveCategoryLabel(r.category).toLowerCase();
        const plan = (r.agreement?.title || '').toLowerCase();
        const pay = paymentMethodLabel(r.payment_method).toLowerCase();
        return who.includes(q) || desc.includes(q) || cat.includes(q) || plan.includes(q) || pay.includes(q);
      });
    }
    return list;
  }, [rows, kindFilter, scopeFilter, search]);

  const stats = useMemo(() => summarizePaymentsLedger(filtered), [filtered]);

  const hasActiveFilters =
    kindFilter !== 'all' || scopeFilter !== 'all' || Boolean(search.trim()) || periodPreset !== 'all_time';

  const grouped = useMemo(() => {
    const map = new Map<string, PaymentLedgerRow[]>();
    for (const r of filtered) {
      const key = r.movement_date;
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const reportFooter = resolveFinanceReportFooter(footerOptsFromOrganization(selectedOrg));
  const scopeLabelForReport =
    scopeFilter === 'all' ? 'Tüm kapsamlar' : LEDGER_SCOPE_LABELS[scopeFilter];

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

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

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="receipt-outline" size={28} color="#0f766e" />
          </View>
          <View style={styles.heroBody}>
            <Text style={styles.heroTitle}>Tüm ödemeler</Text>
            <Text style={styles.heroSub}>
              Gelir, gider ve tahsilat kayıtları — PDF, yazdırma ve e-posta ile dışa aktarın.
            </Text>
          </View>
        </View>

        <AdminOrganizationPicker
          canUseAll={me?.app_permissions?.super_admin === true || me?.role === 'admin'}
          ownOrganizationId={me?.organization_id}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.periodRow}>
          {PERIOD_PRESETS.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.periodChip, periodPreset === p.id && styles.periodChipOn]}
              onPress={() => applyPreset(p.id)}
            >
              <Text style={[styles.periodChipText, periodPreset === p.id && styles.periodChipTextOn]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.periodLabel}>{periodLabel}</Text>

        {orgFilter ? (
          <View style={styles.statsGrid}>
            <StatTile label="Kayıt" value={String(stats.count)} icon="layers-outline" />
            <StatTile
              label="Toplam ödenen"
              value={fmtMoneyTry(stats.expense)}
              color="#dc2626"
              icon="arrow-down-circle-outline"
            />
            <StatTile
              label="Toplam alınan"
              value={fmtMoneyTry(stats.income)}
              color="#16a34a"
              icon="arrow-up-circle-outline"
            />
            <StatTile
              label="Net"
              value={fmtMoneyTry(stats.net)}
              color={stats.net >= 0 ? '#16a34a' : '#dc2626'}
              icon="analytics-outline"
            />
          </View>
        ) : null}

        {filtered.length > 0 && orgFilter ? (
          <AdminCard style={styles.exportCard}>
            <Text style={styles.exportTitle}>Rapor dışa aktar</Text>
            <Text style={styles.exportHint}>
              PDF paylaş, yazıcıya gönder, e-posta veya WhatsApp ile ilet.
            </Text>
            <FinanceReportExportButtons
              fileName="tum-odemeler"
              mailSubject={`Tüm ödemeler — ${periodLabel}`}
              shareDialogTitle="Ödeme geçmişi raporu"
              defaultKindFilter="all"
              getHtml={(kind) =>
                buildPaymentsLedgerReportHtml({
                  rows: filtered,
                  periodLabel,
                  scopeLabel: scopeLabelForReport,
                  footer: reportFooter,
                  kindFilter: kind,
                })
              }
            />
          </AdminCard>
        ) : null}

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.expenseBtn]}
            onPress={() => router.push('/admin/accounting/movements/new?kind=expense' as never)}
          >
            <Ionicons name="remove-circle" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>Gider</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.incomeBtn]}
            onPress={() => router.push('/admin/accounting/movements/new?kind=income' as never)}
          >
            <Ionicons name="add-circle" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>Gelir</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.quickPayBtn]}
            onPress={() => router.push('/admin/accounting/quick-pay' as never)}
          >
            <Ionicons name="flash" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>Hızlı öde</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={20} color={adminTheme.colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Kişi, kategori, açıklama, ödeme yöntemi…"
            placeholderTextColor={adminTheme.colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
          <View style={styles.chips}>
            {(['all', 'expense', 'income'] as const).map((k) => (
              <TouchableOpacity
                key={k}
                style={[styles.chip, kindFilter === k && styles.chipOn]}
                onPress={() => setKindFilter(k)}
              >
                <Text style={[styles.chipText, kindFilter === k && styles.chipTextOn]}>
                  {k === 'all' ? 'Tümü' : MOVEMENT_KIND_LABELS[k]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
          <View style={styles.chips}>
            {(
              [
                { key: 'all', label: 'Tüm kapsam' },
                { key: 'hotel', label: LEDGER_SCOPE_LABELS.hotel },
                { key: 'personal', label: LEDGER_SCOPE_LABELS.personal },
              ] as const
            ).map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.chip, scopeFilter === f.key && styles.chipScopeOn]}
                onPress={() => setScopeFilter(f.key)}
              >
                <Text style={[styles.chipText, scopeFilter === f.key && styles.chipTextOn]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <TouchableOpacity
          style={styles.otherLink}
          onPress={() => router.push('/admin/accounting/activity' as never)}
          activeOpacity={0.85}
        >
          <Ionicons name="git-merge-outline" size={18} color={adminTheme.colors.primary} />
          <Text style={styles.otherLinkText}>
            Personel harcaması, çek ve borç ödemeleri → Son işlemler
          </Text>
          <Ionicons name="chevron-forward" size={16} color={adminTheme.colors.textMuted} />
        </TouchableOpacity>

        {orgFilter === 'all' ? (
          <Text style={styles.emptyHint}>
            Tüm işletmeler seçili — kayıtlar birleştirilmiş listede gösterilir.
          </Text>
        ) : null}

        {loadError ? <Text style={styles.loadError}>{loadError}</Text> : null}

        {!orgFilter && (
          <Text style={styles.empty}>Liste için işletme seçin.</Text>
        )}

        {orgFilter && filtered.length === 0 && !loadError && (
          <Text style={styles.empty}>
            {hasActiveFilters
              ? `Filtreye uygun kayıt yok${rows.length > 0 ? ` (${rows.length} kayıt bu dönemde)` : ''}`
              : 'Bu dönemde kayıt yok. Gider, gelir veya hızlı ödeme ekleyin.'}
          </Text>
        )}

        {grouped.map(([dateKey, dayRows]) => (
          <View key={dateKey} style={styles.dayGroup}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayTitle}>{formatDateShort(dateKey)}</Text>
              <Text style={styles.dayCount}>{dayRows.length} kayıt</Text>
            </View>
            {dayRows.map((r) => {
              const isIn = r.kind === 'income';
              const plan = r.agreement?.title?.trim();
              return (
                <AdminCard key={r.id} style={styles.card}>
                  <TouchableOpacity
                    onPress={() =>
                      router.push({ pathname: '/admin/accounting/movements/[id]', params: { id: r.id } } as never)
                    }
                    activeOpacity={0.85}
                  >
                    <View style={styles.cardTop}>
                      <View
                        style={[
                          styles.kindBadge,
                          isIn ? styles.kindIncome : styles.kindExpense,
                        ]}
                      >
                        <Text style={[styles.kindBadgeText, isIn ? styles.kindTextIn : styles.kindTextOut]}>
                          {isIn ? 'Alınan' : 'Ödenen'}
                        </Text>
                      </View>
                      <Text style={[styles.amount, isIn ? styles.amountIn : styles.amountOut]}>
                        {isIn ? '+' : '−'}
                        {fmtMoneyTry(r.amount)}
                      </Text>
                    </View>
                    <Text style={styles.partyName}>{partyLabel(r)}</Text>
                    <Text style={styles.metaLine}>
                      {resolveCategoryLabel(r.category)}
                      {' · '}
                      {LEDGER_SCOPE_LABELS[r.ledger_scope]}
                      {' · '}
                      {paymentMethodLabel(r.payment_method)}
                    </Text>
                    {plan ? (
                      <View style={styles.planTag}>
                        <Ionicons name="document-text-outline" size={12} color="#0369a1" />
                        <Text style={styles.planTagText}>{plan}</Text>
                      </View>
                    ) : null}
                    {r.description?.trim() ? (
                      <Text style={styles.desc} numberOfLines={2}>
                        {r.description.trim()}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                  {r.kind === 'expense' ? <FinanceMovementReceiptActionsById movementId={r.id} /> : null}
                </AdminCard>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backHub: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  backHubText: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.primary },
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#ecfdf5',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBody: { flex: 1 },
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#0f766e' },
  heroSub: { fontSize: 13, color: '#64748b', marginTop: 4, lineHeight: 18 },
  periodRow: { marginBottom: 6, maxHeight: 40 },
  periodChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginRight: 8,
  },
  periodChipOn: { backgroundColor: '#0d9488', borderColor: '#0d9488' },
  periodChipText: { fontSize: 13, color: adminTheme.colors.text },
  periodChipTextOn: { color: '#fff', fontWeight: '700' },
  periodLabel: { fontSize: 12, color: adminTheme.colors.textMuted, marginBottom: 12 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  statTile: {
    width: '48%',
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statLabel: { fontSize: 11, color: adminTheme.colors.textMuted, fontWeight: '600' },
  statValue: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text, marginTop: 2 },
  exportCard: { marginBottom: 14, padding: 14 },
  exportTitle: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text, marginBottom: 4 },
  exportHint: { fontSize: 12, color: adminTheme.colors.textMuted, marginBottom: 10, lineHeight: 17 },
  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
  },
  expenseBtn: { backgroundColor: '#dc2626' },
  incomeBtn: { backgroundColor: '#16a34a' },
  quickPayBtn: { backgroundColor: '#7c3aed' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    color: adminTheme.colors.text,
  },
  chipsScroll: { marginBottom: 8, maxHeight: 44 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  chipOn: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  chipScopeOn: { backgroundColor: '#0d9488', borderColor: '#0d9488' },
  chipText: { fontSize: 13, color: adminTheme.colors.text },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  otherLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    marginBottom: 14,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  otherLinkText: { flex: 1, fontSize: 12, color: adminTheme.colors.text, lineHeight: 17 },
  empty: { textAlign: 'center', color: adminTheme.colors.textMuted, marginTop: 24, marginBottom: 12 },
  emptyHint: {
    textAlign: 'center',
    color: adminTheme.colors.textMuted,
    fontSize: 12,
    marginBottom: 8,
    lineHeight: 17,
  },
  loadError: {
    textAlign: 'center',
    color: '#b91c1c',
    fontSize: 13,
    marginBottom: 12,
    paddingHorizontal: 8,
    lineHeight: 18,
  },
  dayGroup: { marginBottom: 8 },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  dayTitle: { fontSize: 14, fontWeight: '800', color: adminTheme.colors.text },
  dayCount: { fontSize: 12, color: adminTheme.colors.textMuted },
  card: { marginBottom: 8, padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  kindBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  kindIncome: { backgroundColor: '#dcfce7' },
  kindExpense: { backgroundColor: '#fee2e2' },
  kindBadgeText: { fontSize: 11, fontWeight: '800' },
  kindTextIn: { color: '#15803d' },
  kindTextOut: { color: '#b91c1c' },
  amount: { fontSize: 17, fontWeight: '800' },
  amountIn: { color: '#16a34a' },
  amountOut: { color: '#dc2626' },
  partyName: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  metaLine: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 4 },
  planTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  planTagText: { fontSize: 11, fontWeight: '600', color: '#0369a1' },
  desc: { fontSize: 13, color: adminTheme.colors.textMuted, marginTop: 6 },
});
