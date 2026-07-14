import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { theme } from '@/constants/theme';
import { kbsQueryOptions } from '@/lib/kbsReactQuery';
import {
  type KbsRoomGuest,
  type KbsRoomSummary,
  changeKbsRoomAndNotify,
  fetchKbsRoomsSummary,
  listRoomsForPicker,
} from '@/lib/kbsSubmissionBoard';
import { useAuthStore } from '@/stores/authStore';
import { canKbsCheckin, canKbsDeleteAndResubmit } from '@/lib/kbsStaysPermissions';

function scanLabel(g: KbsRoomGuest): string {
  if (g.notified) return 'Bildirildi';
  if (g.scanStatus === 'ready_to_submit') return 'Hazır';
  if (g.scanStatus === 'failed') return 'Hatalı';
  return g.stayStatus || g.scanStatus || '—';
}

export default function RoomsLiveViewScreen() {
  const staff = useAuthStore((s) => s.staff);
  const canNotify = canKbsCheckin(staff);
  const canRoomChange = canKbsDeleteAndResubmit(staff) || canNotify;
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyGuestId, setBusyGuestId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'occupied' | 'notified'>('occupied');

  const q = useQuery({
    queryKey: ['kbs', 'rooms_summary'],
    queryFn: async () => {
      const res = await fetchKbsRoomsSummary();
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
    ...kbsQueryOptions,
    refetchInterval: 15_000,
  });

  const rooms = useMemo(() => {
    let list = q.data ?? [];
    const s = search.trim();
    if (s) list = list.filter((r) => String(r.roomNumber).includes(s));
    if (filter === 'occupied') list = list.filter((r) => (r.guests?.length ?? 0) > 0);
    if (filter === 'notified') list = list.filter((r) => (r.notifiedCount ?? 0) > 0);
    return list;
  }, [q.data, search, filter]);

  const changeRoom = useCallback(
    (room: KbsRoomSummary, guest: KbsRoomGuest) => {
      if (!canRoomChange) {
        Alert.alert('Yetki', 'Oda değiştirme / yeniden bildirim izniniz yok.');
        return;
      }
      if (!guest.guestDocumentId) {
        Alert.alert('Eksik', 'Bu misafirin belge kaydı yok; KBS oda değişimi yapılamaz.');
        return;
      }
      if (!guest.notified) {
        Alert.alert(
          'Henüz bildirilmedi',
          'Bu misafir KBS’ye bildirilmemiş. Yerel oda ataması yeterli; bildirim panosundan «İşle» kullanın.'
        );
        return;
      }

      void (async () => {
        const roomsList = await listRoomsForPicker();
        const others = roomsList.filter((r) => r.id !== room.roomId);
        if (!others.length) {
          Alert.alert('Oda yok', 'Başka KBS odası yok.');
          return;
        }

        Alert.alert(
          'Oda değiştir (KBS)',
          `${guest.guestName || guest.documentNumber || 'Misafir'}\n` +
            `Mevcut: Oda ${room.roomNumber}\n\n` +
            `KBS’de oda güncelleme yoktur. Eski kayıt silinip yeni oda ile yeniden bildirilir.\n` +
            `Yanlış işlem riski yoktur — onay sonrası net adımlar çalışır.`,
          [
            ...others.slice(0, 20).map((r) => ({
              text: `→ Oda ${r.room_number}`,
              onPress: () => {
                Alert.alert(
                  'Onay',
                  `Oda ${room.roomNumber} → Oda ${r.room_number}\n\n1) KBS sil\n2) Yeni oda ata\n3) Yeniden bildir\n\nDevam?`,
                  [
                    { text: 'İptal', style: 'cancel' },
                    {
                      text: 'KBS’ye ilet',
                      style: 'destructive',
                      onPress: async () => {
                        setBusyGuestId(guest.guestId);
                        const res = await changeKbsRoomAndNotify({
                          guestDocumentId: guest.guestDocumentId!,
                          newRoomId: r.id,
                          newRoomNumber: String(r.room_number),
                        });
                        setBusyGuestId(null);
                        if (!res.ok) Alert.alert('Oda değişimi', res.message);
                        else {
                          Alert.alert(
                            'Tamam',
                            `Oda ${r.room_number} ile KBS’ye yeniden bildirildi.`
                          );
                          void qc.invalidateQueries({ queryKey: ['kbs', 'rooms_summary'] });
                          void qc.invalidateQueries({ queryKey: ['kbs', 'submission_board'] });
                        }
                      },
                    },
                  ]
                );
              },
            })),
            { text: 'İptal', style: 'cancel' },
          ]
        );
      })();
    },
    [canRoomChange, qc]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bildirilen odalar</Text>
      <Text style={styles.p}>
        Odaya dokunun — bildirilmiş kimlikler listelenir. Oda değişimi KBS’ye sil+yeniden bildir ile iletilir.
      </Text>

      <TextInput
        style={styles.search}
        placeholder="Oda no ara"
        value={search}
        onChangeText={setSearch}
        keyboardType="number-pad"
      />

      <View style={styles.filters}>
        {(
          [
            ['occupied', 'Dolu'],
            ['notified', 'Bildirilmiş'],
            ['all', 'Tümü'],
          ] as const
        ).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.chip, filter === key && styles.chipOn]}
            onPress={() => setFilter(key)}
          >
            <Text style={[styles.chipText, filter === key && styles.chipTextOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {q.isError ? (
        <Text style={styles.error}>{(q.error as Error)?.message ?? 'Yüklenemedi'}</Text>
      ) : null}

      <FlatList
        data={rooms}
        keyExtractor={(it) => it.roomId}
        refreshControl={
          <RefreshControl refreshing={q.isFetching} onRefresh={() => void q.refetch()} />
        }
        renderItem={({ item }) => {
          const open = expandedId === item.roomId;
          const guestCount = item.guests?.length ?? 0;
          const notified = item.notifiedCount ?? 0;
          return (
            <View style={[styles.card, guestCount > 0 && styles.cardOccupied]}>
              <TouchableOpacity
                style={styles.cardHead}
                onPress={() => setExpandedId(open ? null : item.roomId)}
                activeOpacity={0.88}
              >
                <View style={styles.roomBadge}>
                  <Text style={styles.roomBadgeText}>{item.roomNumber}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.roomTitle}>Oda {item.roomNumber}</Text>
                  <Text style={styles.meta}>
                    {guestCount === 0
                      ? 'Boş'
                      : `${guestCount} misafir · ${notified} bildirilmiş`}
                  </Text>
                </View>
                {notified > 0 ? (
                  <View style={styles.okPill}>
                    <Text style={styles.okPillText}>KBS</Text>
                  </View>
                ) : null}
                <Ionicons
                  name={open ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={theme.colors.textMuted}
                />
              </TouchableOpacity>

              {open ? (
                <View style={styles.guestList}>
                  {guestCount === 0 ? (
                    <Text style={styles.emptyGuest}>Bu odada aktif misafir yok.</Text>
                  ) : (
                    item.guests.map((g) => (
                      <View key={g.stayAssignmentId} style={styles.guestRow}>
                        <View
                          style={[
                            styles.dot,
                            { backgroundColor: g.notified ? '#0f766e' : '#a16207' },
                          ]}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.guestName}>
                            {g.guestName || g.documentNumber || 'İsimsiz'}
                          </Text>
                          <Text style={styles.guestMeta}>
                            {scanLabel(g)}
                            {g.documentNumber ? ` · ${g.documentNumber}` : ''}
                            {g.nationalityCode ? ` · ${g.nationalityCode}` : ''}
                          </Text>
                        </View>
                        {g.notified && canRoomChange ? (
                          <TouchableOpacity
                            style={styles.changeBtn}
                            disabled={busyGuestId === g.guestId}
                            onPress={() => changeRoom(item, g)}
                          >
                            {busyGuestId === g.guestId ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Text style={styles.changeBtnText}>Oda değiştir</Text>
                            )}
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ))
                  )}
                </View>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {q.isPending ? 'Yükleniyor…' : q.isError ? '' : 'Filtreye uyan oda yok.'}
          </Text>
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: theme.colors.backgroundSecondary,
    gap: 10,
  },
  title: { fontSize: 20, fontWeight: '900', color: theme.colors.text },
  p: { color: theme.colors.textSecondary, lineHeight: 20, fontSize: 13 },
  search: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.colors.text,
  },
  filters: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  chipOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 12, fontWeight: '800', color: theme.colors.textSecondary },
  chipTextOn: { color: '#fff' },
  empty: { color: theme.colors.textSecondary, marginTop: 12 },
  error: { color: '#b91c1c', fontSize: 13, lineHeight: 18 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    marginBottom: 10,
    overflow: 'hidden',
  },
  cardOccupied: { borderColor: '#d6d3d1' },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  roomBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1c1917',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomBadgeText: { color: '#fafaf9', fontWeight: '900', fontSize: 14 },
  roomTitle: { fontWeight: '900', color: theme.colors.text, fontSize: 16 },
  meta: { color: theme.colors.textSecondary, marginTop: 2, fontSize: 12 },
  okPill: {
    backgroundColor: '#ccfbf1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  okPillText: { fontSize: 11, fontWeight: '900', color: '#0f766e' },
  guestList: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  emptyGuest: { paddingVertical: 12, color: theme.colors.textSecondary },
  guestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#fafaf9',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  guestName: { fontWeight: '800', color: theme.colors.text, fontSize: 14 },
  guestMeta: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },
  changeBtn: {
    backgroundColor: '#44403c',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 9,
    minWidth: 88,
    alignItems: 'center',
  },
  changeBtnText: { color: '#fff', fontWeight: '800', fontSize: 11 },
});
