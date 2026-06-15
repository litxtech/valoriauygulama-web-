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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';

export type ProjectPickerItem = { id: string; name: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  items: ProjectPickerItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  title?: string;
};

export function ProjectPickerSheet({
  visible,
  onClose,
  items,
  selectedId,
  onSelect,
  title = 'Proje seç',
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((p) => p.name.toLowerCase().includes(q));
  }, [items, search]);

  const handleClose = () => {
    setSearch('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.bg} onPress={handleClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>Gider veya geliri bir projeye bağlayın (opsiyonel)</Text>

          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={20} color={adminTheme.colors.textMuted} />
            <TextInput
              style={styles.search}
              placeholder="Proje ara…"
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
              router.push('/admin/accounting/counterparties');
            }}
          >
            <View style={styles.addIcon}>
              <Ionicons name="folder-open-outline" size={22} color="#7c3aed" />
            </View>
            <Text style={styles.addText}>Cariler → Projeler sekmesinden ekle</Text>
            <Ionicons name="chevron-forward" size={20} color={adminTheme.colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.noneRow, selectedId == null && styles.noneRowOn]}
            onPress={() => {
              onSelect(null);
              handleClose();
            }}
            activeOpacity={0.88}
          >
            <View style={styles.noneIcon}>
              <Ionicons name="remove-circle-outline" size={22} color={adminTheme.colors.textMuted} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowName}>Proje yok</Text>
              <Text style={styles.rowSub}>Genel işletme kaydı</Text>
            </View>
            {selectedId == null ? (
              <Ionicons name="checkmark-circle" size={24} color={adminTheme.colors.primary} />
            ) : null}
          </TouchableOpacity>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
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
                  <View style={styles.projectIcon}>
                    <Ionicons name="folder" size={20} color="#7c3aed" />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowName}>{item.name}</Text>
                    <Text style={styles.rowSub}>Proje</Text>
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
                {search.trim()
                  ? 'Eşleşen proje yok.'
                  : 'Henüz proje tanımlı değil. Cariler ekranından proje ekleyebilirsiniz.'}
              </Text>
            }
          />

          <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
            <Text style={styles.closeBtnText}>Kapat</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: adminTheme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: adminTheme.colors.border,
    alignSelf: 'center',
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
    backgroundColor: '#f5f3ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#7c3aed' },
  noneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 12,
    marginBottom: 4,
  },
  noneRowOn: { backgroundColor: adminTheme.colors.surfaceSecondary },
  noneIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminTheme.colors.surfaceTertiary,
  },
  list: { flexGrow: 0, maxHeight: 320 },
  listContent: { paddingBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  rowOn: { backgroundColor: '#f5f3ff' },
  projectIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ede9fe',
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text },
  rowSub: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  empty: { textAlign: 'center', color: adminTheme.colors.textMuted, padding: 24, fontSize: 14 },
  closeBtn: { marginTop: 8, alignItems: 'center', paddingVertical: 14 },
  closeBtnText: { fontSize: 16, fontWeight: '600', color: adminTheme.colors.primary },
});
