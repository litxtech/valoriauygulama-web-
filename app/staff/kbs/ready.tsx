import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { theme } from '@/constants/theme';
import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/kbsApi';
import { assignKbsRoom, fetchKbsOpsRooms } from '@/lib/kbsStaffOpsEdge';
import { kbsQueryOptions } from '@/lib/kbsReactQuery';
import { useTranslation } from 'react-i18next';

export default function ReadyToSubmitScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const roomsQ = useQuery({
    queryKey: ['kbs', 'rooms'],
    queryFn: async () => {
      const res = await fetchKbsOpsRooms();
      if (!res.ok) throw new Error(res.error.message);
      return res.data ?? [];
    },
    ...kbsQueryOptions,
  });

  const q = useQuery({
    queryKey: ['kbs', 'ready_to_submit'],
    queryFn: async () => {
      const res = await apiGet<any[]>('/ready-to-submit');
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    ...kbsQueryOptions,
  });

  const assignRoom = async (guestDocumentId: string) => {
    const rooms = roomsQ.data ?? [];
    if (rooms.length === 0) {
      Alert.alert(
        t('kbsNoRoomsTitle'),
        t('kbsNoRoomsBody')
      );
      return;
    }
    const actions = rooms.slice(0, 30).map((r) => ({
      text: String(r.room_number),
      onPress: async () => {
        const res = await assignKbsRoom({ guestDocumentId, roomId: r.id });
        if (!res.ok) Alert.alert(t('kbsRoomAssignTitle'), res.error.message);
        else Alert.alert(t('kbsRoomAssignedTitle'), `${t('kbsRoomLabel')}: ${r.room_number}`);
      },
    }));
    Alert.alert(t('kbsSelectRoomTitle'), t('kbsSelectRoomBody'), [
      ...actions,
      { text: t('cancel'), style: 'cancel' },
    ]);
  };

  const submit = async (guestDocumentId: string) => {
    const res = await apiPost<{ transactionId: string; idempotent?: boolean }>('/submissions/check-in', { guestDocumentId });
    if (!res.ok) {
      Alert.alert(t('kbsNotifyTitle'), res.error.message);
      return;
    }
    Alert.alert(t('kbsNotifyTitle'), t('kbsTxReceived', { tx: String(res.data.transactionId).slice(0, 8), idempotent: res.data.idempotent ? ' (idempotent)' : '' }));
    q.refetch();
  };

  const roomCount = roomsQ.data?.length ?? 0;
  const roomsLoading = roomsQ.isPending;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('kbsNavReady')}</Text>
      <Text style={styles.p}>
        {t('kbsReadyIntro', { count: roomsLoading ? '…' : roomCount })}
      </Text>

      {roomsQ.isError ? (
        <Text style={styles.warn}>{t('kbsRoomsLoadFailed', { message: (roomsQ.error as Error)?.message ?? t('error') })}</Text>
      ) : null}

      {!roomsLoading && roomCount === 0 ? (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>{t('kbsRoomsEmptyBannerTitle')}</Text>
          <Text style={styles.bannerBody}>
            {t('kbsRoomsEmptyBannerBodyPrefix')} <Text style={styles.bold}>ops.rooms</Text> {t('kbsRoomsEmptyBannerBodySuffix')}
          </Text>
          <TouchableOpacity style={styles.bannerBtn} onPress={() => router.push('/admin/kbs-settings')} activeOpacity={0.88}>
            <Text style={styles.bannerBtnText}>{t('kbsSettingsAdmin')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        data={q.data ?? []}
        keyExtractor={(it) => it.id}
        refreshControl={
          <RefreshControl
            refreshing={q.isFetching || roomsQ.isFetching}
            onRefresh={() => {
              void q.refetch();
              void roomsQ.refetch();
            }}
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.nameMono}>Doc: {item.document_number ?? '-'}</Text>
            <Text style={styles.meta}>Nation: {item.nationality_code ?? '-'}</Text>
            <Text style={styles.meta}>Status: {item.scan_status}</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: '#374151' }]} onPress={() => assignRoom(item.id)}>
                <Text style={styles.btnText}>{t('kbsAssignRoom')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { flex: 1 }]}
                onPress={() => submit(item.id)}
              >
                <Text style={styles.btnText}>{t('kbsNotifyTitle')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>{q.isPending ? t('loading') : q.isError ? '' : t('kbsReadyEmpty')}</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: theme.colors.backgroundSecondary, gap: 10 },
  title: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  p: { color: theme.colors.textSecondary, lineHeight: 20 },
  warn: { color: '#b45309', fontWeight: '700', marginBottom: 4 },
  banner: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: 14,
    gap: 8,
  },
  bannerTitle: { fontWeight: '900', color: theme.colors.text, fontSize: 15 },
  bannerBody: { color: theme.colors.textSecondary, lineHeight: 20, fontSize: 13 },
  bold: { fontWeight: '900', color: theme.colors.text },
  bannerBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  bannerBtnText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  empty: { color: theme.colors.textSecondary, marginTop: 12 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderLight, padding: 12, marginBottom: 10, gap: 4 },
  nameMono: { fontFamily: 'monospace', color: theme.colors.text, fontWeight: '800' },
  meta: { color: theme.colors.textSecondary },
  btn: { marginTop: 8, backgroundColor: theme.colors.primary, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '900' },
});

