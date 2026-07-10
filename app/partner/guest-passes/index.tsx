import { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  Text,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  PartnerChip,
  PartnerEmptyState,
  PartnerHero,
  PartnerPrimaryButton,
} from '@/components/breakfastPartner/PartnerUi';
import {
  breakfastGuestPassStatusLabel,
  listPartnerBreakfastGuestPasses,
  type BreakfastGuestPass,
  type BreakfastGuestPassStatus,
} from '@/lib/breakfastGuestPass';
import {
  formatPartnerDateTurkish,
  todayIstanbulDate,
  tomorrowIstanbulDate,
} from '@/lib/breakfastPartner';
import { partnerRadii, partnerTheme } from '@/lib/breakfastPartnerTheme';

function statusColor(status: BreakfastGuestPassStatus): string {
  if (status === 'redeemed') return partnerTheme.success;
  if (status === 'cancelled') return partnerTheme.muted;
  return partnerTheme.accent;
}

function PassRow({ item, onPress }: { item: BreakfastGuestPass; onPress: () => void }) {
  const status = item.status;
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={styles.rowTop}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.guestName}
          </Text>
          <Text style={[styles.status, { color: statusColor(status) }]}>
            {breakfastGuestPassStatusLabel(status)}
          </Text>
        </View>
        <Text style={styles.rowMeta}>
          {item.roomNumber ? `Oda ${item.roomNumber} · ` : ''}
          {formatPartnerDateTurkish(item.recordDate, { weekday: false })}
        </Text>
      </View>
      <Ionicons name="qr-code-outline" size={22} color={partnerTheme.accent} />
    </Pressable>
  );
}

export default function PartnerGuestPassesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const todayIso = todayIstanbulDate();
  const tomorrowIso = tomorrowIstanbulDate();
  const [dateFilter, setDateFilter] = useState(todayIso);
  const [passes, setPasses] = useState<BreakfastGuestPass[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await listPartnerBreakfastGuestPasses(dateFilter);
      setPasses(res.passes);
    } catch {
      setPasses([]);
    }
    setLoading(false);
    setRefreshing(false);
  }, [dateFilter]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <PartnerHero
        title="Misafir QR biletleri"
        subtitle="Her misafir için özel kahvaltı QR — Valoria resepsiyon okutunca onaylanır"
        onBack={() => router.back()}
      />

      <View style={styles.actions}>
        <PartnerPrimaryButton
          label="Yeni misafir QR oluştur"
          onPress={() => router.push('/partner/guest-passes/new')}
        />
      </View>

      <View style={styles.chipRow}>
        <PartnerChip
          label="Bugün"
          active={dateFilter === todayIso}
          onPress={() => setDateFilter(todayIso)}
        />
        <PartnerChip
          label="Yarın"
          active={dateFilter === tomorrowIso}
          onPress={() => setDateFilter(tomorrowIso)}
        />
      </View>

      {loading && passes.length === 0 ? (
        <ActivityIndicator color={partnerTheme.accent} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={passes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor={partnerTheme.accent}
            />
          }
          ListEmptyComponent={
            <PartnerEmptyState
              icon="qr-code-outline"
              title="Henüz QR bilet yok"
              body="Misafirinize özel QR oluşturun; kahvaltı günü resepsiyonda okutulunca onaylanır."
            />
          }
          renderItem={({ item }) => (
            <PassRow item={item} onPress={() => router.push(`/partner/guest-passes/${item.id}`)} />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: partnerTheme.bg },
  actions: { paddingHorizontal: 18, paddingBottom: 8 },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
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
  rowName: { color: partnerTheme.text, fontWeight: '800', fontSize: 16, flex: 1 },
  status: { fontSize: 12, fontWeight: '700' },
  rowMeta: { color: partnerTheme.muted, fontSize: 13 },
});
