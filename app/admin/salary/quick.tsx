import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Modal,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import {
  SalaryStaffListCard,
  type SalaryStaffStatusTone,
} from '@/components/admin/SalaryStaffListCard';
import { AdminSalaryStaffPickerSheet } from '@/components/admin/AdminSalaryStaffPickerSheet';
import { AdminStackBackButton } from '@/lib/adminStackBack';
import { fmtMoneyTry } from '@/lib/financeLedger';
import { createAdminSalaryPayment } from '@/lib/adminSalaryPayments';
import { sendNotification } from '@/lib/notificationService';
import { formatSalaryMoney } from '@/lib/staffSalaryTracking';
import { counterpartyInitials, resolveCounterpartyTypeMeta } from '@/lib/financeCounterpartyUi';
import type { OrgStaffOption } from '@/lib/notificationTemplateRecipients';

const MONTH_NAMES = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];
const HERO_GRAD = ['#0f172a', '#1e3a5f'] as const;
const PAY_GRAD = ['#dc2626', '#b91c1c'] as const;
const FAB_GRAD = ['#d97706', '#b45309'] as const;
const QUICK_AMOUNTS = [1000, 2500, 5000, 10000, 15000, 25000] as const;
const PAY_SHEET_HEIGHT = Math.round(Dimensions.get('window').height * 0.88);

type StatusFilter = 'all' | 'unpaid' | 'entered' | 'pending' | 'paid';
type SortMode = 'amount' | 'name' | 'unpaid_first';

type StaffRow = {
  id: string;
  full_name: string | null;
  department: string | null;
  organization_id: string;
};

type PeriodPayment = {
  id: string;
  amount: number;
  status: string;
  payment_date: string;
  created_by: string | null;
};

type StaffSalaryRow = StaffRow & {
  periodTotal: number;
  periodApproved: number;
  periodPending: number;
  paymentCount: number;
  lastPaymentDate: string | null;
  statusTone: SalaryStaffStatusTone;
  statusLabel: string;
};

