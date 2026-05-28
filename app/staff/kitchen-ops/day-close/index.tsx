import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, Pressable, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { fetchDaySummary, checkPosMismatch, fetchUnresolvedAlertCount } from '@/lib/kitchenOps/api';
import type { KitchenDaySummary } from '@/lib/kitchenOps/types';
import { fmtKitchenMoney } from '@/lib/kitchenOps/stockStatus';
import { KitchenMoneyStat, KitchenSaveButton } from '@/components/kitchenOps/KitchenUi';
import { KitchenPrintBar } from '@/components/kitchenOps/KitchenPrintBar';
import { Ionicons } from '@expo/vector-icons';

type Checklist = {
  has_revenue: boolean;
  has_expenses: boolean;
  pos_ok: boolean;
  personnel_ok: boolean;
  cash_handover: boolean;
  no_open_credit: boolean;
  no_critical_stock: boolean;
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

export default function KitchenDayCloseScreen() {
  const staff = useAuthStore((s) => s.staff);
  const today = new Date().toISOString().slice(0, 10);
  const [summary, setSummary] = useState<KitchenDaySummary | null>(null);
  const [checklist, setChecklist] = useState<Checklist>({
    has_revenue: false,
    has_expenses: false,
    pos_ok: false,
    personnel_ok: false,
    cash_handover: false,
    no_open_credit: true,
    no_critical_stock: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [posMismatch, setPosMismatch] = useState(false);
  const [criticalCount, setCriticalCount] = useState(0);

  const load = useCallback(async () => {
    const [s, mismatch, alerts] = await Promise.all([
      fetchDaySummary(today),
      checkPosMismatch(today),
      fetchUnresolvedAlertCount(),
    ]);
    setSummary(s);
    setPosMismatch(mismatch);
    setCriticalCount(alerts);
    setChecklist((c) => ({
      ...c,
      has_revenue: Number(s.total_revenue) > 0,
      has_expenses: Number(s.total_expenses) > 0,
      pos_ok: !mismatch,
      personnel_ok: Number(s.personnel_expenses) >= 0,
      no_critical_stock: alerts === 0,
    }));
  }, [today]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

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
    if (!canClose()) {
      Alert.alert('Gün kapatılamaz', posMismatch ? 'POS farkı bulundu. Önce uyuşmazlığı giderin.' : 'Eksik işlemler var. Checklist tamamlanmalı.');
      return;
    }
    if (!summary) return;
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

  if (loading || !summary) {
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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

      <KitchenSaveButton label="Günü Kapat" onPress={submitClose} loading={saving} disabled={!canClose()} />
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
});
