import { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatMenuPrice } from '@/lib/hotelKitchenMenu';
import {
  fetchGuestKitchenMenuOrders,
  loadWebPublicKitchenMenuOrderHistory,
  orderStatusLabelKey,
  type KitchenMenuOrderRecord,
} from '@/lib/publicKitchenMenuOrderHistory';
import {
  sendKitchenMenuReceiptEmail,
  shareKitchenMenuOrderPdf,
} from '@/lib/kitchenMenuOrderReceipt';

type Props = {
  visible: boolean;
  onClose: () => void;
  orgName: string;
  orgSlug: string;
  mode: 'web' | 'guest';
  accentColor?: string;
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function PublicKitchenMenuOrderHistorySheet({
  visible,
  onClose,
  orgName,
  orgSlug,
  mode,
  accentColor = '#c9a227',
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<KitchenMenuOrderRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows =
        mode === 'guest'
          ? await fetchGuestKitchenMenuOrders()
          : await loadWebPublicKitchenMenuOrderHistory(orgSlug);
      setOrders(rows);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [mode, orgSlug]);

  useEffect(() => {
    if (!visible) return;
    void load();
  }, [visible, load]);

  const handlePdf = async (order: KitchenMenuOrderRecord) => {
    setPdfBusyId(order.id);
    try {
      await shareKitchenMenuOrderPdf(order, orgName);
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('publicKitchenMenuReceiptPdfError'));
    } finally {
      setPdfBusyId(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: Platform.OS === 'web' ? '86%' : '92%' }]}
          onPress={(e) => e.stopPropagation?.()}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Ionicons name="receipt-outline" size={22} color={accentColor} />
            <Text style={styles.headerTitle}>{t('publicKitchenMenuOrderHistory')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={accentColor} />
            </View>
          ) : orders.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="file-tray-outline" size={40} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>{t('publicKitchenMenuOrderHistoryEmpty')}</Text>
              <Text style={styles.emptyBody}>{t('publicKitchenMenuOrderHistoryEmptyHint')}</Text>
            </View>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 12 }}>
              {orders.map((order) => {
                const open = expandedId === order.id;
                return (
                  <View key={order.id} style={styles.card}>
                    <TouchableOpacity style={styles.cardHead} onPress={() => setExpandedId(open ? null : order.id)}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardDate}>{formatWhen(order.paid_at || order.created_at)}</Text>
                        <Text style={styles.cardTotal}>{formatMenuPrice(order.total_amount)}</Text>
                        <Text style={styles.cardStatus}>{t(orderStatusLabelKey(order.status))}</Text>
                      </View>
                      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#94a3b8" />
                    </TouchableOpacity>

                    {open ? (
                      <View style={styles.cardBody}>
                        {order.items.map((line, idx) => (
                          <View key={`${order.id}-${idx}`} style={styles.lineRow}>
                            <Text style={styles.lineName} numberOfLines={2}>
                              {line.item_name} ×{line.quantity}
                            </Text>
                            <Text style={styles.lineAmt}>{formatMenuPrice(line.line_total)}</Text>
                          </View>
                        ))}

                        <View style={styles.actions}>
                          <TouchableOpacity
                            style={[styles.actionBtn, { borderColor: `${accentColor}55` }]}
                            onPress={() => sendKitchenMenuReceiptEmail(order, orgName)}
                          >
                            <Ionicons name="mail-outline" size={16} color={accentColor} />
                            <Text style={[styles.actionText, { color: accentColor }]}>{t('publicKitchenMenuReceiptSend')}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.actionBtn, { borderColor: `${accentColor}55` }]}
                            onPress={() => void handlePdf(order)}
                            disabled={pdfBusyId === order.id}
                          >
                            {pdfBusyId === order.id ? (
                              <ActivityIndicator size="small" color={accentColor} />
                            ) : (
                              <Ionicons name="document-outline" size={16} color={accentColor} />
                            )}
                            <Text style={[styles.actionText, { color: accentColor }]}>{t('publicKitchenMenuReceiptPdf')}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 8,
    minHeight: 280,
  },
  handle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', marginBottom: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: '#0f172a' },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 36, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#334155' },
  emptyBody: { fontSize: 13, color: '#94a3b8', textAlign: 'center', paddingHorizontal: 24 },
  list: { flex: 1 },
  card: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  cardDate: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  cardTotal: { fontSize: 17, fontWeight: '800', color: '#0f172a', marginTop: 2 },
  cardStatus: { fontSize: 11, color: '#16a34a', fontWeight: '700', marginTop: 4 },
  cardBody: { borderTopWidth: 1, borderTopColor: '#f1f5f9', padding: 12, gap: 8 },
  lineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  lineName: { flex: 1, fontSize: 13, color: '#334155' },
  lineAmt: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: '#fff',
  },
  actionText: { fontSize: 12, fontWeight: '700' },
});
