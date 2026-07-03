import { useCallback, useLayoutEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AdminStackBackButton } from '@/lib/adminStackBack';
import { useAuthStore } from '@/stores/authStore';
import {
  listFacilityJournalRecordTypes,
  seedDefaultFacilityJournalTypes,
  upsertFacilityJournalRecordType,
  type FacilityJournalRecordTypeRow,
} from '@/lib/facilityJournal';
import { canManageFacilityJournalTypes } from '@/lib/staffPermissions';
import { adminTheme } from '@/constants/adminTheme';
import { theme } from '@/constants/theme';
import { useCachedList } from '@/hooks/useCachedList';

export default function FacilityJournalTypesScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const pathname = usePathname();
  const staff = useAuthStore((s) => s.staff);
  const isAdminRoute = pathname?.startsWith('/admin') ?? false;
  const base = '/admin/facility-journal';
  const allowed = canManageFacilityJournalTypes(staff);

  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const cacheKey = staff?.organization_id
    ? `facility-journal-types:${staff.organization_id}`
    : 'facility-journal-types:none';

  const fetchItems = useCallback(async () => {
    if (!staff?.organization_id) return [];
    await seedDefaultFacilityJournalTypes(staff.organization_id, staff.id);
    const { data } = await listFacilityJournalRecordTypes(staff.organization_id, false);
    return (data as FacilityJournalRecordTypeRow[]) ?? [];
  }, [staff?.organization_id, staff?.id]);

  const { items: types, reload, showList } = useCachedList({
    cacheKey,
    enabled: !!staff?.organization_id && allowed,
    fetchItems,
  });

  const load = reload;

  useLayoutEffect(() => {
    if (!allowed) {
      router.replace(isAdminRoute ? '/admin' : '/staff');
      return;
    }
    navigation.setOptions({
      headerLeft: () => <AdminStackBackButton accessibilityLabel="Geri" fallback={base as never} />,
    });
  }, [navigation, allowed, router, isAdminRoute, base]);

  const addType = async () => {
    if (!staff?.organization_id || !newName.trim()) {
      Alert.alert('Hata', 'Tip adı girin.');
      return;
    }
    setSaving(true);
    const { error } = await upsertFacilityJournalRecordType({
      organizationId: staff.organization_id,
      staffId: staff.id,
      name: newName.trim(),
    });
    setSaving(false);
    if (error) Alert.alert('Hata', (error as { message?: string }).message ?? 'Kaydedilemedi');
    else {
      setNewName('');
      load();
    }
  };

  const toggleActive = async (row: FacilityJournalRecordTypeRow) => {
    if (!staff?.organization_id) return;
    await upsertFacilityJournalRecordType({
      organizationId: staff.organization_id,
      staffId: staff.id,
      id: row.id,
      name: row.name,
      icon: row.icon,
      sortOrder: row.sort_order,
      isActive: !row.is_active,
    });
    load();
  };

  if (!allowed) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.intro}>
        Kayıt tiplerini siz tanımlarsınız (değişiklik, zimmet, emanet vb.). Personel yalnızca listeden seçer.
      </Text>

      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder="Yeni tip adı"
          placeholderTextColor={adminTheme.muted}
          value={newName}
          onChangeText={setNewName}
        />
        <TouchableOpacity style={styles.addBtn} onPress={addType} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="add" size={24} color="#fff" />}
        </TouchableOpacity>
      </View>

      {!showList && types.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={theme.colors.primary} />
      ) : (
        <FlatList
          data={types}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowBody}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowSlug}>{item.slug}</Text>
              </View>
              <TouchableOpacity onPress={() => toggleActive(item)}>
                <Text style={[styles.badge, item.is_active ? styles.badgeOn : styles.badgeOff]}>
                  {item.is_active ? 'Aktif' : 'Pasif'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.bg },
  intro: { padding: 16, fontSize: 14, color: adminTheme.muted, lineHeight: 20 },
  addRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: adminTheme.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: adminTheme.text,
    backgroundColor: '#fff',
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: adminTheme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: adminTheme.border,
  },
  rowBody: { flex: 1 },
  rowName: { fontSize: 16, fontWeight: '600', color: adminTheme.text },
  rowSlug: { fontSize: 12, color: adminTheme.muted, marginTop: 2 },
  badge: { fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeOn: { backgroundColor: '#dcfce7', color: '#166534' },
  badgeOff: { backgroundColor: '#f1f5f9', color: '#64748b' },
});
