import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard, AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { fmtMoneyTry, debtOrgPerspectiveLine, monthKey, monthLabelTr } from '@/lib/financeLedger';
import { DEBT_STATUS_LABELS, type DebtStatus } from '@/lib/finance';
import { fetchAccountingHubSummary } from '@/lib/accountingSummary';
import { organizationKindLabel } from '@/lib/organizationKinds';

type Summary = {
  incomeMonth: number;
  expenseMonth: number;
  staffExpenseMonth: number;
  openReceivable: number;
  openPayable: number;
  movementCountMonth: number;
};

type DebtSnap = {
  id: string;
  borrower_is_organization: boolean;
  lender_is_organization: boolean;
  amount_remaining: number;
  status: DebtStatus;
  description: string;
  borrower?: { full_name: string | null } | null;
  lender?: { full_name: string | null } | null;
};

const QUICK: { href: Href; icon: keyof typeof Ionicons.glyphMap; label: string; sub: string; color: string }[] = [
  {
    href: '/admin/accounting/movements/new?kind=expense',
    icon: 'remove-circle-outline',
    label: 'Gider',
    sub: 'Para çıktı',
    color: '#dc2626',
  },
  {
    href: '/admin/accounting/movements/new?kind=income',
    icon: 'add-circle-outline',
    label: 'Gelir',
    sub: 'Para girdi',
    color: '#16a34a',
  },
  {
    href: '/admin/debts/new',
    icon: 'swap-horizontal-outline',
    label: 'Borç / alacak',
    sub: 'Açık hesap',
    color: '#0d9488',
  },
  {
    href: '/admin/finance-checks/new',
    icon: 'document-text-outline',
    label: 'Çek',
    sub: 'Çek kaydı',
    color: '#0369a1',
  },
];

const LINKS: { href: Href; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { href: '/admin/payments', icon: 'card-outline', label: 'Stripe ödemeler (bahşiş / mutfak / otel)' },
  { href: '/admin/accounting/activity', icon: 'time-outline', label: 'Son işlemler (tüm kayıtlar)' },
  { href: '/admin/accounting/movements', icon: 'list-outline', label: 'Tüm ödemeler' },
  {
    href: '/admin/accounting/counterparties',
    icon: 'people-outline',
    label: 'Kişi ödemeleri (usta, şahsi…)',
  },
  {
    href: '/admin/accounting/bank-import',
    icon: 'cloud-upload-outline',
    label: 'Banka ekstresi içe aktar (MT940/CSV)',
  },
  { href: '/admin/accounting/categories', icon: 'pricetags-outline', label: 'Gider / gelir kategorileri' },
  { href: '/admin/debts', icon: 'swap-horizontal-outline', label: 'Borç / alacak listesi' },
  { href: '/admin/finance-checks', icon: 'document-text-outline', label: 'Çek takibi' },
  { href: '/admin/expenses', icon: 'wallet-outline', label: 'Personel harcamaları' },
  { href: '/admin/salary', icon: 'cash-outline', label: 'Maaş yönetimi' },
];

