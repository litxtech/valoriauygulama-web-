import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import { useGuestStaysRealtime } from '@/hooks/useGuestStaysRealtime';
import { GuestStayCard } from '@/components/kbs/GuestStayCard';
import type { GuestStayRow, LodgersFilter } from '@/lib/kbsStays/types';
import { submitBulkCheckout } from '@/lib/kbsService';
import { useAuthStore } from '@/stores/authStore';
import { canKbsBulkCheckout } from '@/lib/kbsStaysPermissions';
import { playKbsScanSound } from '@/lib/kbsScanSounds';

const ACTIVE: GuestStayRow['stay_status'][] = ['checked_in', 'checkout_pending', 're_submitted'];

export default function KbsLodgersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const { rows, loading, refreshing, error, reload, refresh } = useGuestStaysRealtime();
  const [filter, setFilter] = useState<LodgersFilter>('active');
  const [roomSearch, setRoomSearch] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return rows.filter((r) => {
      if (roomSearch && !r.room_no.includes(roomSearch.trim())) return false;
      switch (filter) {
        case 'active':
          return ACTIVE.includes(r.stay_status);
        case 'today_checkin':
          return r.checkin_at.slice(0, 10) === today;
        case 'checkout_pending':
          return r.stay_status === 'checkout_pending';
        case 'errors':
          return r.kbs_checkin_status === 'failed' || r.stay_status === 'checkout_failed';
        case 'correction':
          return r.stay_status === 'correction_required';
        case 'checkout_failed':
          return r.stay_status === 'checkout_failed';
        case 'checked_out':
          return r.stay_status === 'checked_out';
        default:
          return true;
      }
    });
  }, [rows, filter, roomSearch]);

  const roomGroups = useMemo(() => {
    const m = new Map<string, GuestStayRow[]>();
    for (const r of filtered.filter((x) => ACTIVE.includes(x.stay_status))) {
      const list = m.get(r.room_no) ?? [];
      list.push(r);
      m.set(r.room_no, list);
    }
    return m;
  }, [filtered]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const bulkCheckoutSelected = () => {
    const list = filtered.filter((r) => selected.has(r.id) && ACTIVE.includes(r.stay_status));
    if (!list.length) return;
    Alert.alert(t('kbsLodgersBulkCheckoutTitle'), t('kbsLodgersBulkCheckoutBody', { count: list.length }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('ok'),
        onPress: async () => {
          const res = await submitBulkCheckout(list, 'selected_bulk');
          void playKbsScanSound(res.failed > 0 ? 'error' : 'submit_ok', true);
          Alert.alert(
            t('kbsLodgersResultTitle'),
            t('kbsLodgersBulkResult', { ok: res.ok, total: list.length, failed: res.failed })
          );
          setSelectionMode(false);
          setSelected(new Set());
          void reload();
        },
      },
    ]);
  };

  const checkoutRoom = (roomNo: string) => {
    const list = rows.filter((r) => r.room_no === roomNo && ACTIVE.includes(r.stay_status));
    if (!list.length) return;
    Alert.alert(
      t('kbsLodgersRoomCheckoutTitle'),
      t('kbsLodgersRoomCheckoutBody', { room: roomNo, count: list.length }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('ok'),
          onPress: async () => {
            const res = await submitBulkCheckout(list, 'room');
            void playKbsScanSound(res.failed > 0 ? 'error' : 'submit_ok', true);
            Alert.alert(
              t('kbsLodgersResultTitle'),
              t('kbsLodgersBulkResult', { ok: res.ok, total: list.length, failed: res.failed })
            );
            void reload();
          },
        },
      ]
    );
  };

  const chips: { key: LodgersFilter; label: string }[] = [
    { key: 'active', label: t('kbsLodgersFilterActive') },
    { key: 'today_checkin', label: t('kbsLodgersFilterToday') },
    { key: 'errors', label: t('kbsLodgersFilterErrors') },
    { key: 'correction', label: t('kbsLodgersFilterCorrection') },
    { key: 'checked_out', label: t('kbsLodgersFilterHistory') },
  ];

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder={t('kbsLodgersRoomSearch')}
        value={roomSearch}
        onChangeText={setRoomSearch}
        keyboardType="number-pad"
      />
      <View style={styles.chips}>
        {chips.map((c) => (
          <TouchableOpacity
            key={c.key}
            style={[styles.chip, filter === c.key && styles.chipOn]}
            onPress={() => setFilter(c.key)}
          >
            <Text style={[styles.chipText, filter === c.key && styles.chipTextOn]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {canKbsBulkCheckout(staff) && roomGroups.size > 0 ? (
        <View style={styles.roomBar}>
          <Text style={styles.roomBarTitle}>{t('kbsLodgersQuickRooms')}</Text>
          <FlatList
            horizontal
            data={[...roomGroups.entries()].slice(0, 12)}
            keyExtractor={([room]) => room}
            renderItem={({ item: [room, list] }) => (
              <TouchableOpacity style={styles.roomChip} onPress={() => checkoutRoom(room)}>
                <Text style={styles.roomChipText}>
                  {room} ({list.length})
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      ) : null}

      {error ? <Text style={styles.err}>{error}</Text> : null}

      <FlatList
        data={filtered}
        keyExtractor={(it) => it.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        renderItem={({ item }) => (
          <GuestStayCard
            stay={item}
            selectionMode={selectionMode}
            selected={selected.has(item.id)}
            onPress={() => {
              if (selectionMode) toggleSelect(item.id);
              else router.push({ pathname: '/staff/kbs/lodgers/[id]', params: { id: item.id } } as never);
            }}
            onLongPress={() => {
              setSelectionMode(true);
              toggleSelect(item.id);
            }}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>{loading ? t('loading') : t('kbsLodgersEmpty')}</Text>
        }
      />

      <View style={styles.footer}>
        {selectionMode ? (
          <>
            <TouchableOpacity style={styles.footerBtn} onPress={bulkCheckoutSelected}>
              <Text style={styles.footerBtnText}>{t('kbsLodgersCheckoutSelected', { count: selected.size })}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.footerGhost}
              onPress={() => {
                setSelectionMode(false);
                setSelected(new Set());
              }}
            >
              <Text style={styles.footerGhostText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.footerBtn} onPress={() => setSelectionMode(true)}>
            <Text style={styles.footerBtnText}>{t('kbsLodgersMultiSelect')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary, padding: 12 },
  search: {
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  chipOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },
  chipTextOn: { color: '#fff' },
  roomBar: { marginBottom: 8 },
  roomBarTitle: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 4 },
  roomChip: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  roomChipText: { fontWeight: '800', fontSize: 13, color: theme.colors.text },
  err: { color: '#b91c1c', marginBottom: 8 },
  empty: { textAlign: 'center', color: theme.colors.textSecondary, marginTop: 40 },
  footer: { paddingVertical: 8, gap: 8 },
  footerBtn: {
    backgroundColor: theme.colors.primary,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  footerBtnText: { color: '#fff', fontWeight: '800' },
  footerGhost: { alignItems: 'center', padding: 8 },
  footerGhostText: { color: theme.colors.textSecondary, fontWeight: '700' },
});
