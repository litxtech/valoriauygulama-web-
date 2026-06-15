import { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import { formatPaymentAmount, type AdminPaymentRequestRow } from '@/lib/payments';
import { stripePaymentIncomeLabel } from '@/lib/financeIncomeStripe';

type Props = {
  visible: boolean;
  onClose: () => void;
  items: AdminPaymentRequestRow[];
  loading?: boolean;
  selectedId: string | null;
  onSelect: (row: AdminPaymentRequestRow) => void;
};

export function StripePaymentLinkSheet({
  visible,
  onClose,
  items,
  loading,
  selectedId,
  onSelect,
}: Props) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) => stripePaymentIncomeLabel(r).toLowerCase().includes(q));
  }, [items, search]);

  const handleClose = () => {
    setSearch('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.bg} onPress={handleClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Stripe POS ödemesi</Text>
        <Text style={styles.sub}>Ödenmiş ve henüz deftere bağlanmamış tahsilatlar</Text>

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={20} color={adminTheme.colors.textMuted} />
          <TextInput
            style={styles.search}
            placeholder="Başlık, misafir…"
            placeholderTextColor={adminTheme.colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginVertical: 24 }} color={adminTheme.colors.primary} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const selected = selectedId === item.id;
              return (
                <TouchableOpacity
                  style={[styles.row, selected && styles.rowOn]}
                  onPress={() => {
                    onSelect(item);
                    handleClose();
                  }}
                  activeOpacity={0.88}
                >
                  <View style={styles.stripeIcon}>
                    <Ionicons name="card-outline" size={22} color="#635bff" />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowName} numberOfLines={2}>
                      {stripePaymentIncomeLabel(item)}
                    </Text>
                    <Text style={styles.rowSub}>
                      {formatPaymentAmount(Number(item.amount), item.currency)}
                      {item.paid_at ? ` · ${item.paid_at.slice(0, 10)}` : ''}
                    </Text>
                  </View>
                  {selected ? (
                    <Ionicons name="checkmark-circle" size={24} color={adminTheme.colors.primary} />
                  ) : (
                    <Ionicons name="chevron-forward" size={20} color={adminTheme.colors.border} />
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.empty}>
                Bağlanacak ödenmiş Stripe kaydı yok. Tutarı elle girebilirsiniz.
              </Text>
            }
          />
        )}

        <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
          <Text style={styles.closeBtnText}>Kapat</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: adminTheme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: adminTheme.colors.border,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  title: { fontSize: 20, fontWeight: '800', color: adminTheme.colors.text },
  sub: { fontSize: 13, color: adminTheme.colors.textMuted, marginBottom: 14 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  search: { flex: 1, fontSize: 16, color: adminTheme.colors.text, paddingVertical: 12 },
  list: { maxHeight: 360 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  rowOn: { backgroundColor: '#eef2ff' },
  stripeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2ff',
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  rowSub: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 4 },
  empty: { textAlign: 'center', color: adminTheme.colors.textMuted, padding: 24, fontSize: 14 },
  closeBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 14 },
  closeBtnText: { fontSize: 16, fontWeight: '600', color: adminTheme.colors.primary },
});
