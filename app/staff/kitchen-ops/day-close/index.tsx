import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { fetchDaySummary, checkPosMismatch, fetchUnresolvedAlertCount } from '@/lib/kitchenOps/api';
import type { KitchenDaySummary } from '@/lib/kitchenOps/types';
import { EMPTY_KITCHEN_DAY_SUMMARY } from '@/lib/kitchenOps/types';
import { fmtKitchenMoney } from '@/lib/kitchenOps/stockStatus';
import { KitchenMoneyStat, KitchenSaveButton } from '@/components/kitchenOps/KitchenUi';
import { KitchenPrintBar } from '@/components/kitchenOps/KitchenPrintBar';
import { Ionicons } from '@expo/vector-icons';
import { useCachedFocusLoad } from '@/hooks/useCachedFocusLoad';

type Checklist = {
  has_revenue: boolean;
  has_expenses: boolean;
  pos_ok: boolean;
  personnel_ok: boolean;
  cash_handover: boolean;
  no_open_credit: boolean;
  no_critical_stock: boolean;
};

const DEFAULT_CHECKLIST: Checklist = {
  has_revenue: false,
  has_expenses: false,
  pos_ok: false,
  personnel_ok: false,
  cash_handover: false,
  no_open_credit: true,
  no_critical_stock: true,
};

const CHECK_ITEMS: { key: keyof Checklist; label: string }[] = [
  { key: 'has_revenue', label: 'Hasılat girildi mi?' },
  { key: 'has_expenses', label: 'Giderler işlendi mi?' },
  { key: 'pos_ok', label: 'POS kayıtları tamam mı?' },
  { key: 'personnel_ok', label: 'Personel ödemeleri girildi mi?' },
  { key: 'cash_handover', label: 'Nakit teslim edildi mi?' },
  { key: 'no_open_credit', label: 'Açık veresiye kaldı mı?' },
  { key: 'no_critical_stock', label: 'Kritik stok var mı?' },
];

type DayCloseCache = {
  summary: KitchenDaySummary;
  posMismatch: boolean;
  criticalCount: number;
  loadError: string | null;
};

