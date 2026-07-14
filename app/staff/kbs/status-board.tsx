import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { theme } from '@/constants/theme';
import { kbsQueryOptions } from '@/lib/kbsReactQuery';
import { KbsStatusTabBar } from '@/components/kbs/KbsStatusTabBar';
import { KbsBoardItemCard } from '@/components/kbs/KbsBoardItemCard';
import {
  type KbsBoardItem,
  type KbsBoardTab,
  boardTabHint,
  fetchKbsSubmissionBoard,
  listRoomsForPicker,
  processQueuedDocument,
  retryFailedTransaction,
} from '@/lib/kbsSubmissionBoard';
import { assignKbsRoom } from '@/lib/kbsStaffOpsEdge';
import { useAuthStore } from '@/stores/authStore';
import { canKbsCheckin } from '@/lib/kbsStaysPermissions';

export default function KbsStatusBoardScreen() {
  const staff = useAuthStore((s) => s.staff);
  const canNotify = canKbsCheckin(staff);
  const qc = useQueryClient();
  const [tab, setTab] = useState<KbsBoardTab>('queued');
  const [busyId, setBusyId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['kbs', 'submission_board'],
    queryFn: async () => {
      const res = await fetchKbsSubmissionBoard();
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
    ...kbsQueryOptions,
    refetchInterval: 12_000,
  });

  const items: KbsBoardItem[] = useMemo(() => {
    if (!q.data) return [];
    switch (tab) {
      case 'reached':
        return q.data.reached;
      case 'inProgress':
        return q.data.inProgress;
      case 'queued':
        return q.data.queued;
      case 'failed':
        return q.data.failed;
    }
  }, [q.data, tab]);

  const counts = {
    reached: q.data?.counts.reached ?? 0,
    inProgress: q.data?.counts.inProgress ?? 0,
    queued: q.data?.counts.queued ?? 0,
    failed: q.data?.counts.failed ?? 0,
  };

  const refresh = useCallback(() => {
    void q.refetch();
  }, [q]);

  const pickRoomAndAssign = async (guestDocumentId: string) => {
    const rooms = await listRoomsForPicker();
    if (!rooms.length) {
      Alert.alert('Oda yok', 'KBS odası tanımlı değil. Admin → KBS Ayarları’ndan oda ekleyin.');
      return;
    }
    Alert.alert(
      'Oda seç',
      'Bildirimden önce oda atanmalı. Seçilen oda KBS’ye iletilecek.',
      [
        ...rooms.slice(0, 24).map((r) => ({
          text: `Oda ${r.room_number}`,
          onPress: async () => {
            setBusyId(guestDocumentId);
            const res = await assignKbsRoom({ guestDocumentId, roomId: r.id });
            setBusyId(null);
            if (!res.ok) Alert.alert('Oda', res.error.message);
            else {
              Alert.alert('Oda atandı', `Oda ${r.room_number}. Şimdi «İşle» ile bildirin.`);
              void qc.invalidateQueries({ queryKey: ['kbs', 'submission_board'] });
            }
          },
        })),
        { text: 'İptal', style: 'cancel' },
      ]
    );
  };

  const onProcess = (item: KbsBoardItem) => {
    if (!canNotify) {
      Alert.alert('Yetki', 'KBS bildir izniniz yok.');
      return;
    }
    if (!item.guestDocumentId) return;
    Alert.alert(
      'Bildirimi işle',
      `${item.guestName || item.documentNumber || 'Bu kayıt'} → Oda ${item.roomNumber ?? '—'}\n\nKBS’ye gönderilecek. Emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'İşle',
          onPress: async () => {
            setBusyId(item.id);
            const res = await processQueuedDocument(item.guestDocumentId!);
            setBusyId(null);
            if (!res.ok) Alert.alert('İşlem', res.message);
            else {
              Alert.alert('Gönderildi', 'Bildirim KBS kuyruğuna alındı / iletildi.');
              void qc.invalidateQueries({ queryKey: ['kbs', 'submission_board'] });
              setTab('inProgress');
            }
          },
        },
      ]
    );
  };

  const onRetry = (item: KbsBoardItem) => {
    if (!canNotify) {
      Alert.alert('Yetki', 'KBS bildir izniniz yok.');
      return;
    }
    if (!item.transactionId) return;
    Alert.alert('Yeniden ilet', 'Başarısız / kuyruktaki işlem tekrar denenecek.', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Yeniden ilet',
        onPress: async () => {
          setBusyId(item.id);
          const res = await retryFailedTransaction(item.transactionId!);
          setBusyId(null);
          if (!res.ok) Alert.alert('Yeniden ilet', res.message);
          else {
            Alert.alert('Kuyruğa alındı', 'İşlem yeniden denenecek.');
            void qc.invalidateQueries({ queryKey: ['kbs', 'submission_board'] });
            setTab('inProgress');
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Kimlik bildirme durumu</Text>
      <Text style={styles.sub}>{boardTabHint(tab)}</Text>

      <KbsStatusTabBar active={tab} counts={counts} onChange={setTab} />

      {q.isPending && !q.data ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : q.isError ? (
        <Text style={styles.err}>{(q.error as Error)?.message ?? 'Yüklenemedi'}</Text>
      ) : (
        <FlatList
          style={{ flex: 1, marginTop: 12 }}
          data={items}
          keyExtractor={(it) => `${it.kind}:${it.id}`}
          refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={refresh} />}
          renderItem={({ item }) => (
            <KbsBoardItemCard
              item={item}
              tab={tab}
              busy={busyId === item.id}
              onProcess={() => onProcess(item)}
              onRetry={() => onRetry(item)}
              onAssignRoom={() => item.guestDocumentId && void pickRoomAndAssign(item.guestDocumentId)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>Kayıt yok</Text>
              <Text style={styles.emptyBody}>
                {tab === 'queued'
                  ? 'Bekleyen bildirim yok. Çekim veya hazır listeden oda atayıp bildirin.'
                  : tab === 'reached'
                    ? 'Henüz başarılı iletim yok.'
                    : tab === 'inProgress'
                      ? 'Şu an gönderilen işlem yok.'
                      : 'Başarısız işlem yok.'}
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: theme.colors.backgroundSecondary,
    gap: 8,
  },
  title: { fontSize: 20, fontWeight: '900', color: theme.colors.text },
  sub: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 4, lineHeight: 18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  err: { color: '#b91c1c', marginTop: 16, lineHeight: 20 },
  emptyBox: {
    marginTop: 28,
    padding: 20,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  emptyTitle: { fontWeight: '800', fontSize: 15, color: theme.colors.text },
  emptyBody: { marginTop: 6, color: theme.colors.textSecondary, lineHeight: 20 },
});
