import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTradePartnerAuthStore } from '@/stores/tradePartnerAuthStore';
import {
  fetchPartnerPortalTransactions,
  formatTradeMoney,
  respondTradeTransaction,
} from '@/lib/tradePartner';
import { tradePartnerTheme as theme, TRADE_TX_STATUS_LABELS } from '@/lib/tradePartnerTheme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'expo-router';
import { safeRouterReplace } from '@/lib/safeRouter';

type TxRow = Awaited<ReturnType<typeof fetchPartnerPortalTransactions>>[number];

export default function TradePartnerHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const partner = useTradePartnerAuthStore((s) => s.partner);
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [disputeNote, setDisputeNote] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchPartnerPortalTransactions());
    } catch {
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const signOut = async () => {
    await useAuthStore.getState().signOut();
    useTradePartnerAuthStore.getState().clearPartner();
    safeRouterReplace(router, '/trade-partner/login');
  };

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setDisputeNote('');
  };

  const respond = async (action: 'approve' | 'dispute') => {
    if (!selectedId) return;
    if (action === 'dispute' && !disputeNote.trim()) {
      Alert.alert('İtiraz', 'Lütfen itiraz notunuzu yazın.');
      return;
    }
    setActing(true);
    try {
      await respondTradeTransaction(selectedId, action, disputeNote.trim() || undefined);
      setSelectedId(null);
      await load();
      useTradePartnerAuthStore.getState().resolvePartner(useAuthStore.getState().user);
      Alert.alert('Tamam', action === 'approve' ? 'İşlem onaylandı.' : 'İtirazınız iletildi.');
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'İşlem yapılamadı');
    }
    setActing(false);
  };

  const selected = rows.find((r) => r.id === selectedId);
  const [detailItems, setDetailItems] = useState<Array<{ description: string; quantity: number; unit_label: string; unit_price: number; line_total: number }>>([]);

  useEffect(() => {
    if (!selectedId) {
      setDetailItems([]);
      return;
    }
    void supabase
      .from('partner_trade_transaction_items')
      .select('description, quantity, unit_label, unit_price, line_total')
      .eq('transaction_id', selectedId)
      .order('sort_order')
      .then(({ data }) => setDetailItems(data ?? []));
  }, [selectedId]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Partner Ticaret</Text>
          <Text style={styles.company}>{partner?.companyName ?? '—'}</Text>
          <Text style={styles.category}>{partner?.categoryName ?? ''}</Text>
        </View>
        <TouchableOpacity onPress={signOut} style={styles.iconBtn}>
          <Ionicons name="log-out-outline" size={20} color={theme.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load().finally(() => setRefreshing(false)); }} tintColor={theme.accent} />}
        >
          {rows.length === 0 ? (
            <Text style={styles.empty}>Henüz işlem yok.</Text>
          ) : (
            rows.map((row) => (
              <TouchableOpacity key={row.id} style={styles.card} onPress={() => openDetail(row.id)} activeOpacity={0.85}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{TRADE_TX_STATUS_LABELS[row.status] ?? row.status}</Text>
                  <Text style={styles.cardMeta}>{new Date(row.created_at).toLocaleDateString('tr-TR')} · {row.item_count} kalem</Text>
                </View>
                <Text style={styles.cardAmount}>{formatTradeMoney(Number(row.total_amount))}</Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={!!selectedId} transparent animationType="slide" onRequestClose={() => setSelectedId(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>İşlem detayı</Text>
            {selected ? (
              <>
                <Text style={styles.modalStatus}>{TRADE_TX_STATUS_LABELS[selected.status] ?? selected.status}</Text>
                <Text style={styles.modalTotal}>{formatTradeMoney(Number(selected.total_amount))}</Text>
                {detailItems.map((item, idx) => (
                  <View key={idx} style={styles.itemRow}>
                    <Text style={styles.itemTitle}>{item.description}</Text>
                    <Text style={styles.itemMeta}>
                      {item.quantity} {item.unit_label} × {formatTradeMoney(Number(item.unit_price))}
                    </Text>
                  </View>
                ))}
                {selected.status === 'pending_approval' ? (
                  <>
                    <TextInput
                      value={disputeNote}
                      onChangeText={setDisputeNote}
                      placeholder="İtiraz notu (itiraz ederken zorunlu)"
                      placeholderTextColor={theme.mutedSoft}
                      style={styles.disputeInput}
                      multiline
                    />
                    <View style={styles.actionRow}>
                      <TouchableOpacity style={[styles.approveBtn, acting && { opacity: 0.6 }]} onPress={() => respond('approve')} disabled={acting}>
                        <Text style={styles.approveText}>Onayla</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.disputeBtn, acting && { opacity: 0.6 }]} onPress={() => respond('dispute')} disabled={acting}>
                        <Text style={styles.disputeText}>İtiraz et</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : null}
              </>
            ) : null}
            <TouchableOpacity onPress={() => setSelectedId(null)} style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={styles.closeText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: { flexDirection: 'row', paddingHorizontal: 16, alignItems: 'flex-start', gap: 10 },
  eyebrow: { color: theme.accent, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  company: { color: theme.text, fontSize: 22, fontWeight: '800' },
  category: { color: theme.muted, fontSize: 13, marginTop: 2 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.cardElevated },
  empty: { color: theme.muted, textAlign: 'center', marginTop: 40 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  cardTitle: { color: theme.text, fontWeight: '700', fontSize: 15 },
  cardMeta: { color: theme.muted, fontSize: 12, marginTop: 2 },
  cardAmount: { color: theme.accent, fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: theme.cardElevated, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, borderWidth: 1, borderColor: theme.cardBorder },
  modalTitle: { color: theme.text, fontSize: 20, fontWeight: '800' },
  modalStatus: { color: theme.accent, fontWeight: '700', marginTop: 6 },
  modalTotal: { color: theme.text, fontSize: 24, fontWeight: '800', marginVertical: 10 },
  itemRow: { marginBottom: 8, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.cardBorder },
  itemTitle: { color: theme.text, fontWeight: '700' },
  itemMeta: { color: theme.muted, fontSize: 12, marginTop: 2 },
  disputeInput: {
    backgroundColor: theme.surfaceInput,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    padding: 12,
    color: theme.text,
    minHeight: 72,
    marginTop: 8,
    textAlignVertical: 'top',
  },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  approveBtn: { flex: 1, backgroundColor: theme.successSoft, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(52,211,153,0.35)' },
  approveText: { color: theme.success, fontWeight: '800' },
  disputeBtn: { flex: 1, backgroundColor: theme.dangerSoft, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(248,113,113,0.35)' },
  disputeText: { color: theme.danger, fontWeight: '800' },
  closeText: { color: theme.muted, fontWeight: '700' },
});
