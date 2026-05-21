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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import { COUNTERPARTY_TYPE_META, counterpartyInitials } from '@/lib/financeCounterpartyUi';
import type { FinanceCounterpartyType } from '@/lib/financeLedger';

export type CounterpartyPickerItem = {
  id: string;
  name: string;
  party_type: FinanceCounterpartyType;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  items: CounterpartyPickerItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  title?: string;
  allowFreeText?: boolean;
  onFreeText?: () => void;
};

export function CounterpartyPickerSheet({
  visible,
  onClose,
  items,
  selectedId,
  onSelect,
  title = 'Kim?',
  allowFreeText = true,
  onFreeText,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => c.name.toLowerCase().includes(q));
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
        <Text style={styles.sub}>Kayıtlı kişi veya firmayı seçin</Text>

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={20} color={adminTheme.colors.textMuted} />
          <TextInput
            style={styles.search}
            placeholder="İsim ara…"
            placeholderTextColor={adminTheme.colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
        </View>

        <TouchableOpacity
          style={styles.addRow}
          onPress={() => {
            handleClose();
            router.push('/admin/accounting/counterparties/new');
          }}
        >
          <View style={styles.addIcon}>
            <Ionicons name="person-add" size={22} color={adminTheme.colors.primary} />
          </View>
          <Text style={styles.addText}>Yeni kişi / firma ekle</Text>
          <Ionicons name="chevron-forward" size={20} color={adminTheme.colors.textMuted} />
        </TouchableOpacity>

        {allowFreeText ? (
          <TouchableOpacity
            style={styles.freeRow}
            onPress={() => {
              onSelect(null);
              onFreeText?.();
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
            const meta = COUNTERPARTY_TYPE_META[item.party_type] ?? COUNTERPARTY_TYPE_META.other;
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
                <View style={[styles.avatar, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.avatarText, { color: meta.color }]}>
                    {counterpartyInitials(item.name)}
                  </Text>
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  <Text style={[styles.rowType, { color: meta.color }]}>{meta.label} · {meta.hint}</Text>
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
            <Text style={styles.empty}>Eşleşen kayıt yok. Yeni ekleyin veya elle yazın.</Text>
          }
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
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.border,
    marginBottom: 4,
  },
  addIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { flex: 1, fontSize: 15, fontWeight: '700', color: adminTheme.colors.primary },
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
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '800' },
  rowBody: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text },
  rowType: { fontSize: 11, marginTop: 3 },
  empty: { textAlign: 'center', color: adminTheme.colors.textMuted, padding: 24, fontSize: 14 },
  closeBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 14 },
  closeBtnText: { fontSize: 16, fontWeight: '600', color: adminTheme.colors.primary },
});
