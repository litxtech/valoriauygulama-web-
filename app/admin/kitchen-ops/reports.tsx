import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { fmtKitchenMoney } from '@/lib/kitchenOps/stockStatus';
import { formatDateShort } from '@/lib/date';
import {
  monthStartIso,
  previousMonthStartIso,
  sendKitchenMonthlyMarketExpenseSummaries,
} from '@/lib/kitchenOps/monthlyMarketExpenseNotify';

const TR_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

function monthLabelFromIso(iso: string): string {
  const [y, m] = iso.split('-');
  const mi = Number(m) - 1;
  return `${TR_MONTHS[mi] ?? m} ${y}`;
}

export default function AdminKitchenReportsScreen() {
  const orgScoped = useAdminOrganizationQueryScope();
  const { staff } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [mayTotal, setMayTotal] = useState<number | null>(null);
  const [stats, setStats] = useState({ revenue: 0, expenses: 0, waste: 0, personnel: 0, topProduct: '-' });

  const mayPeriod = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    return monthStartIso(year, 5);
  }, []);

  const prevPeriod = useMemo(() => previousMonthStartIso(), []);

  const load = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    let revQ = supabase.from('kitchen_revenues').select('amount').gte('entry_date', weekAgo);
    let expQ = supabase.from('kitchen_expenses').select('amount').gte('entry_date', weekAgo);
    let wasteQ = supabase
      .from('kitchen_stock_movements')
      .select('quantity, item:kitchen_stock_items(name)')
      .eq('movement_type', 'waste')
      .gte('created_at', weekAgo);
    let perQ = supabase.from('kitchen_personnel_payments').select('amount').gte('entry_date', weekAgo);
    if (orgScoped) {
      revQ = revQ.eq('organization_id', orgScoped);
      expQ = expQ.eq('organization_id', orgScoped);
      wasteQ = wasteQ.eq('organization_id', orgScoped);
      perQ = perQ.eq('organization_id', orgScoped);
    }

    const [{ data: rev }, { data: exp }, { data: waste }, { data: per }] = await Promise.all([revQ, expQ, wasteQ, perQ]);

    const revenue = (rev ?? []).reduce((s, r) => s + Number(r.amount), 0);
    const expenses = (exp ?? []).reduce((s, r) => s + Number(r.amount), 0);
    const personnel = (per ?? []).reduce((s, r) => s + Number(r.amount), 0);
    const wasteQty = (waste ?? []).reduce((s, r) => s + Number(r.quantity), 0);

    setStats({ revenue, expenses, waste: wasteQty, personnel, topProduct: `${wasteQty} birim zayi (7 gün)` });

    if (orgScoped) {
      const monthEnd = new Date(mayPeriod);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      const { data: mayRows } = await supabase
        .from('kitchen_expenses')
        .select('amount')
        .eq('organization_id', orgScoped)
        .eq('category', 'Market')
        .gte('entry_date', mayPeriod)
        .lt('entry_date', monthEnd.toISOString().slice(0, 10));
      setMayTotal((mayRows ?? []).reduce((s, r) => s + Number(r.amount), 0));
    } else {
      setMayTotal(null);
    }

    setLoading(false);
  }, [orgScoped, mayPeriod]);

  useEffect(() => {
    load();
  }, [load]);

  const sendMonthlyPush = async (periodMonth: string, label: string, force: boolean) => {
    if (!orgScoped) {
      Alert.alert('Organizasyon', 'Önce işletme seçin.');
      return;
    }
    Alert.alert(
      'Push gönder',
      `${label} ayı market harcama özeti tüm personele gönderilsin mi?${force ? ' (Daha önce gönderilmiş olsa bile tekrarlanır.)' : ''}`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Gönder',
          onPress: async () => {
            setSending(true);
            const res = await sendKitchenMonthlyMarketExpenseSummaries({
              periodMonth,
              organizationId: orgScoped,
              force,
              sentByStaffId: staff?.id,
            });
            setSending(false);
            if (res.error) {
              Alert.alert('Hata', res.error.message);
              return;
            }
            if (res.orgCount < 1) {
              Alert.alert('Bilgi', 'Gönderim yapılmadı (zaten gönderilmiş olabilir veya alıcı yok). Tekrar için zorla gönder kullanın.');
              return;
            }
            Alert.alert('Tamam', `${label} market harcama özeti personele iletildi.`);
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={adminTheme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
    >
      <View style={styles.notifyCard}>
        <Text style={styles.notifyTitle}>Aylık market harcama bildirimi</Text>
        <Text style={styles.notifySub}>
          Her ayın 1&apos;inde saat 00:00&apos;da (İstanbul) bir önceki ayın market gider özeti tüm personele push olarak gider.
        </Text>
        {mayTotal != null ? (
          <Text style={styles.mayPreview}>
            {monthLabelFromIso(mayPeriod)} market toplamı (önizleme): {fmtKitchenMoney(mayTotal)}
          </Text>
        ) : null}
        <TouchableOpacity
          style={[styles.notifyBtn, styles.notifyBtnPrimary]}
          disabled={sending}
          onPress={() => sendMonthlyPush(mayPeriod, monthLabelFromIso(mayPeriod), true)}
        >
          <Text style={styles.notifyBtnPrimaryText}>
            {sending ? 'Gönderiliyor…' : `${monthLabelFromIso(mayPeriod)} özetini şimdi gönder`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.notifyBtn}
          disabled={sending}
          onPress={() => sendMonthlyPush(prevPeriod, monthLabelFromIso(prevPeriod), false)}
        >
          <Text style={styles.notifyBtnText}>{monthLabelFromIso(prevPeriod)} özetini gönder</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.notifyBtn, styles.notifyBtnGhost]}
          disabled={sending}
          onPress={() => sendMonthlyPush(prevPeriod, monthLabelFromIso(prevPeriod), true)}
        >
          <Text style={styles.notifyBtnGhostText}>Son ayı tekrar gönder (zorla)</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.period}>Son 7 gün ({formatDateShort(new Date(Date.now() - 7 * 86400000).toISOString())} — bugün)</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Hasılat</Text>
        <Text style={styles.value}>{fmtKitchenMoney(stats.revenue)}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Gider</Text>
        <Text style={styles.value}>{fmtKitchenMoney(stats.expenses)}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Personel maliyeti</Text>
        <Text style={styles.value}>{fmtKitchenMoney(stats.personnel)}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Fire / Zayi</Text>
        <Text style={styles.value}>{stats.topProduct}</Text>
      </View>
      <View style={[styles.card, styles.netCard]}>
        <Text style={styles.label}>Net (hasilat − gider − personel)</Text>
        <Text style={[styles.value, { color: adminTheme.colors.primary }]}>
          {fmtKitchenMoney(stats.revenue - stats.expenses - stats.personnel)}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notifyCard: {
    backgroundColor: '#ecfdf5',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  notifyTitle: { fontSize: 16, fontWeight: '800', color: '#065f46' },
  notifySub: { fontSize: 13, color: '#047857', marginTop: 6, lineHeight: 19 },
  mayPreview: { fontSize: 14, fontWeight: '700', color: '#0f766e', marginTop: 10 },
  notifyBtn: {
    marginTop: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#6ee7b7',
  },
  notifyBtnPrimary: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  notifyBtnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  notifyBtnText: { color: '#0f766e', fontWeight: '700', fontSize: 14 },
  notifyBtnGhost: { borderStyle: 'dashed' },
  notifyBtnGhostText: { color: '#64748b', fontWeight: '600', fontSize: 13 },
  period: { fontSize: 13, color: adminTheme.colors.textMuted, marginBottom: 16, fontWeight: '600' },
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.borderLight,
  },
  netCard: { borderColor: adminTheme.colors.primary, backgroundColor: '#fffbeb' },
  label: { fontSize: 13, color: adminTheme.colors.textMuted, fontWeight: '600' },
  value: { fontSize: 22, fontWeight: '800', color: adminTheme.colors.text, marginTop: 4 },
});
