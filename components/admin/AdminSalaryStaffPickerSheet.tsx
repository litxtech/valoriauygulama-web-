import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pds } from '@/constants/personelDesignSystem';
import { fetchActiveOrgStaff, type OrgStaffOption } from '@/lib/notificationTemplateRecipients';
import { SMART_OPS_ROLE_LABELS } from '@/lib/smartOps';

type Props = {
  visible: boolean;
  organizationId: string | null;
  selectedStaffId: string | null;
  onSelect: (staff: OrgStaffOption | null) => void;
  onClose: () => void;
};

function roleLabel(role: string | null, department: string | null): string {
  if (role && SMART_OPS_ROLE_LABELS[role]) return SMART_OPS_ROLE_LABELS[role];
  if (department) return department;
  return role ?? '';
}

export function AdminSalaryStaffPickerSheet({
  visible,
  organizationId,
  selectedStaffId,
  onSelect,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [staffOptions, setStaffOptions] = useState<OrgStaffOption[]>([]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!organizationId) {
      setStaffOptions([]);
      return;
    }
    setLoading(true);
    try {
      setStaffOptions(await fetchActiveOrgStaff(organizationId));
    } catch {
      setStaffOptions([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!visible) {
      setSearch('');
      return;
    }
    void load();
  }, [visible, load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('tr-TR');
    if (!term) return staffOptions;
    return staffOptions.filter((s) => {
      const name = (s.full_name ?? '').toLocaleLowerCase('tr-TR');
      const dept = (s.department ?? '').toLocaleLowerCase('tr-TR');
      const role = roleLabel(s.role, s.department).toLocaleLowerCase('tr-TR');
      return name.includes(term) || dept.includes(term) || role.includes(term);
    });
  }, [search, staffOptions]);

  const pick = (staff: OrgStaffOption | null) => {
    onSelect(staff);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Personel seçin</Text>
          <Text style={styles.sub}>Maaş ödemesi yapılacak personeli seçin.</Text>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={pds.muted} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Ad, departman veya rol ara…"
              placeholderTextColor={pds.muted}
              autoCorrect={false}
            />
            {search ? (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={pds.muted} />
              </Pressable>
            ) : null}
          </View>

          {loading ? (
            <ActivityIndicator color={pds.indigo} style={styles.loader} />
          ) : !organizationId ? (
            <Text style={styles.empty}>Önce işletme seçin.</Text>
          ) : filtered.length === 0 ? (
            <Text style={styles.empty}>Personel bulunamadı.</Text>
          ) : (
            <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {filtered.map((s) => {
                const active = selectedStaffId === s.id;
                const label = (s.full_name ?? 'İsimsiz').trim();
                const sub = roleLabel(s.role, s.department);
                return (
                  <Pressable
                    key={s.id}
                    style={[styles.item, active && styles.itemActive]}
                    onPress={() => pick(s)}
                  >
                    <View style={[styles.avatar, active && styles.avatarActive]}>
                      <Text style={[styles.avatarText, active && styles.avatarTextActive]}>
                        {label.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.itemBody}>
                      <Text style={[styles.itemName, active && styles.itemNameActive]} numberOfLines={1}>
                        {label}
                      </Text>
                      {sub ? <Text style={styles.itemMeta} numberOfLines={1}>{sub}</Text> : null}
                    </View>
                    {active ? <Ionicons name="checkmark-circle" size={22} color={pds.indigo} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: pds.cardBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    maxHeight: '78%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: pds.divider,
    marginBottom: 14,
  },
  title: { fontSize: 18, fontWeight: '800', color: pds.text },
  sub: { fontSize: 13, color: pds.subtext, marginTop: 4, marginBottom: 14 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: pds.pageBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: pds.cardBorder,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 15, color: pds.text, padding: 0 },
  loader: { marginVertical: 24 },
  empty: { fontSize: 14, color: pds.subtext, textAlign: 'center', marginVertical: 24 },
  scroll: { maxHeight: 420 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 6,
  },
  itemActive: { backgroundColor: '#ECFDF5', borderColor: '#10B981' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: pds.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarActive: { backgroundColor: '#10B981' },
  avatarText: { fontSize: 16, fontWeight: '800', color: pds.subtext },
  avatarTextActive: { color: '#fff' },
  itemBody: { flex: 1, minWidth: 0 },
  itemName: { fontSize: 15, fontWeight: '700', color: pds.text },
  itemNameActive: { color: '#047857' },
  itemMeta: { fontSize: 12, color: pds.muted, marginTop: 2 },
});
