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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import type { IncomeGuestOption } from '@/lib/financeIncomeStripe';

type Props = {
  visible: boolean;
  onClose: () => void;
  items: IncomeGuestOption[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  title?: string;
  onFreeText?: () => void;
};

export function GuestPickerSheet({
  visible,
  onClose,
  items,
  selectedId,
  onSelect,
  title = 'Misafir seç',
  onFreeText,
}: Props) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (g) =>
        g.full_name.toLowerCase().includes(q) ||
        (g.room_number ?? '').toLowerCase().includes(q)
    );
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
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>Kayıtlı misafir veya müşteri</Text>

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={20} color={adminTheme.colors.textMuted} />
          <TextInput
            style={styles.search}
            placeholder="İsim veya oda ara…"
            placeholderTextColor={adminTheme.colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
        </View>

        {onFreeText ? (
          <TouchableOpacity
            style={styles.freeRow}
            onPress={() => {
              onSelect(null);
              onFreeText();
              handleClose();
            }}
          >
            <Ionicons name="create-outline" size={20} color={adminTheme.colors.textMuted} />
            <Text style={styles.freeText}>Listede yok — adı elle yazacağım</Text>
          </TouchableOpacity>
        ) : null}

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
                  onSelect(item.id);
                  handleClose();
                }}
                activeOpacity={0.88}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{item.full_name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowName}>{item.full_name}</Text>
                  <Text style={styles.rowSub}>
                    {[item.room_number ? `Oda ${item.room_number}` : null, item.status].filter(Boolean).join(' · ')}
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
          ListEmptyComponent={<Text style={styles.empty}>Eşleşen misafir yok. İsim yazarak devam edebilirsiniz.</Text>}
        />

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
  freeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    marginBottom: 8,
  },
  freeText: { fontSize: 14, color: adminTheme.colors.textMuted },
  list: { maxHeight: 340 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  rowOn: { backgroundColor: adminTheme.colors.surfaceSecondary },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dcfce7',
  },
  avatarText: { fontSize: 15, fontWeight: '800', color: '#166534' },
  rowBody: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text },
  rowSub: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  empty: { textAlign: 'center', color: adminTheme.colors.textMuted, padding: 24, fontSize: 14 },
  closeBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 14 },
  closeBtnText: { fontSize: 16, fontWeight: '600', color: adminTheme.colors.primary },
});
