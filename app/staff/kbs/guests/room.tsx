import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  TextInput,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { theme } from '@/constants/theme';
import { fetchKbsOpsRooms, type KbsOpsRoom } from '@/lib/kbsStaffOpsEdge';
import { kbsQueryOptions } from '@/lib/kbsReactQuery';
import { useGuestScanSessionStore } from '@/stores/guestScanSessionStore';
import { updateGuestScanSessionDb } from '@/lib/guestScan/guestScanSessionDb';
import { submitGuestGroupToKbs } from '@/lib/guestScan/submitGroupToKbs';
import { validateGuestScanItem } from '@/lib/guestScan/validateGuestItem';
import type { GuestGroupSubmitProgress } from '@/lib/guestScan/submitGroupToKbs';
import { playKbsScanSound } from '@/lib/kbsScanSounds';
import { useAuthStore } from '@/stores/authStore';
import { canKbsCheckin } from '@/lib/kbsStaysPermissions';

export default function KbsGuestRoomScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const session = useGuestScanSessionStore((s) => s.session);
  const setStayInfo = useGuestScanSessionStore((s) => s.setStayInfo);
  const setLastSubmitResults = useGuestScanSessionStore((s) => s.setLastSubmitResults);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedRoomNo, setSelectedRoomNo] = useState<string | null>(null);
  const [roomQuery, setRoomQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<GuestGroupSubmitProgress | null>(null);

  const roomsQ = useQuery({
    queryKey: ['kbs', 'rooms'],
    queryFn: async () => {
      const res = await fetchKbsOpsRooms();
      if (!res.ok) throw new Error(res.error.message);
      return res.data ?? [];
    },
    ...kbsQueryOptions,
  });

  const items = session?.items ?? [];

  useEffect(() => {
    if (!session?.roomNo || !roomsQ.data?.length) return;
    const match = roomsQ.data.find((r) => String(r.room_number) === session.roomNo);
    if (match) {
      setSelectedRoomId(match.id);
      setSelectedRoomNo(String(match.room_number));
    }
  }, [session?.roomNo, roomsQ.data]);

  const filteredRooms = useMemo(() => {
    const rooms = roomsQ.data ?? [];
    const q = roomQuery.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((r) => String(r.room_number).toLowerCase().includes(q));
  }, [roomsQ.data, roomQuery]);

  if (!session || items.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>{t('kbsGuestRoomNoItems')}</Text>
        <TouchableOpacity style={styles.linkBtn} onPress={() => router.replace('/staff/kbs/guests' as never)}>
          <Text style={styles.linkBtnText}>{t('kbsGuestHubTitle')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const selectRoom = (r: KbsOpsRoom) => {
    setSelectedRoomId(r.id);
    setSelectedRoomNo(String(r.room_number));
    setStayInfo({ roomNo: String(r.room_number), checkinAt: new Date().toISOString() });
  };

  const startSubmit = async () => {
    if (!selectedRoomId || !session || submitting) return;
    if (!canKbsCheckin(staff)) {
      Alert.alert(t('kbsNotifyTitle'), t('noPermission'));
      return;
    }

    for (const it of items) {
      const issues = validateGuestScanItem(it);
      if (issues.length) {
        Alert.alert(
          t('kbsGuestMissingTitle'),
          `${it.firstName ?? ''} ${it.lastName ?? ''}: ${t('kbsGuestMissingBody')}`
        );
        return;
      }
    }

    setSubmitting(true);
    setProgress({ index: 0, total: items.length, itemId: '', guestLabel: '' });

    try {
      if (!session.id.startsWith('local-')) {
        await updateGuestScanSessionDb(session.id, {
          roomNo: selectedRoomNo,
          checkinAt: session.checkinAt ?? new Date().toISOString(),
          status: 'submitted',
        });
      }

      const results = await submitGuestGroupToKbs({
        items,
        roomId: selectedRoomId,
        roomNo: selectedRoomNo ?? '',
        sessionId: session.id,
        onProgress: (p) => setProgress(p),
      });

      setLastSubmitResults(results);
      const okN = results.filter((r) => r.ok).length;
      await playKbsScanSound(okN === results.length ? 'submit_ok' : 'error', true);

      router.replace({
        pathname: '/staff/kbs/guests/results',
        params: {
          ok: String(okN),
          total: String(results.length),
        },
      } as never);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(t('error'), msg);
      await playKbsScanSound('error', true);
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  const roomsLoading = roomsQ.isPending;
  const roomCount = roomsQ.data?.length ?? 0;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.p}>{t('kbsGuestRoomIntro', { count: items.length })}</Text>

        {roomsQ.isError ? (
          <Text style={styles.warn}>
            {t('kbsRoomsLoadFailed', { message: (roomsQ.error as Error)?.message ?? t('error') })}
          </Text>
        ) : null}

        {!roomsLoading && roomCount === 0 ? (
          <Text style={styles.warn}>{t('kbsNoRoomsBody')}</Text>
        ) : null}

        <Text style={styles.sectionLabel}>{t('kbsSelectRoomTitle')}</Text>
        {selectedRoomNo ? (
          <View style={styles.selectedBanner}>
            <Text style={styles.selectedLabel}>{t('kbsRoomLabel')}</Text>
            <Text style={styles.selectedValue}>{selectedRoomNo}</Text>
          </View>
        ) : null}

        <TextInput
          style={styles.search}
          value={roomQuery}
          onChangeText={setRoomQuery}
          placeholder={t('kbsGuestRoomSearch')}
          placeholderTextColor={theme.colors.textMuted}
          editable={!submitting}
        />

        {roomsLoading ? (
          <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 16 }} />
        ) : (
          <FlatList
            data={filteredRooms}
            keyExtractor={(r) => r.id}
            scrollEnabled={false}
            style={styles.roomList}
            ListEmptyComponent={
              <Text style={styles.emptyList}>{roomCount === 0 ? t('kbsNoRoomsBody') : t('kbsGuestRoomNoMatch')}</Text>
            }
            renderItem={({ item: r }) => {
              const active = selectedRoomId === r.id;
              return (
                <TouchableOpacity
                  style={[styles.roomRow, active && styles.roomRowActive]}
                  onPress={() => selectRoom(r)}
                  disabled={submitting}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.roomRowNo, active && styles.roomRowNoActive]}>{r.room_number}</Text>
                  {r.floor ? <Text style={styles.roomRowSub}>{r.floor}</Text> : null}
                </TouchableOpacity>
              );
            }}
          />
        )}

        {submitting && progress ? (
          <View style={styles.progressBox}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={styles.progressTitle}>{t('kbsGuestSubmitLoopTitle')}</Text>
            <Text style={styles.progressSub}>
              {progress.index > 0
                ? t('kbsGuestSubmitLoopGuest', {
                    current: progress.index,
                    total: progress.total,
                    name: progress.guestLabel,
                  })
                : t('kbsGuestSubmitLoopPrepare', { total: progress.total })}
            </Text>
            <Text style={styles.progressHint}>{t('kbsGuestSubmitLoopSteps')}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitBtn, (!selectedRoomId || submitting) && styles.disabled]}
          disabled={!selectedRoomId || submitting}
          onPress={() => void startSubmit()}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>{t('kbsGuestStartNotify')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  scroll: { padding: 16, paddingBottom: 24 },
  p: { color: theme.colors.textSecondary, marginBottom: 12, lineHeight: 20 },
  empty: { color: theme.colors.textSecondary, textAlign: 'center', marginTop: 40 },
  linkBtn: { marginTop: 16, alignItems: 'center' },
  linkBtnText: { color: theme.colors.primary, fontWeight: '800' },
  warn: { color: '#b45309', fontWeight: '700', marginBottom: 10, lineHeight: 18 },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: theme.colors.textSecondary, marginBottom: 8 },
  selectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary + '18',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  selectedLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },
  selectedValue: { fontSize: 22, fontWeight: '900', color: theme.colors.primary },
  search: {
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: 12,
    fontSize: 15,
    color: theme.colors.text,
    marginBottom: 10,
  },
  roomList: { maxHeight: 220, marginBottom: 12 },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    marginBottom: 6,
  },
  roomRowActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '12',
  },
  roomRowNo: { fontSize: 17, fontWeight: '900', color: theme.colors.text, minWidth: 48 },
  roomRowNoActive: { color: theme.colors.primary },
  roomRowSub: { fontSize: 13, color: theme.colors.textSecondary },
  emptyList: { color: theme.colors.textMuted, textAlign: 'center', paddingVertical: 12 },
  progressBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    alignItems: 'center',
  },
  progressTitle: { fontWeight: '800', fontSize: 15, color: theme.colors.text },
  progressSub: { color: theme.colors.text, textAlign: 'center', lineHeight: 20 },
  progressHint: { fontSize: 12, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 18 },
  footer: {
    padding: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  submitBtn: {
    backgroundColor: theme.colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  disabled: { opacity: 0.5 },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
