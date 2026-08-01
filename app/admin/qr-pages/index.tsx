import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { AdminOrganizationPicker } from '@/components/admin/AdminOrganizationPicker';
import {
  buildPublicQrPageUrl,
  createQrPage,
  listQrPages,
  type QrPageRow,
} from '@/lib/qrPages';

export default function AdminQrPagesListScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const { organizations, selectedOrganizationId, loadOrganizations } = useAdminOrgStore();
  const [pages, setPages] = useState<QrPageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const canUseAll = staff?.role === 'admin';
  const orgId = useMemo(() => {
    if (selectedOrganizationId && selectedOrganizationId !== 'all') return selectedOrganizationId;
    return staff?.organization_id ?? '';
  }, [selectedOrganizationId, staff?.organization_id]);

  const load = useCallback(async () => {
    if (!orgId) {
      setPages([]);
      return;
    }
    const result = await listQrPages(orgId);
    if (result.error) Alert.alert('Hata', result.error);
    setPages(result.data);
  }, [orgId]);

  useFocusEffect(
    useCallback(() => {
      void loadOrganizations();
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [load, loadOrganizations])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const onCreate = async () => {
    if (!orgId) {
      Alert.alert('İşletme seçin', 'Sayfa oluşturmak için bir işletme seçin.');
      return;
    }
    setCreating(true);
    try {
      const result = await createQrPage({
        organizationId: orgId,
        title: newTitle,
        createdByStaffId: staff?.id ?? null,
      });
      if (result.error || !result.data) {
        Alert.alert('Hata', result.error || 'Sayfa oluşturulamadı.');
        return;
      }
      setNewTitle('');
      router.push(`/admin/qr-pages/${result.data.id}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>QR Sayfalar</Text>
        <Text style={styles.sub}>
          Oluşturunca web adresi ve QR hazır olur. Metin, resim ve video ekleyin.
        </Text>
        <AdminOrganizationPicker
          canUseAll={canUseAll}
          ownOrganizationId={staff?.organization_id}
          compact
        />
      </View>

      <View style={styles.createCard}>
        <TextInput
          style={styles.input}
          value={newTitle}
          onChangeText={setNewTitle}
          placeholder="Sayfa başlığı (ör. Kahvaltı menüsü)"
          placeholderTextColor="#94a3b8"
        />
        <TouchableOpacity
          style={[styles.createBtn, creating && styles.createBtnDisabled]}
          onPress={() => void onCreate()}
          disabled={creating}
          activeOpacity={0.88}
        >
          {creating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={20} color="#fff" />
              <Text style={styles.createBtnText}>Yeni sayfa + QR</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1a365d" />
        </View>
      ) : (
        <FlatList
          data={pages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {orgId ? 'Henüz sayfa yok. Yukarıdan oluşturun.' : 'Önce işletme seçin.'}
            </Text>
          }
          renderItem={({ item }) => {
            const url = buildPublicQrPageUrl(item.public_token);
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push(`/admin/qr-pages/${item.id}`)}
                activeOpacity={0.88}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <View style={[styles.badge, item.is_published ? styles.badgeOn : styles.badgeOff]}>
                    <Text style={styles.badgeText}>{item.is_published ? 'Yayında' : 'Kapalı'}</Text>
                  </View>
                </View>
                <Text style={styles.cardUrl} numberOfLines={1}>
                  {url}
                </Text>
                <Text style={styles.cardMeta}>
                  Güncellendi: {new Date(item.updated_at).toLocaleString('tr-TR')}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 8 },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  sub: { fontSize: 14, color: '#64748b', lineHeight: 20 },
  createCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a365d',
    borderRadius: 10,
    paddingVertical: 13,
  },
  createBtnDisabled: { opacity: 0.7 },
  createBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  list: { padding: 16, paddingTop: 8, paddingBottom: 40, gap: 10 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 40, fontSize: 14 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: '#0f172a' },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeOn: { backgroundColor: '#ecfdf5' },
  badgeOff: { backgroundColor: '#f1f5f9' },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#0f766e' },
  cardUrl: { marginTop: 8, fontSize: 12, color: '#475569' },
  cardMeta: { marginTop: 6, fontSize: 11, color: '#94a3b8' },
});
