import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, RefreshControl, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { canAccessKitchenReceptionAccounting } from '@/lib/staffPermissions';
import { fmtKitchenMoney } from '@/lib/kitchenOps/stockStatus';
import { KITCHEN_POS_STATUSES } from '@/lib/kitchenOps/constants';
import { formatDateShort, formatTime } from '@/lib/date';
import { checkPosMismatch } from '@/lib/kitchenOps/api';
import { Ionicons } from '@expo/vector-icons';

type PosRow = { id: string; entry_date: string; amount: number; net_amount: number; description: string | null; status: string; created_at: string; created_by: string | null; staff?: { full_name: string | null } | null };

const STATUS_LABELS = Object.fromEntries(KITCHEN_POS_STATUSES.map((s) => [s.value, s.label]));
const NEXT_STATUS: Record<string, string> = { pending: 'approved', approved: 'transferred', transferred: 'commission_deducted', commission_deducted: 'completed' };

export function KitchenReceptionPanel() {
  const staff = useAuthStore((s) => s.staff);
  const allowed = canAccessKitchenReceptionAccounting(staff);
  const [rows, setRows] = useState<PosRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [posMismatch, setPosMismatch] = useState(false);

  const load = useCallback(async () => {
    const [{ data }, mismatch] = await Promise.all([
      supabase.from('kitchen_pos_transactions').select('id, entry_date, amount, net_amount, description, status, created_at, created_by, staff:created_by(full_name)').order('created_at', { ascending: false }).limit(50),
      checkPosMismatch(),
    ]);
    setRows((data ?? []) as PosRow[]);
    setPosMismatch(mismatch);
  }, []);

  useEffect(() => { if (allowed) load().finally(() => setLoading(false)); else setLoading(false); }, [allowed, load]);

  const advanceStatus = async (row: PosRow) => {
    const next = NEXT_STATUS[row.status];
    if (!next) return;
    const { error } = await supabase.from('kitchen_pos_transactions').update({
      status: next,
      approved_by: staff?.id,
      approved_at: new Date().toISOString(),
    }).eq('id', row.id);
    if (error) Alert.alert('Hata', error.message);
    else load();
  };

  if (!allowed) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={48} color={theme.colors.textMuted} />
        <Text style={styles.denied}>Reception muhasebe yetkisi gerekli.</Text>
      </View>
    );
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;

  return (
    <View style={styles.container}>
      {posMismatch ? (
        <View style={styles.warn}>
          <Ionicons name="warning" size={18} color="#dc2626" />
          <Text style={styles.warnText}>Kasa farkı bulundu — POS hasılatı ile kayıtlar uyuşmuyor.</Text>
        </View>
      ) : null}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        renderItem={({ item }) => {
          const s = item.staff as { full_name: string | null } | null;
          return (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.amount}>{fmtKitchenMoney(Number(item.amount))}</Text>
                <Text style={[styles.status, item.status === 'pending' && styles.pending]}>{STATUS_LABELS[item.status]}</Text>
              </View>
              <Text style={styles.meta}>{formatDateShort(item.entry_date)} {formatTime(item.created_at)} · {s?.full_name ?? '—'}</Text>
              {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
              {NEXT_STATUS[item.status] ? (
                <TouchableOpacity style={styles.approveBtn} onPress={() => advanceStatus(item)}>
                  <Text style={styles.approveText}>Onayla → {STATUS_LABELS[NEXT_STATUS[item.status]]}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>Bekleyen POS işlemi yok.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  denied: { marginTop: 12, color: theme.colors.textSecondary, textAlign: 'center' },
  warn: { flexDirection: 'row', gap: 8, backgroundColor: '#fef2f2', margin: 16, marginBottom: 0, padding: 12, borderRadius: 12, alignItems: 'center' },
  warnText: { flex: 1, color: '#dc2626', fontSize: 13, fontWeight: '600' },
  list: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: theme.colors.borderLight },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amount: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  status: { fontSize: 12, fontWeight: '700', color: '#059669' },
  pending: { color: '#d97706' },
  meta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
  desc: { fontSize: 14, color: theme.colors.text, marginTop: 4 },
  approveBtn: { marginTop: 10, backgroundColor: theme.colors.primary, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  approveText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  empty: { textAlign: 'center', color: theme.colors.textMuted, marginTop: 40 },
});