export default function AdminSalaryQuickScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);

  const canUseAllOrganizations = me?.app_permissions?.super_admin === true || me?.role === 'admin';

  const [periodMonth, setPeriodMonth] = useState(() => new Date().getMonth() + 1);
  const [periodYear, setPeriodYear] = useState(() => new Date().getFullYear());
  const [rows, setRows] = useState<StaffSalaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('unpaid_first');

  const [selected, setSelected] = useState<StaffSalaryRow | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [paymentType, setPaymentType] = useState<'transfer' | 'cash' | 'credit_card'>('transfer');
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const staffMeta = resolveCounterpartyTypeMeta('staff');
  const periodLabel = `${MONTH_NAMES[periodMonth - 1]} ${periodYear}`;

  /** Tek otel: "Tümü" seçiliyse kendi oteline düş (liste boş kalmasın) */
  const effectiveOrgId = useMemo(() => {
    if (canUseAllOrganizations) {
      if (selectedOrganizationId && selectedOrganizationId === 'all') {
        return me?.organization_id ?? null;
      }
      return selectedOrganizationId || me?.organization_id || null;
    }
    return me?.organization_id ?? null;
  }, [canUseAllOrganizations, selectedOrganizationId, me?.organization_id]);

  const needOrg = !effectiveOrgId;

  const load = useCallback(async () => {
    if (!effectiveOrgId) {
      setRows([]);
      setLoadError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);

    const attempt = async () => {
      const runStaff = (withDeletedFilter: boolean) => {
        let q = supabase
          .from('staff')
          .select('id, full_name, department, organization_id')
          .eq('organization_id', effectiveOrgId)
          .eq('is_active', true)
          .order('full_name');
        if (withDeletedFilter) q = q.is('deleted_at', null);
        return q;
      };

      let staffRes = await runStaff(true);
      if (staffRes.error && /deleted_at/i.test(staffRes.error.message ?? '')) {
        staffRes = await runStaff(false);
      }
      if (staffRes.error) throw new Error(staffRes.error.message);

      const staff = (staffRes.data ?? []) as StaffRow[];
      if (staff.length === 0) {
        setRows([]);
        return;
      }

      const staffIds = staff.map((s) => s.id);
      const { data: payData, error: payErr } = await supabase
        .from('salary_payments')
        .select('id, staff_id, amount, status, payment_date, created_by')
        .eq('period_year', periodYear)
        .eq('period_month', periodMonth)
        .eq('organization_id', effectiveOrgId)
        .in('staff_id', staffIds)
        .order('created_at', { ascending: false });

      // Ödeme sorgusu blob/geçici hatada listeyi tamamen boşaltma — personel yine görünsün
      if (payErr) {
        console.warn('[salary/quick] payments', payErr.message);
      }

      const byStaff = new Map<string, PeriodPayment[]>();
      for (const p of (payData ?? []) as (PeriodPayment & { staff_id: string })[]) {
        const list = byStaff.get(p.staff_id) ?? [];
        list.push({
          id: p.id,
          amount: Number(p.amount) || 0,
          status: p.status,
          payment_date: p.payment_date,
          created_by: p.created_by,
        });
        byStaff.set(p.staff_id, list);
      }

      const next: StaffSalaryRow[] = staff.map((s) => {
        const list = byStaff.get(s.id) ?? [];
        let periodTotal = 0;
        let periodApproved = 0;
        let periodPending = 0;
        for (const p of list) {
          periodTotal += p.amount;
          if (p.status === 'approved') periodApproved += p.amount;
          else if (p.status === 'pending_approval') periodPending += p.amount;
        }
        let statusTone: SalaryStaffStatusTone = 'unpaid';
        let statusLabel = `${periodLabel} — henüz girilmedi`;
        if (periodTotal >= 0.01) {
          if (periodPending >= 0.01 && periodApproved < 0.01) {
            statusTone = 'pending';
            statusLabel = `Girildi · onay bekliyor (${list.length} kayıt)`;
          } else if (periodApproved >= 0.01 && periodPending < 0.01) {
            statusTone = 'paid';
            statusLabel = `Onaylı · ${fmtMoneyTry(periodApproved)}`;
          } else if (periodApproved >= 0.01 && periodPending >= 0.01) {
            statusTone = 'pending';
            statusLabel = `Kısmi onaylı · bekleyen ${fmtMoneyTry(periodPending)}`;
          } else {
            statusTone = 'rejected';
            statusLabel = `Kayıt var · ${fmtMoneyTry(periodTotal)}`;
          }
        }
        return {
          ...s,
          periodTotal,
          periodApproved,
          periodPending,
          paymentCount: list.length,
          lastPaymentDate: list[0]?.payment_date ?? null,
          statusTone,
          statusLabel,
        };
      });

      setRows(next);
    };

    try {
      await attempt();
    } catch (e1) {
      // RN blob race: bir kez kısa bekleyip tekrar dene
      await new Promise((r) => setTimeout(r, 450));
      try {
        await attempt();
      } catch (e2) {
        const msg = e2 instanceof Error ? e2.message : String(e2);
        setLoadError(
          /blob/i.test(msg)
            ? 'Bağlantı geçici olarak kesildi. Tekrar dene.'
            : msg || 'Personel listesi yüklenemedi'
        );
      }
    } finally {
      setLoading(false);
    }
  }, [effectiveOrgId, periodMonth, periodYear, periodLabel]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    let list = rows;
    if (q) {
      list = list.filter((r) => {
        const name = (r.full_name ?? '').toLocaleLowerCase('tr-TR');
        const dept = (r.department ?? '').toLocaleLowerCase('tr-TR');
        return name.includes(q) || dept.includes(q);
      });
    }
    if (statusFilter === 'unpaid') list = list.filter((r) => r.periodTotal < 0.01);
    else if (statusFilter === 'entered') list = list.filter((r) => r.periodTotal >= 0.01);
    else if (statusFilter === 'pending') list = list.filter((r) => r.periodPending >= 0.01);
    else if (statusFilter === 'paid') list = list.filter((r) => r.periodApproved >= 0.01);

    const sorted = [...list];
    if (sortMode === 'amount') {
      sorted.sort((a, b) => b.periodTotal - a.periodTotal || (a.full_name ?? '').localeCompare(b.full_name ?? '', 'tr'));
    } else if (sortMode === 'unpaid_first') {
      sorted.sort((a, b) => {
        const au = a.periodTotal < 0.01 ? 0 : 1;
        const bu = b.periodTotal < 0.01 ? 0 : 1;
        if (au !== bu) return au - bu;
        return b.periodTotal - a.periodTotal || (a.full_name ?? '').localeCompare(b.full_name ?? '', 'tr');
      });
    } else {
      sorted.sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'tr'));
    }
    return sorted;
  }, [rows, search, statusFilter, sortMode]);

  const listStats = useMemo(() => {
    const entered = filtered.filter((r) => r.periodTotal >= 0.01);
    const unpaid = filtered.filter((r) => r.periodTotal < 0.01);
    const totalEntered = entered.reduce((s, r) => s + r.periodTotal, 0);
    return {
      people: filtered.length,
      enteredCount: entered.length,
      unpaidCount: unpaid.length,
      totalEntered,
    };
  }, [filtered]);

  const shiftPeriod = (delta: number) => {
    let m = periodMonth + delta;
    let y = periodYear;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setPeriodMonth(m);
    setPeriodYear(y);
  };

  const openPay = (row: StaffSalaryRow) => {
    setPickerOpen(false);
    setSelected(row);
    setAmount('');
    setNote('');
    setPaymentType('transfer');
  };

  const openPayFromPicker = (picked: OrgStaffOption | null) => {
    if (!picked || !effectiveOrgId) {
      setPickerOpen(false);
      return;
    }
    const existing = rows.find((r) => r.id === picked.id);
    if (existing) {
      openPay(existing);
      return;
    }
    openPay({
      id: picked.id,
      full_name: picked.full_name,
      department: picked.department,
      organization_id: effectiveOrgId,
      periodTotal: 0,
      periodApproved: 0,
      periodPending: 0,
      paymentCount: 0,
      lastPaymentDate: null,
      statusTone: 'unpaid',
      statusLabel: `${periodLabel} — henüz girilmedi`,
    });
  };

  const closePay = () => {
    if (saving) return;
    setSelected(null);
  };

  const openStaffPicker = () => {
    if (!effectiveOrgId) {
      Alert.alert('Otel seçin', 'Önce bir işletme seçin.');
      return;
    }
    setSelected(null);
    setPickerOpen(true);
  };

  const appendQuickAmount = (value: number) => {
    const cur = parseFloat(amount.replace(',', '.')) || 0;
    setAmount(String(cur + value));
  };

  const savePayment = async () => {
    if (!selected) return;
    if (!effectiveOrgId) {
      Alert.alert('Otel seçin', 'Maaş girmek için tek bir otel seçmelisiniz.');
      return;
    }
    const num = parseFloat(amount.replace(/,/g, '.'));
    if (!num || num <= 0) {
      Alert.alert('Tutar gerekli', 'Geçerli bir maaş tutarı girin.');
      return;
    }

    setSaving(true);
    const paymentDate = new Date().toISOString().slice(0, 10);
    const description = (note.trim() || `${periodLabel} maaş ödemesi`).trim();
    const { id, error } = await createAdminSalaryPayment({
      staffId: selected.id,
      periodMonth,
      periodYear,
      amount: num,
      paymentDate,
      paymentTime: new Date().toTimeString().slice(0, 5),
      paymentType,
      description,
      entryKind: 'regular',
      createdByStaffId: me?.id ?? null,
    });
    setSaving(false);

    if (error || !id) {
      Alert.alert('Kayıt yapılamadı', error ?? 'Bilinmeyen hata');
      return;
    }

    await sendNotification({
      staffId: selected.id,
      title: 'Maaşınız yatırıldı!',
      body: `Dönem: ${periodLabel}\nTutar: ${formatSalaryMoney(num)}\nTarih: ${paymentDate}\n\nMaaş takibinden kontrol edip onaylayın.`,
      notificationType: 'salary_deposited',
      category: 'staff',
      data: { type: 'salary', paymentId: id, screen: '/staff/salary-history' },
      createdByStaffId: me?.id ?? null,
    }).catch(() => {});

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setLastSaved(`${selected.full_name ?? 'Personel'} · ${fmtMoneyTry(num)}`);
    setSelected(null);
    setAmount('');
    setNote('');
    await load();
    // Sonraki kişi için tüm personel listesini aç
    setPickerOpen(true);
  };

  const renderItem = ({ item }: { item: StaffSalaryRow }) => (
    <SalaryStaffListCard
      name={item.full_name ?? '—'}
      department={item.department}
      amountLabel={item.periodTotal >= 0.01 ? fmtMoneyTry(item.periodTotal) : '—'}
      lastPaymentLabel={
        item.periodTotal >= 0.01
          ? `${item.paymentCount} kayıt · ${item.lastPaymentDate ?? '—'}`
          : 'Bu dönem giriş yok'
      }
      statusLabel={item.statusLabel}
      statusTone={item.statusTone}
      onPress={() =>
        router.push({ pathname: '/admin/salary/history/[id]', params: { id: item.id } })
      }
      onPayPress={() => openPay(item)}
      dense
    />
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={[...HERO_GRAD]} style={[styles.heroBar, { paddingTop: insets.top + 8 }]}>
        <AdminStackBackButton tintColor="#fff" fallback="/admin/salary" />
        <View style={styles.heroTitleWrap}>
          <Text style={styles.heroTitle} numberOfLines={1}>
            Personel maaş girişi
          </Text>
          <Text style={styles.heroSub} numberOfLines={1}>
            Kim ne kadar · sıralı liste · hızlı gir
          </Text>
        </View>
        <View style={styles.topActions}>
          <TouchableOpacity
            style={styles.heroIconBtn}
            onPress={() => router.push('/admin/salary/all')}
            accessibilityLabel="Tüm ödemeler"
          >
            <Ionicons name="list-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.heroIconBtn}
            onPress={() => router.push('/admin/salary')}
            accessibilityLabel="Maaş yönetimi"
          >
            <Ionicons name="settings-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <View style={styles.listArea}>
        {needOrg ? (
          <View style={styles.needOrgWrap}>
            <AdminOrganizationPicker
              canUseAll={canUseAllOrganizations}
              ownOrganizationId={me?.organization_id}
            />
            <View style={styles.hintBox}>
              <Ionicons name="business-outline" size={28} color={adminTheme.colors.accent} />
              <Text style={styles.hintTitle}>Otel seçin</Text>
              <Text style={styles.hintText}>
                Personel listesi için üstten bir işletme seçin. Oturum yükleniyorsa kısa süre bekleyip
                tekrar deneyin.
              </Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => void load()} activeOpacity={0.9}>
                <Ionicons name="refresh" size={18} color="#fff" />
                <Text style={styles.emptyBtnText}>Yenile</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.listBody}>
            <View style={styles.searchToolbar}>
              <View style={styles.periodBar}>
                <TouchableOpacity style={styles.periodArrow} onPress={() => shiftPeriod(-1)} hitSlop={8}>
                  <Ionicons name="chevron-back" size={20} color={adminTheme.colors.text} />
                </TouchableOpacity>
                <Text style={styles.periodLabel}>{periodLabel}</Text>
                <TouchableOpacity style={styles.periodArrow} onPress={() => shiftPeriod(1)} hitSlop={8}>
                  <Ionicons name="chevron-forward" size={20} color={adminTheme.colors.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.searchCard}>
                <Ionicons name="search" size={18} color={adminTheme.colors.accent} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Personel veya departman ara…"
                  placeholderTextColor={adminTheme.colors.textMuted}
                  value={search}
                  onChangeText={setSearch}
                  returnKeyType="search"
                />
                {search.length > 0 ? (
                  <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={adminTheme.colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
                keyboardShouldPersistTaps="handled"
              >
                {(
                  [
                    { key: 'all' as const, label: 'Tümü' },
                    { key: 'unpaid' as const, label: 'Girilmedi' },
                    { key: 'entered' as const, label: 'Girildi' },
                    { key: 'pending' as const, label: 'Onay bekliyor' },
                    { key: 'paid' as const, label: 'Onaylı' },
                  ] as const
                ).map((f) => {
                  const on = statusFilter === f.key;
                  return (
                    <TouchableOpacity
                      key={f.key}
                      style={[styles.filterChip, on && styles.filterChipOn]}
                      onPress={() => setStatusFilter(f.key)}
                    >
                      <Text style={[styles.filterChipText, on && styles.filterChipTextOn]}>{f.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
                keyboardShouldPersistTaps="handled"
              >
                {(
                  [
                    { key: 'unpaid_first' as const, label: 'Önce girilmeyenler' },
                    { key: 'amount' as const, label: 'Tutara göre' },
                    { key: 'name' as const, label: 'İsme göre' },
                  ] as const
                ).map((s) => {
                  const on = sortMode === s.key;
                  return (
                    <TouchableOpacity
                      key={s.key}
                      style={[styles.sortChip, on && styles.sortChipOn]}
                      onPress={() => setSortMode(s.key)}
                    >
                      <Text style={[styles.sortChipText, on && styles.sortChipTextOn]}>{s.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <FlatList
              style={styles.list}
              data={loading && !refreshing ? [] : filtered}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              ListHeaderComponent={
                <View style={styles.listHeader}>
                  <View style={styles.orgCard}>
                    <AdminOrganizationPicker
                      canUseAll={canUseAllOrganizations}
                      ownOrganizationId={me?.organization_id}
                    />
                  </View>
                  {lastSaved ? (
                    <View style={styles.savedBanner}>
                      <Ionicons name="checkmark-circle" size={16} color="#166534" />
                      <Text style={styles.savedBannerText}>Kaydedildi: {lastSaved}</Text>
                    </View>
                  ) : null}
                  {loadError ? (
                    <View style={styles.errorBanner}>
                      <Ionicons name="warning-outline" size={16} color="#b91c1c" />
                      <Text style={styles.errorBannerText}>{loadError}</Text>
                      <TouchableOpacity onPress={() => void load()} hitSlop={8}>
                        <Text style={styles.errorRetry}>Tekrar dene</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                  {loading && !refreshing ? (
                    <ActivityIndicator color={adminTheme.colors.accent} style={{ marginVertical: 12 }} />
                  ) : (
                    <View style={styles.statsRow}>
                      <View style={styles.statPill}>
                        <Text style={styles.statPillNum}>{listStats.people}</Text>
                        <Text style={styles.statPillLbl}>Personel</Text>
                      </View>
                      <View style={[styles.statPill, styles.statPillWarn]}>
                        <Text style={[styles.statPillNum, { color: '#b45309' }]}>
                          {listStats.unpaidCount}
                        </Text>
                        <Text style={styles.statPillLbl}>Girilmedi</Text>
                      </View>
                      <View style={[styles.statPill, styles.statPillOk]}>
                        <Text style={[styles.statPillNum, { color: '#16a34a' }]} numberOfLines={1}>
                          {fmtMoneyTry(listStats.totalEntered)}
                        </Text>
                        <Text style={styles.statPillLbl}>Girilen ({listStats.enteredCount})</Text>
                      </View>
                    </View>
                  )}
                  <Text style={styles.listHint}>
                    + ile personel seçin · kırmızı butonla hızlı gir · karttan geçmişi açın
                  </Text>
                </View>
              }
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: 100 + Math.max(insets.bottom, 10) },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              ListEmptyComponent={
                loading && !refreshing ? null : (
                  <View style={styles.emptyCard}>
                    <View style={styles.emptyIconWrap}>
                      <Ionicons
                        name={loadError ? 'cloud-offline-outline' : 'wallet-outline'}
                        size={36}
                        color={adminTheme.colors.accent}
                      />
                    </View>
                    <Text style={styles.emptyTitle}>
                      {loadError ? 'Liste yüklenemedi' : 'Personel bulunamadı'}
                    </Text>
                    <Text style={styles.emptySub}>
                      {loadError
                        ? loadError
                        : 'Bu otelde aktif personel yok veya arama/filtre sonucu boş.'}
                    </Text>
                    {loadError ? (
                      <TouchableOpacity
                        style={styles.emptyBtn}
                        onPress={() => void load()}
                        activeOpacity={0.9}
                      >
                        <Ionicons name="refresh" size={18} color="#fff" />
                        <Text style={styles.emptyBtnText}>Tekrar dene</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.emptyBtn}
                        onPress={openStaffPicker}
                        activeOpacity={0.9}
                      >
                        <Ionicons name="people" size={18} color="#fff" />
                        <Text style={styles.emptyBtnText}>Personel seç</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )
              }
            />
          </View>
        )}
      </View>

      {!needOrg ? (
        <View
          style={[styles.fabWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            onPress={openStaffPicker}
            activeOpacity={0.88}
            accessibilityLabel="Personel seç ve maaş gir"
          >
            <LinearGradient colors={[...FAB_GRAD]} style={styles.fab}>
              <Ionicons name="add" size={26} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : null}

      <AdminSalaryStaffPickerSheet
        visible={pickerOpen}
        organizationId={effectiveOrgId}
        selectedStaffId={selected?.id ?? null}
        onSelect={openPayFromPicker}
        onClose={() => setPickerOpen(false)}
      />

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={closePay}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalOverlayDismiss} onPress={closePay} accessibilityLabel="Kapat" />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKb}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 6 : 0}
          >
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              {selected ? (
                <>
                  <View style={styles.sheetHandle} />
                  <View style={styles.sheetHeaderRow}>
                    <Text style={styles.sheetTitle}>{periodLabel} maaş girişi</Text>
                    <TouchableOpacity onPress={closePay} hitSlop={10}>
                      <Ionicons name="close" size={22} color={adminTheme.colors.textMuted} />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={styles.personHero}
                    onPress={() => {
                      setSelected(null);
                      setPickerOpen(true);
                    }}
                    activeOpacity={0.88}
                  >
                    <View style={[styles.personAvatar, { backgroundColor: staffMeta.bg }]}>
                      <Text style={[styles.personAvatarText, { color: staffMeta.color }]}>
                        {counterpartyInitials(selected.full_name ?? '?')}
                      </Text>
                    </View>
                    <View style={styles.personHeroBody}>
                      <Text style={styles.personName} numberOfLines={2}>
                        {selected.full_name ?? '—'}
                      </Text>
                      <Text style={styles.personMeta}>
                        {selected.department?.trim() || staffMeta.label}
                        {selected.periodTotal >= 0.01
                          ? ` · bu dönem ${fmtMoneyTry(selected.periodTotal)}`
                          : ' · henüz giriş yok'}
                      </Text>
                      <Text style={styles.changePersonHint}>Personel değiştir · tüm liste</Text>
                    </View>
                    <Ionicons name="swap-horizontal" size={22} color={adminTheme.colors.textMuted} />
                  </TouchableOpacity>

                  <ScrollView
                    style={styles.sheetScroll}
                    contentContainerStyle={styles.sheetScrollContent}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                    showsVerticalScrollIndicator={false}
                  >
                    <LinearGradient colors={['#fff7ed', '#ffffff']} style={styles.amountHero}>
                      <Text style={styles.amountLbl}>Tutar (₺)</Text>
                      <View style={styles.amountRow}>
                        <Text style={styles.amountCurrency}>₺</Text>
                        <TextInput
                          style={styles.amountInput}
                          value={amount}
                          onChangeText={setAmount}
                          keyboardType="decimal-pad"
                          placeholder="0"
                          placeholderTextColor="#cbd5e1"
                          autoFocus
                        />
                      </View>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.quickAmtScroll}
                        keyboardShouldPersistTaps="handled"
                      >
                        <TouchableOpacity style={styles.quickAmtClear} onPress={() => setAmount('')}>
                          <Ionicons
                            name="backspace-outline"
                            size={14}
                            color={adminTheme.colors.textMuted}
                          />
                          <Text style={styles.quickAmtClearText}>Temizle</Text>
                        </TouchableOpacity>
                        {QUICK_AMOUNTS.map((v) => (
                          <TouchableOpacity
                            key={v}
                            style={styles.quickAmtChip}
                            onPress={() => appendQuickAmount(v)}
                          >
                            <Text style={styles.quickAmtText}>+{v.toLocaleString('tr-TR')}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </LinearGradient>

                    <Text style={styles.sectionLbl}>Ödeme yöntemi</Text>
                    <View style={styles.payTypeRow}>
                      {(
                        [
                          { value: 'transfer' as const, label: 'Havale' },
                          { value: 'cash' as const, label: 'Nakit' },
                          { value: 'credit_card' as const, label: 'Kart' },
                        ] as const
                      ).map((opt) => {
                        const on = paymentType === opt.value;
                        return (
                          <TouchableOpacity
                            key={opt.value}
                            style={[styles.payTypeChip, on && styles.payTypeChipOn]}
                            onPress={() => setPaymentType(opt.value)}
                          >
                            <Text style={[styles.payTypeText, on && styles.payTypeTextOn]}>
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <Text style={styles.sectionLbl}>Not (isteğe bağlı)</Text>
                    <TextInput
                      style={styles.noteInput}
                      value={note}
                      onChangeText={setNote}
                      placeholder={`${periodLabel} maaş ödemesi`}
                      placeholderTextColor={adminTheme.colors.textMuted}
                      multiline
                    />
                  </ScrollView>

                  <View style={styles.sheetFooter}>
                    <TouchableOpacity
                      onPress={() => void savePayment()}
                      disabled={saving}
                      activeOpacity={0.9}
                    >
                      <LinearGradient colors={[...PAY_GRAD]} style={styles.saveBtn}>
                        {saving ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="flash" size={20} color="#fff" />
                            <Text style={styles.saveBtnText}>Kaydet — sonraki kişi</Text>
                          </>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  heroBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 10,
  },
  heroIconBtn: { padding: 8 },
  heroTitleWrap: { flex: 1, marginHorizontal: 4 },
  heroTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 2 },
  topActions: { flexDirection: 'row', alignItems: 'center' },
  listArea: { flex: 1 },
  listBody: { flex: 1 },
  needOrgWrap: { flex: 1, paddingTop: 12, paddingHorizontal: 16 },
  hintBox: {
    marginTop: 16,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  hintTitle: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text, marginTop: 4 },
  hintText: {
    fontSize: 13,
    color: adminTheme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorBannerText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#991b1b' },
  errorRetry: { fontSize: 12, fontWeight: '800', color: '#dc2626' },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    backgroundColor: adminTheme.colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  list: { flex: 1 },
  searchToolbar: {
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: adminTheme.colors.border,
  },
  periodBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 8,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  periodArrow: { padding: 4 },
  periodLabel: { fontSize: 15, fontWeight: '800', color: adminTheme.colors.text, minWidth: 140, textAlign: 'center' },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    ...adminTheme.shadow.sm,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 10, color: adminTheme.colors.text },
  chipRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  filterChipOn: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  filterChipText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textMuted },
  filterChipTextOn: { color: '#fff' },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  sortChipOn: { backgroundColor: '#ede9fe', borderColor: '#c4b5fd' },
  sortChipText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textMuted },
  sortChipTextOn: { color: '#6d28d9' },
  listHeader: { paddingTop: 2, marginBottom: 4 },
  orgCard: { marginBottom: 10 },
  savedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#dcfce7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  savedBannerText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#166534' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  statPill: {
    flex: 1,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  statPillWarn: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  statPillOk: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  statPillNum: { fontSize: 12, fontWeight: '800', color: adminTheme.colors.text },
  statPillLbl: { fontSize: 10, color: adminTheme.colors.textMuted, fontWeight: '600', marginTop: 2 },
  listHint: { fontSize: 11, color: adminTheme.colors.textMuted, marginBottom: 8, lineHeight: 16 },
  listContent: { paddingHorizontal: 16, paddingBottom: 96 },
  fabWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'flex-end',
    paddingTop: 6,
    paddingRight: 18,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    ...adminTheme.shadow.lg,
  },
  emptyCard: {
    alignItems: 'center',
    marginTop: 24,
    padding: 24,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text },
  emptySub: { fontSize: 13, color: adminTheme.colors.textMuted, marginTop: 6, textAlign: 'center' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'flex-end',
  },
  modalOverlayDismiss: { ...StyleSheet.absoluteFillObject },
  modalKb: { width: '100%', maxHeight: PAY_SHEET_HEIGHT },
  sheet: {
    backgroundColor: adminTheme.colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    height: PAY_SHEET_HEIGHT,
    maxHeight: PAY_SHEET_HEIGHT,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  sheetTitle: { flex: 1, fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted },
  personHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  personAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personAvatarText: { fontSize: 18, fontWeight: '800' },
  personHeroBody: { flex: 1, minWidth: 0 },
  personName: { fontSize: 17, fontWeight: '800', color: adminTheme.colors.text },
  personMeta: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 4 },
  changePersonHint: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7c3aed',
    marginTop: 6,
  },
  sheetScroll: { flex: 1 },
  sheetScrollContent: { paddingBottom: 16 },
  amountHero: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  amountLbl: { fontSize: 11, fontWeight: '700', color: adminTheme.colors.accent, marginBottom: 6 },
  amountRow: { flexDirection: 'row', alignItems: 'center' },
  amountCurrency: { fontSize: 32, fontWeight: '800', color: adminTheme.colors.accent, marginRight: 6 },
  amountInput: {
    flex: 1,
    fontSize: 36,
    fontWeight: '800',
    color: adminTheme.colors.text,
    paddingVertical: 4,
  },
  quickAmtScroll: { marginTop: 10, maxHeight: 34 },
  quickAmtChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fed7aa',
    marginRight: 8,
  },
  quickAmtText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.accent },
  quickAmtClear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    marginRight: 8,
  },
  quickAmtClearText: { fontSize: 11, fontWeight: '600', color: adminTheme.colors.textMuted },
  sectionLbl: {
    fontSize: 11,
    fontWeight: '800',
    color: adminTheme.colors.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  payTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  payTypeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  payTypeChipOn: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  payTypeText: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.textMuted },
  payTypeTextOn: { color: '#fff' },
  noteInput: {
    fontSize: 14,
    color: adminTheme.colors.text,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 72,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  sheetFooter: {
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: adminTheme.colors.border,
  },
  saveBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    ...adminTheme.shadow.md,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