export default function AccountingHub() {
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const organizations = useAdminOrgStore((s) => s.organizations);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<Summary>({
    incomeMonth: 0,
    expenseMonth: 0,
    staffExpenseMonth: 0,
    openReceivable: 0,
    openPayable: 0,
    movementCountMonth: 0,
  });
  const [recentDebts, setRecentDebts] = useState<DebtSnap[]>([]);

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

  const ym = monthKey();

  const load = useCallback(async () => {
    if (!orgFilter || orgFilter === 'all') {
      setSummary({
        incomeMonth: 0,
        expenseMonth: 0,
        staffExpenseMonth: 0,
        openReceivable: 0,
        openPayable: 0,
        movementCountMonth: 0,
      });
      setRecentDebts([]);
      setSummaryLoading(false);
      return;
    }

    setSummaryLoading(true);
    const monthStart = `${ym}-01`;
    const nextMonth = new Date(parseInt(ym.slice(0, 4), 10), parseInt(ym.slice(5, 7), 10), 1);
    const monthEnd = nextMonth.toISOString().slice(0, 10);

    const [hub, debtRes] = await Promise.all([
      fetchAccountingHubSummary(orgFilter, monthStart, monthEnd),
      supabase
        .from('staff_debt_entries')
        .select(
          `
          id,
          borrower_is_organization,
          lender_is_organization,
          amount_remaining,
          status,
          description,
          borrower:borrower_staff_id(full_name),
          lender:lender_staff_id(full_name)
        `
        )
        .eq('organization_id', orgFilter)
        .in('status', ['open', 'partial'])
        .order('updated_at', { ascending: false })
        .limit(8),
    ]);

    setSummary({
      incomeMonth: hub.income,
      expenseMonth: hub.expense,
      staffExpenseMonth: hub.staffExpense,
      openReceivable: hub.openReceivable,
      openPayable: hub.openPayable,
      movementCountMonth: hub.movementCount,
    });
    setRecentDebts(((debtRes.data ?? []) as unknown as DebtSnap[]) ?? []);
    setSummaryLoading(false);
  }, [orgFilter, ym]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const totalExpenseMonth = summary.expenseMonth + summary.staffExpenseMonth;
  const netMonth = summary.incomeMonth - totalExpenseMonth;

  const needOrg = !orgFilter || orgFilter === 'all';

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.breadcrumb}>
          <Ionicons name="calculator-outline" size={18} color={adminTheme.colors.primary} />
          <Text style={styles.breadcrumbText}>Muhasebe</Text>
        </View>

        <AdminOrganizationPicker
          canUseAll={me?.app_permissions?.super_admin === true || me?.role === 'admin'}
          ownOrganizationId={me?.organization_id}
        />

        {needOrg ? (
          <AdminCard style={styles.hintCard}>
            <Text style={styles.hintTitle}>İşletme seçin</Text>
            <Text style={styles.hintBody}>
              Özet ve kayıt için üstten tek bir işletme seçin (Tümü değil).
            </Text>
          </AdminCard>
        ) : (
          <>
            {selectedOrg ? (
              <AdminCard style={styles.orgBanner}>
                <Text style={styles.orgBannerName}>{selectedOrg.name}</Text>
                <Text style={styles.orgBannerKind}>{organizationKindLabel(selectedOrg.kind)}</Text>
                <Text style={styles.orgBannerHint}>
                  Bu işletmenin gelir, gider, personel harcaması, çek ve borç kayıtları aşağıda.
                </Text>
                <Text style={styles.orgBannerPdf}>
                  PDF başlığı:{' '}
                  <Text style={styles.orgBannerPdfVal}>
                    {selectedOrg.finance_report_brand?.trim() || selectedOrg.name}
                  </Text>
                  {selectedOrg.finance_report_brand?.trim() ? '' : ' (işletme adı)'}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: '/admin/organizations/[id]',
                      params: { id: selectedOrg.id },
                    } as never)
                  }
                  activeOpacity={0.85}
                >
                  <Text style={styles.orgBannerLink}>Belge başlığını değiştir →</Text>
                </TouchableOpacity>
              </AdminCard>
            ) : null}

            <Text style={styles.sectionLabel}>{monthLabelTr(ym)} özeti</Text>
            {summaryLoading ? (
              <View style={styles.summarySkeleton}>
                <ActivityIndicator color={adminTheme.colors.accent} />
                <Text style={styles.summarySkeletonText}>Özet yükleniyor…</Text>
              </View>
            ) : null}
            <View style={[styles.summaryRow, summaryLoading && styles.summaryDim]}>
              <AdminCard style={[styles.summaryCard, styles.summaryIncome]}>
                <Text style={styles.summaryLabel}>Gelir</Text>
                <Text style={styles.summaryAmt}>
                  {summaryLoading ? '—' : fmtMoneyTry(summary.incomeMonth)}
                </Text>
              </AdminCard>
              <AdminCard style={[styles.summaryCard, styles.summaryExpense]}>
                <Text style={styles.summaryLabel}>Gider (defter)</Text>
                <Text style={styles.summaryAmt}>
                  {summaryLoading ? '—' : fmtMoneyTry(summary.expenseMonth)}
                </Text>
              </AdminCard>
            </View>
            {!summaryLoading && summary.staffExpenseMonth > 0 ? (
              <AdminCard style={styles.staffExpCard}>
                <Text style={styles.summaryLabel}>Personel harcaması (bu ay)</Text>
                <Text style={styles.staffExpAmt}>{fmtMoneyTry(summary.staffExpenseMonth)}</Text>
              </AdminCard>
            ) : null}
            <AdminCard style={[styles.netCard, summaryLoading && styles.summaryDim]}>
              <Text style={styles.netLabel}>Net (bu ay, tüm giderler)</Text>
              <Text style={[styles.netAmt, !summaryLoading && netMonth < 0 && styles.netNeg]}>
                {summaryLoading ? '—' : fmtMoneyTry(netMonth)}
              </Text>
              <Text style={styles.netMeta}>
                {summaryLoading
                  ? 'Hesaplanıyor…'
                  : `${summary.movementCountMonth} defter hareketi · toplam gider ${fmtMoneyTry(totalExpenseMonth)}`}
              </Text>
            </AdminCard>

            <View style={[styles.summaryRow, summaryLoading && styles.summaryDim]}>
              <AdminCard style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Tahsil edilecek</Text>
                <Text style={[styles.summaryAmt, { color: '#16a34a' }]}>
                  {summaryLoading ? '—' : fmtMoneyTry(summary.openReceivable)}
                </Text>
              </AdminCard>
              <AdminCard style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Ödenecek</Text>
                <Text style={[styles.summaryAmt, { color: '#dc2626' }]}>
                  {summaryLoading ? '—' : fmtMoneyTry(summary.openPayable)}
                </Text>
              </AdminCard>
            </View>

            <TouchableOpacity
              style={styles.personPayBtn}
              onPress={() => router.push('/admin/accounting/quick-pay')}
              activeOpacity={0.88}
              disabled={needOrg}
            >
              <View style={styles.personPayIcon}>
                <Ionicons name="people" size={30} color="#fff" />
              </View>
              <View style={styles.activityBtnBody}>
                <Text style={styles.personPayTitle}>Kişi ödemeleri</Text>
                <Text style={styles.personPaySub}>
                  Usta, tedarikçi, şahsi kişi — kime ne ödediğiniz; isme dokunun, detayı görün
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bankImportBtn}
              onPress={() => router.push('/admin/accounting/bank-import')}
              activeOpacity={0.88}
              disabled={needOrg}
            >
              <Ionicons name="cloud-upload-outline" size={24} color="#0f766e" />
              <View style={styles.activityBtnBody}>
                <Text style={styles.bankImportTitle}>Banka ekstresi yükle</Text>
                <Text style={styles.bankImportSub}>MT940 / CSV dosyasından otomatik kişi ödemeleri</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="#0f766e" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.activityBtn}
              onPress={() => router.push('/admin/accounting/activity')}
              activeOpacity={0.88}
              disabled={needOrg}
            >
              <View style={styles.activityBtnIcon}>
                <Ionicons name="time-outline" size={28} color="#7c3aed" />
              </View>
              <View style={styles.activityBtnBody}>
                <Text style={styles.activityBtnTitle}>Son işlemler</Text>
                <Text style={styles.activityBtnSub}>
                  Gelir, gider, harcama, çek, borç ödemesi — liste halinde
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={adminTheme.colors.textMuted} />
            </TouchableOpacity>

            <Text style={styles.sectionLabel}>Hızlı işlem</Text>
            <View style={styles.quickGrid}>
              {QUICK.map((q) => (
                <TouchableOpacity
                  key={q.label}
                  style={styles.quickBtn}
                  onPress={() => router.push(q.href)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.quickIcon, { backgroundColor: q.color + '18' }]}>
                    <Ionicons name={q.icon} size={26} color={q.color} />
                  </View>
                  <Text style={styles.quickLabel}>{q.label}</Text>
                  <Text style={styles.quickSub}>{q.sub}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {recentDebts.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>Açık borç / alacak</Text>
                {recentDebts.map((d) => {
                  const bName = d.borrower_is_organization
                    ? 'Şirket'
                    : d.borrower?.full_name?.trim() || 'Personel';
                  const lName = d.lender_is_organization
                    ? 'Şirket'
                    : d.lender?.full_name?.trim() || 'Personel';
                  const { line, tone } = debtOrgPerspectiveLine({
                    borrowerIsOrg: d.borrower_is_organization,
                    lenderIsOrg: d.lender_is_organization,
                    borrowerName: bName,
                    lenderName: lName,
                    amountRemaining: Number(d.amount_remaining),
                  });
                  return (
                    <TouchableOpacity
                      key={d.id}
                      onPress={() =>
                        router.push({ pathname: '/admin/debts/[id]', params: { id: d.id } } as never)
                      }
                      activeOpacity={0.85}
                    >
                      <AdminCard style={styles.debtCard}>
                        <Text
                          style={[
                            styles.debtLine,
                            tone === 'receivable' && styles.toneRec,
                            tone === 'payable' && styles.tonePay,
                          ]}
                          numberOfLines={2}
                        >
                          {line}
                        </Text>
                        <View style={styles.debtMeta}>
                          <Text style={styles.debtSt}>{DEBT_STATUS_LABELS[d.status]}</Text>
                          {d.description?.trim() ? (
                            <Text style={styles.debtDesc} numberOfLines={1}>
                              {d.description.trim()}
                            </Text>
                          ) : null}
                        </View>
                      </AdminCard>
                    </TouchableOpacity>
                  );
                })}
              </>
            ) : null}

            <Text style={styles.sectionLabel}>Menü</Text>
            {LINKS.map((l, i) => (
              <TouchableOpacity
                key={l.href as string}
                style={[styles.linkRow, i === LINKS.length - 1 && styles.linkRowLast]}
                onPress={() => router.push(l.href)}
                activeOpacity={0.85}
              >
                <Ionicons name={l.icon} size={22} color={adminTheme.colors.primary} />
                <Text style={styles.linkLabel}>{l.label}</Text>
                <Ionicons name="chevron-forward" size={20} color={adminTheme.colors.textMuted} />
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  breadcrumbText: { fontSize: 18, fontWeight: '700', color: adminTheme.colors.text },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: adminTheme.colors.textMuted,
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: { flex: 1, padding: 14 },
  summaryIncome: { borderLeftWidth: 3, borderLeftColor: '#16a34a' },
  summaryExpense: { borderLeftWidth: 3, borderLeftColor: '#dc2626' },
  summaryLabel: { fontSize: 12, color: adminTheme.colors.textMuted },
  summaryAmt: { fontSize: 17, fontWeight: '700', color: adminTheme.colors.text, marginTop: 4 },
  netCard: { marginTop: 10, padding: 16, alignItems: 'center' },
  netLabel: { fontSize: 13, color: adminTheme.colors.textMuted },
  netAmt: { fontSize: 22, fontWeight: '800', color: adminTheme.colors.primary, marginTop: 4 },
  netNeg: { color: '#dc2626' },
  netMeta: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 4 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickBtn: {
    width: '47%',
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickLabel: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  quickSub: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  debtCard: { marginBottom: 8, padding: 14 },
  debtLine: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.text },
  toneRec: { color: '#15803d' },
  tonePay: { color: '#b45309' },
  debtMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  debtSt: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted },
  debtDesc: { flex: 1, fontSize: 12, color: adminTheme.colors.textMuted },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: adminTheme.colors.surface,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.border,
  },
  linkRowLast: { borderBottomWidth: 0, borderRadius: 12, marginBottom: 8 },
  linkLabel: { flex: 1, fontSize: 15, color: adminTheme.colors.text },
  hintCard: { padding: 16, marginTop: 8 },
  hintTitle: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text },
  hintBody: { fontSize: 14, color: adminTheme.colors.textMuted, marginTop: 6, lineHeight: 20 },
  orgBanner: { padding: 16, marginBottom: 4, borderLeftWidth: 4, borderLeftColor: adminTheme.colors.primary },
  orgBannerName: { fontSize: 18, fontWeight: '800', color: adminTheme.colors.text },
  orgBannerKind: { fontSize: 13, color: adminTheme.colors.primary, fontWeight: '600', marginTop: 2 },
  orgBannerHint: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 8, lineHeight: 18 },
  orgBannerPdf: { fontSize: 12, color: adminTheme.colors.textSecondary, marginTop: 10 },
  orgBannerPdfVal: { fontWeight: '700', color: adminTheme.colors.text },
  orgBannerLink: {
    fontSize: 13,
    fontWeight: '600',
    color: adminTheme.colors.primary,
    marginTop: 8,
  },
  staffExpCard: { padding: 14, marginTop: 10 },
  staffExpAmt: { fontSize: 17, fontWeight: '700', color: '#b45309', marginTop: 4 },
  personPayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#7c3aed',
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  personPayIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  personPayTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  personPaySub: { fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 4, lineHeight: 18 },
  bankImportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#ecfdf5',
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  bankImportTitle: { fontSize: 16, fontWeight: '800', color: '#0f766e' },
  bankImportSub: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 4, lineHeight: 17 },
  activityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    padding: 16,
    marginTop: 0,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  activityBtnIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ede9fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityBtnBody: { flex: 1 },
  activityBtnTitle: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text },
  activityBtnSub: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 4, lineHeight: 17 },
  summarySkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  summarySkeletonText: { fontSize: 13, color: adminTheme.colors.textMuted },
  summaryDim: { opacity: 0.55 },
});
