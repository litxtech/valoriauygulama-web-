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
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { fmtMoneyTry } from '@/lib/financeLedger';
import { formatDateShort } from '@/lib/date';
import {
  DEBT_CATEGORY_META,
  DEBT_STATUS_META,
  DEBT_TONE_STYLES,
  debtPaidPercent,
  debtPartyBorrow,
  debtPartyLend,
  debtRowPerspective,
  formatDebtPaidLine,
  isDebtOverdue,
  summarizeDebtList,
  type DebtListRow,
  type DebtTone,
} from '@/lib/debtUi';
import type { DebtStatus } from '@/lib/finance';

type StatusFilter = 'all' | DebtStatus;
type ToneFilter = 'all' | DebtTone;

export default function AdminDebtsIndex() {
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const [rows, setRows] = useState<DebtListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [toneFilter, setToneFilter] = useState<ToneFilter>('all');

  const orgFilter = useMemo(() => {
    if (me?.app_permissions?.super_admin === true || me?.role === 'admin') {
      return selectedOrganizationId;
    }
    return me?.organization_id ?? 'all';
  }, [me, selectedOrganizationId]);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('staff_debt_entries')
      .select(
        `
        id,
        organization_id,
        category,
        borrower_staff_id,
        borrower_is_organization,
        lender_staff_id,
        lender_is_organization,
        description,
        amount_principal,
        amount_remaining,
        status,
        due_date,
        created_at,
        borrower:borrower_staff_id(full_name),
        lender:lender_staff_id(full_name)
      `
      )
      .order('created_at', { ascending: false });
    if (orgFilter && orgFilter !== 'all') q = q.eq('organization_id', orgFilter);
    const { data, error } = await q;
    if (error) setRows([]);
    else setRows((((data ?? []) as unknown) as DebtListRow[]) ?? []);
    setLoading(false);
  }, [orgFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const summary = useMemo(() => summarizeDebtList(rows), [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== 'all') list = list.filter((r) => r.status === statusFilter);
    if (toneFilter !== 'all') {
      list = list.filter((r) => debtRowPerspective(r).tone === toneFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const persp = debtRowPerspective(r).line.toLowerCase();
        return (
          persp.includes(q) ||
          debtPartyBorrow(r).toLowerCase().includes(q) ||
          debtPartyLend(r).toLowerCase().includes(q) ||
          (r.description || '').toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [rows, statusFilter, toneFilter, search]);

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
        <AdminOrganizationPicker
          canUseAll={me?.app_permissions?.super_admin === true || me?.role === 'admin'}
          ownOrganizationId={me?.organization_id}
        />

        <TouchableOpacity
          style={styles.backHub}
          onPress={() => router.push('/admin/accounting')}
          activeOpacity={0.8}
        >
          <Ionicons name="calculator-outline" size={18} color={adminTheme.colors.primary} />
          <Text style={styles.backHubText}>Muhasebe özet</Text>
        </TouchableOpacity>

        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroTitle}>Borç / alacak</Text>
              <Text style={styles.heroSub}>Canlı özet · tahsilat ve ödeme takibi</Text>
            </View>
            <TouchableOpacity
              style={styles.heroAdd}
              onPress={() => router.push('/admin/debts/new')}
              activeOpacity={0.88}
            >
              <Ionicons name="add" size={26} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.statGrid}>
            <View style={[styles.statCard, styles.statRec]}>
              <Ionicons name="arrow-down-circle" size={22} color="#15803d" />
              <Text style={styles.statLbl}>Tahsil edilecek</Text>
              <Text style={[styles.statVal, styles.statValRec]}>{fmtMoneyTry(summary.receivableTotal)}</Text>
            </View>
            <View style={[styles.statCard, styles.statPay]}>
              <Ionicons name="arrow-up-circle" size={22} color="#c2410c" />
              <Text style={styles.statLbl}>Ödenecek</Text>
              <Text style={[styles.statVal, styles.statValPay]}>{fmtMoneyTry(summary.payableTotal)}</Text>
            </View>
          </View>

          <View style={styles.heroMeta}>
            <View style={styles.metaPill}>
              <Text style={styles.metaPillText}>{summary.openCount} açık</Text>
            </View>
            <View style={styles.metaPill}>
              <Text style={styles.metaPillText}>{summary.partialCount} kısmi</Text>
            </View>
            {summary.overdueCount > 0 ? (
              <View style={[styles.metaPill, styles.metaPillWarn]}>
                <Ionicons name="alert-circle" size={14} color="#b45309" />
                <Text style={[styles.metaPillText, styles.metaPillWarnText]}>
                  {summary.overdueCount} vadesi geçmiş
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={adminTheme.colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Kişi, açıklama, tutar ara…"
            placeholderTextColor={adminTheme.colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={10}>
              <Ionicons name="close-circle" size={20} color={adminTheme.colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
          <View style={styles.chipsRow}>
            {(
              [
                ['all', 'Tümü'],
                ['open', 'Açık'],
                ['partial', 'Kısmi'],
                ['closed', 'Kapalı'],
              ] as const
            ).map(([k, label]) => (
              <TouchableOpacity
                key={k}
                style={[styles.chip, statusFilter === k && styles.chipOn]}
                onPress={() => setStatusFilter(k)}
              >
                <Text style={[styles.chipText, statusFilter === k && styles.chipTextOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll2}>
          <View style={styles.chipsRow}>
            {(
              [
                ['all', 'Tüm yön'],
                ['receivable', 'Alacak'],
                ['payable', 'Borç'],
                ['internal', 'Personel↔Personel'],
              ] as const
            ).map(([k, label]) => (
              <TouchableOpacity
                key={k}
                style={[styles.chip, styles.chipTone, toneFilter === k && styles.chipOn]}
                onPress={() => setToneFilter(k)}
              >
                <Text style={[styles.chipText, toneFilter === k && styles.chipTextOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <Text style={styles.countLine}>
          {filtered.length} kayıt
          {filtered.length !== rows.length ? ` · ${rows.length} toplam` : ''}
        </Text>

        {(!orgFilter || orgFilter === 'all') && (
          <View style={styles.emptyBox}>
            <Ionicons name="business-outline" size={36} color={adminTheme.colors.textMuted} />
            <Text style={styles.emptyTitle}>İşletme seçin</Text>
            <Text style={styles.emptySub}>Liste ve özet için üstten tek işletme seçin.</Text>
          </View>
        )}

        {orgFilter && orgFilter !== 'all' && filtered.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="wallet-outline" size={36} color={adminTheme.colors.textMuted} />
            <Text style={styles.emptyTitle}>Kayıt yok</Text>
            <Text style={styles.emptySub}>Yeni borç veya alacak kaydı oluşturun.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/admin/debts/new')}>
              <Text style={styles.emptyBtnText}>Yeni kayıt</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {filtered.map((r) => {
          const { tone, line } = debtRowPerspective(r);
          const toneStyle = DEBT_TONE_STYLES[tone];
          const catMeta = DEBT_CATEGORY_META[r.category];
          const stMeta = DEBT_STATUS_META[r.status];
          const pct = debtPaidPercent(r.amount_principal, r.amount_remaining);
          const overdue = isDebtOverdue(r.due_date, r.status);

          return (
            <TouchableOpacity
              key={r.id}
              style={styles.debtCard}
              onPress={() => router.push({ pathname: '/admin/debts/[id]', params: { id: r.id } } as never)}
              activeOpacity={0.9}
            >
              <View style={[styles.stripe, { backgroundColor: toneStyle.stripe }]} />
              <View style={styles.debtBody}>
                <View style={styles.debtTop}>
                  <View style={[styles.tonePill, { backgroundColor: toneStyle.pillBg }]}>
                    <Ionicons name={toneStyle.icon} size={14} color={toneStyle.pillFg} />
                    <Text style={[styles.tonePillText, { color: toneStyle.pillFg }]}>
                      {tone === 'receivable' ? 'Alacak' : tone === 'payable' ? 'Borç' : 'İç'}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: stMeta.bg }]}>
                    <Ionicons name={stMeta.icon} size={12} color={stMeta.color} />
                    <Text style={[styles.statusPillText, { color: stMeta.color }]}>{stMeta.label}</Text>
                  </View>
                </View>

                <Text style={styles.perspectiveLine} numberOfLines={2}>
                  {line}
                </Text>

                <View style={styles.flowRow}>
                  <View style={styles.flowParty}>
                    <Ionicons name="person-outline" size={14} color={adminTheme.colors.textMuted} />
                    <Text style={styles.flowName} numberOfLines={1}>
                      {debtPartyBorrow(r)}
                    </Text>
                    <Text style={styles.flowRole}>Borçlu</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={16} color={adminTheme.colors.textMuted} />
                  <View style={styles.flowParty}>
                    <Ionicons name="cash-outline" size={14} color={adminTheme.colors.textMuted} />
                    <Text style={styles.flowName} numberOfLines={1}>
                      {debtPartyLend(r)}
                    </Text>
                    <Text style={styles.flowRole}>Alacaklı</Text>
                  </View>
                </View>

                {r.description?.trim() ? (
                  <Text style={styles.desc} numberOfLines={2}>
                    {r.description.trim()}
                  </Text>
                ) : null}

                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: toneStyle.stripe }]} />
                </View>
                <Text style={styles.paidLine}>{formatDebtPaidLine(r.amount_principal, r.amount_remaining)}</Text>

                <View style={styles.debtFoot}>
                  <View style={[styles.catTag, { backgroundColor: catMeta.bg }]}>
                    <Ionicons name={catMeta.icon} size={12} color={catMeta.color} />
                    <Text style={[styles.catTagText, { color: catMeta.color }]}>{catMeta.short}</Text>
                  </View>
                  <Text style={styles.footDate}>{formatDateShort(r.created_at)}</Text>
                  {overdue ? (
                    <View style={styles.overdueTag}>
                      <Text style={styles.overdueText}>Vade geçti</Text>
                    </View>
                  ) : r.due_date ? (
                    <Text style={styles.dueOk}>Vade {formatDateShort(r.due_date)}</Text>
                  ) : null}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 36 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backHub: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  backHubText: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.primary },
  hero: {
    backgroundColor: adminTheme.colors.primary,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
  heroAdd: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: adminTheme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statGrid: { flexDirection: 'row', gap: 10, marginTop: 16 },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  statRec: {},
  statPay: {},
  statLbl: { fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '600', marginTop: 4 },
  statVal: { fontSize: 16, fontWeight: '800', color: '#fff' },
  statValRec: { color: '#86efac' },
  statValPay: { color: '#fcd34d' },
  heroMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  metaPillWarn: { backgroundColor: 'rgba(254,243,199,0.25)' },
  metaPillText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
  metaPillWarnText: { color: '#fde68a' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 15, color: adminTheme.colors.text, paddingVertical: 10 },
  chipsScroll: { marginBottom: 6 },
  chipsScroll2: { marginBottom: 10 },
  chipsRow: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  chipTone: {},
  chipOn: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  chipText: { fontSize: 13, color: adminTheme.colors.text },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  countLine: { fontSize: 12, color: adminTheme.colors.textMuted, marginBottom: 10, fontWeight: '600' },
  emptyBox: {
    alignItems: 'center',
    padding: 28,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text },
  emptySub: { fontSize: 13, color: adminTheme.colors.textMuted, textAlign: 'center' },
  emptyBtn: {
    marginTop: 8,
    backgroundColor: adminTheme.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700' },
  debtCard: {
    flexDirection: 'row',
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  stripe: { width: 5 },
  debtBody: { flex: 1, padding: 14 },
  debtTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  tonePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tonePillText: { fontSize: 11, fontWeight: '800' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  perspectiveLine: { fontSize: 15, fontWeight: '800', color: adminTheme.colors.text, marginTop: 10 },
  flowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    padding: 10,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderRadius: 10,
  },
  flowParty: { flex: 1, minWidth: 0 },
  flowName: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.text },
  flowRole: { fontSize: 10, color: adminTheme.colors.textMuted, marginTop: 2 },
  desc: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 8, lineHeight: 17 },
  progressTrack: {
    height: 6,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderRadius: 3,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3 },
  paidLine: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 6, fontWeight: '600' },
  debtFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  catTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  catTagText: { fontSize: 10, fontWeight: '700' },
  footDate: { fontSize: 11, color: adminTheme.colors.textMuted },
  dueOk: { fontSize: 11, color: adminTheme.colors.info, fontWeight: '600' },
  overdueTag: { backgroundColor: adminTheme.colors.warningLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  overdueText: { fontSize: 10, fontWeight: '800', color: adminTheme.colors.warning },
});