export default function KitchenDayCloseScreen() {
  const staff = useAuthStore((s) => s.staff);
  const today = new Date().toISOString().slice(0, 10);
  const [checklist, setChecklist] = useState<Checklist>(DEFAULT_CHECKLIST);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async (): Promise<DayCloseCache | null> => {
    try {
      const [s, mismatch, alerts] = await Promise.all([
        fetchDaySummary(today),
        checkPosMismatch(today).catch(() => false),
        fetchUnresolvedAlertCount().catch(() => 0),
      ]);
      return {
        summary: s,
        posMismatch: mismatch,
        criticalCount: alerts,
        loadError: null,
      };
    } catch (e) {
      return {
        summary: EMPTY_KITCHEN_DAY_SUMMARY,
        posMismatch: false,
        criticalCount: 0,
        loadError: e instanceof Error ? e.message : 'Gün özeti alınamadı',
      };
    }
  }, [today]);

  const { data, loading, refreshing, refresh, showContent } = useCachedFocusLoad<DayCloseCache>({
    cacheKey: `kitchen-day-close:${today}`,
    fetchData,
  });

  const summary = data?.summary ?? EMPTY_KITCHEN_DAY_SUMMARY;
  const posMismatch = data?.posMismatch ?? false;
  const criticalCount = data?.criticalCount ?? 0;
  const loadError = data?.loadError ?? null;

  useEffect(() => {
    if (!data) return;
    const s = data.summary;
    setChecklist((c) => ({
      ...c,
      has_revenue: Number(s.total_revenue) > 0,
      has_expenses: Number(s.total_expenses) > 0,
      pos_ok: !data.posMismatch,
      personnel_ok: Number(s.personnel_expenses) >= 0,
      no_critical_stock: data.criticalCount === 0,
    }));
  }, [data]);

  const toggleCheck = (key: keyof Checklist) => {
    setChecklist((c) => ({ ...c, [key]: !c[key] }));
  };

  const canClose = () => {
    if (posMismatch) return false;
    return CHECK_ITEMS.every((item) => {
      if (item.key === 'no_open_credit' || item.key === 'no_critical_stock') {
        return checklist[item.key] === true;
      }
      return checklist[item.key] === true;
    });
  };

  const submitClose = async () => {
    if (loadError) {
      Alert.alert('Gün kapatılamaz', 'Gün özeti yüklenemedi. Lütfen yeniden deneyin.');
      return;
    }
    if (!canClose()) {
      Alert.alert('Gün kapatılamaz', posMismatch ? 'POS farkı bulundu. Önce uyuşmazlığı giderin.' : 'Eksik işlemler var. Checklist tamamlanmalı.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('kitchen_day_closures').upsert({
        organization_id: staff?.organization_id,
        closure_date: today,
        total_revenue: summary.total_revenue,
        total_pos: summary.total_pos,
        total_cash: summary.total_cash,
        total_expenses: summary.total_expenses,
        personnel_expenses: summary.personnel_expenses,
        supplier_debt: summary.supplier_debt,
        cari_net: summary.cari_net,
        net_remaining: summary.net_remaining,
        checklist,
        status: 'submitted',
        submitted_by: staff?.id,
        submitted_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,closure_date' });
      if (error) throw error;
      Alert.alert('Tamam', 'Gün sonu kapanışı gönderildi.');
    } catch (e) {
      Alert.alert('Hata', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !showContent) {
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      {loadError ? (
        <Pressable style={styles.errorBox} onPress={refresh}>
          <Text style={styles.errorText}>{loadError}</Text>
          <Text style={styles.errorRetry}>Yeniden dene</Text>
        </Pressable>
      ) : null}
      <KitchenPrintBar kind="day_close" />
      <Text style={styles.dateTitle}>{today} — Gün Özeti</Text>

      {posMismatch ? (
        <View style={styles.warnBox}>
          <Ionicons name="warning" size={20} color="#dc2626" />
          <Text style={styles.warnText}>Kasa farkı bulundu! POS hasılatı ile POS kayıtları uyuşmuyor.</Text>
        </View>
      ) : null}

      <View style={styles.statsGrid}>
        <KitchenMoneyStat label="Hasılat" amount={summary.total_revenue} />
        <KitchenMoneyStat label="POS" amount={summary.total_pos} />
        <KitchenMoneyStat label="Nakit" amount={summary.total_cash} />
        <KitchenMoneyStat label="Gider" amount={summary.total_expenses} />
        <KitchenMoneyStat label="Personel" amount={summary.personnel_expenses} />
        <KitchenMoneyStat label="Net kalan" amount={summary.net_remaining} highlight />
      </View>

      <Text style={styles.section}>Kapanış checklist</Text>
      {CHECK_ITEMS.map((item) => {
        const ok = checklist[item.key];
        const isInverted = item.key === 'no_open_credit' || item.key === 'no_critical_stock';
        const displayOk = isInverted ? ok : ok;
        return (
          <Pressable key={item.key} style={styles.checkRow} onPress={() => toggleCheck(item.key)}>
            <Ionicons name={displayOk ? 'checkbox' : 'square-outline'} size={22} color={displayOk ? theme.colors.success : theme.colors.textMuted} />
            <Text style={styles.checkLabel}>{item.label}</Text>
          </Pressable>
        );
      })}

      {criticalCount > 0 ? (
        <Text style={styles.criticalNote}>{criticalCount} açık stok alarmı var.</Text>
      ) : null}

      <KitchenSaveButton label="Günü Kapat" onPress={submitClose} loading={saving} disabled={!canClose() || !!loadError} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dateTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginBottom: 12 },
  warnBox: { flexDirection: 'row', gap: 8, backgroundColor: '#fef2f2', padding: 12, borderRadius: 12, marginBottom: 12, alignItems: 'center' },
  warnText: { flex: 1, color: '#dc2626', fontSize: 13, fontWeight: '600' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  section: { fontSize: 15, fontWeight: '800', color: theme.colors.text, marginTop: 20, marginBottom: 10 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.borderLight },
  checkLabel: { fontSize: 15, color: theme.colors.text, flex: 1 },
  criticalNote: { color: '#dc2626', fontSize: 13, marginTop: 8, fontWeight: '600' },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: { color: '#dc2626', fontSize: 13, fontWeight: '600' },
  errorRetry: { color: '#b91c1c', fontSize: 12, fontWeight: '700', marginTop: 6 },
});
