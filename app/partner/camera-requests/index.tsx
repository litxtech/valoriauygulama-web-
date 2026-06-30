import { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  Text,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  PartnerEmptyState,
  PartnerHero,
  PartnerPrimaryButton,
} from '@/components/breakfastPartner/PartnerUi';
import { PartnerCameraRequestStatusChip } from '@/components/breakfastPartner/PartnerCameraRequestStatusChip';
import {
  formatCameraRequestCreatedMeta,
  formatCameraRequestListMeta,
  partnerListCameraRequests,
  type CameraRequestRow,
} from '@/lib/breakfastPartnerCameraRequests';
import { partnerRadii, partnerTheme } from '@/lib/breakfastPartnerTheme';

function RequestRow({ item, onPress }: { item: CameraRequestRow; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={styles.rowTop}>
          <Text style={styles.rowDate}>{formatCameraRequestListMeta(item)}</Text>
          <PartnerCameraRequestStatusChip status={item.status} />
        </View>
        <Text style={styles.rowReason} numberOfLines={2}>
          {item.requestReason}
        </Text>
        <Text style={styles.rowMeta}>Oluşturma: {formatCameraRequestCreatedMeta(item.createdAt)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={partnerTheme.muted} />
    </Pressable>
  );
}

export default function PartnerCameraRequestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<CameraRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await partnerListCameraRequests());
    } catch {
      setRows([]);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <PartnerHero
        title="Kamera Taleplerim"
        subtitle="Geçmiş kahvaltı kayıtları için kamera görüntüsü talepleri"
        onBack={() => router.back()}
      />
      <View style={styles.actions}>
        <PartnerPrimaryButton
          label="Yeni talep oluştur"
          onPress={() => router.push('/partner/camera-requests/new')}
        />
      </View>
      {loading && rows.length === 0 ? (
        <ActivityIndicator color={partnerTheme.accent} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={partnerTheme.accent} />
          }
          ListEmptyComponent={
            <PartnerEmptyState
              icon="videocam-off-outline"
              title="Henüz kamera talebi yok"
              body="Belirli bir tarih ve saat için kahvaltı giriş kaydını doğrulamak üzere talep oluşturabilirsiniz."
            />
          }
          renderItem={({ item }) => (
            <RequestRow item={item} onPress={() => router.push(`/partner/camera-requests/${item.id}`)} />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: partnerTheme.bg },
  actions: { paddingHorizontal: 18, paddingBottom: 8 },
  list: { paddingHorizontal: 18, paddingTop: 8, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: partnerTheme.card,
    borderRadius: partnerRadii.lg,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
    padding: 14,
    marginBottom: 10,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowDate: { color: partnerTheme.text, fontWeight: '800', fontSize: 15, flex: 1 },
  rowReason: { color: partnerTheme.mutedSoft, fontSize: 14, lineHeight: 20 },
  rowMeta: { color: partnerTheme.muted, fontSize: 12 },
});
