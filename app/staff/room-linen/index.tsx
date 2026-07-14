import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { sendBulkToStaff } from '@/lib/notificationService';
import { formatFeedRelativeTime } from '@/lib/feedRelativeTime';
import {
  LINEN_ITEM_TYPES,
  buildLinenHandoverPushCopy,
  cancelRoomLinenHandover,
  createRoomLinenHandover,
  fetchRoomLinenHandovers,
  linenItemTypeLabel,
  markRoomLinenPickedUp,
  type LinenItemType,
  type RoomLinenHandoverView,
} from '@/lib/roomLinenHandovers';

type TabKey = 'give' | 'pickup' | 'history';

const ACCENT = '#0f766e';

export default function RoomLinenScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const staff = useAuthStore((s) => s.staff);
  const orgId = staff?.organization_id ?? null;

  const [tab, setTab] = useState<TabKey>('give');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [rows, setRows] = useState<RoomLinenHandoverView[]>([]);

  const [roomNumber, setRoomNumber] = useState('');
  const [itemType, setItemType] = useState<LinenItemType>('blanket');
  const [quantity, setQuantity] = useState('1');
  const [note, setNote] = useState('');

  const pendingRows = useMemo(() => rows.filter((r) => r.status === 'pending'), [rows]);
  const historyRows = useMemo(
    () => rows.filter((r) => r.status === 'picked_up' || r.status === 'cancelled'),
    [rows]
  );

  const load = useCallback(
    async (silent = false) => {
      if (!orgId) {
        setRows([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const data = await fetchRoomLinenHandovers(orgId, { status: 'all', limit: 150 });
        setRows(data);
      } catch (e) {
        Alert.alert(t('error'), (e as Error)?.message ?? t('roomLinenLoadFailed'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [orgId, t]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const submitHandover = async () => {
    if (!staff?.id || !orgId) return;
    const room = roomNumber.trim();
    const qty = Math.max(1, Math.min(20, parseInt(quantity, 10) || 1));
    if (!room) {
      Alert.alert(t('roomLinenRoomRequiredTitle'), t('roomLinenRoomRequiredBody'));
      return;
    }
    setSaving(true);
    try {
      const row = await createRoomLinenHandover({
        organizationId: orgId,
        roomNumber: room,
        itemType,
        quantity: qty,
        note: note.trim() || null,
        deliveredByStaffId: staff.id,
      });
      const copy = buildLinenHandoverPushCopy(row, t);
      await sendBulkToStaff({
        target: 'housekeeping',
        organizationId: orgId,
        title: copy.title,
        body: copy.body,
        createdByStaffId: staff.id,
        notificationType: 'staff_room_linen_handover',
        category: 'staff',
        data: { url: '/staff/room-linen', handoverId: row.id, roomNumber: row.room_number },
      });
      setRoomNumber('');
      setQuantity('1');
      setNote('');
      setItemType('blanket');
      setTab('pickup');
      await load(true);
      Alert.alert(t('success'), t('roomLinenSavedSuccess', { room }));
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('roomLinenSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handlePickup = async (row: RoomLinenHandoverView) => {
    setUpdatingId(row.id);
    try {
      await markRoomLinenPickedUp(row.id);
      await load(true);
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('roomLinenUpdateFailed'));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCancel = (row: RoomLinenHandoverView) => {
    Alert.alert(t('roomLinenCancelTitle'), t('roomLinenCancelBody', { room: row.room_number }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('roomLinenCancelConfirm'),
        style: 'destructive',
        onPress: async () => {
          setUpdatingId(row.id);
          try {
            await cancelRoomLinenHandover(row.id);
            await load(true);
          } catch (e) {
            Alert.alert(t('error'), (e as Error)?.message ?? t('roomLinenUpdateFailed'));
          } finally {
            setUpdatingId(null);
          }
        },
      },
    ]);
  };

  const renderRow = (row: RoomLinenHandoverView, mode: 'pickup' | 'history') => {
    const itemLabel = linenItemTypeLabel(row.item_type, t);
    const isPending = row.status === 'pending';
    const isCancelled = row.status === 'cancelled';
    return (
      <View key={row.id} style={[styles.card, isCancelled && styles.cardCancelled]}>
        <View style={styles.cardTop}>
          <View style={styles.roomBadge}>
            <Text style={styles.roomBadgeText}>{row.room_number}</Text>
          </View>
          <Text style={styles.cardTitle}>
            {row.quantity}× {itemLabel}
          </Text>
          <Text style={styles.cardMeta}>
            {formatFeedRelativeTime(row.created_at)} · {row.delivered_by_name ?? '—'}
          </Text>
          {row.note ? <Text style={styles.cardNote}>{row.note}</Text> : null}
          {mode === 'history' && row.status === 'picked_up' ? (
            <Text style={styles.cardMeta}>
              {t('roomLinenPickedUpBy', {
                name: row.picked_up_by_name ?? '—',
                when: row.picked_up_at ? formatFeedRelativeTime(row.picked_up_at) : '—',
              })}
            </Text>
          ) : null}
          {isCancelled ? <Text style={styles.cancelledLabel}>{t('roomLinenStatusCancelled')}</Text> : null}
        </View>
        {mode === 'pickup' && isPending ? (
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.pickupBtn]}
              onPress={() => void handlePickup(row)}
              disabled={updatingId === row.id}
            >
              {updatingId === row.id ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                  <Text style={styles.pickupBtnText}>{t('roomLinenMarkPickedUp')}</Text>
                </>
              )}
            </TouchableOpacity>
            {row.delivered_by_staff_id === staff?.id ? (
              <TouchableOpacity
                style={[styles.actionBtn, styles.cancelBtn]}
                onPress={() => handleCancel(row)}
                disabled={updatingId === row.id}
              >
                <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Text style={styles.pageTitle}>{t('roomLinenPageTitle')}</Text>
      <Text style={styles.pageSub}>{t('roomLinenPageSub')}</Text>

      <View style={styles.tabs}>
        {(['give', 'pickup', 'history'] as TabKey[]).map((key) => {
          const active = tab === key;
          const badge = key === 'pickup' ? pendingRows.length : 0;
          const label =
            key === 'give'
              ? t('roomLinenTabGive')
              : key === 'pickup'
                ? t('roomLinenTabPickup')
                : t('roomLinenTabHistory');
          return (
            <TouchableOpacity
              key={key}
              style={[styles.tabBtn, active && styles.tabBtnActive]}
              onPress={() => setTab(key)}
            >
              <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>{label}</Text>
              {badge > 0 ? (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{badge > 99 ? '99+' : badge}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === 'give' ? (
        <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>{t('roomLinenRoomLabel')}</Text>
          <TextInput
            style={styles.input}
            value={roomNumber}
            onChangeText={setRoomNumber}
            placeholder={t('roomLinenRoomPlaceholder')}
            placeholderTextColor="#9ca3af"
            keyboardType="number-pad"
            maxLength={8}
          />
          <Text style={styles.label}>{t('roomLinenItemLabel')}</Text>
          <View style={styles.chipRow}>
            {LINEN_ITEM_TYPES.map((type) => {
              const active = itemType === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setItemType(type)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {linenItemTypeLabel(type, t)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.label}>{t('roomLinenQtyLabel')}</Text>
          <TextInput
            style={[styles.input, styles.qtyInput]}
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="number-pad"
            maxLength={2}
          />
          <Text style={styles.label}>{t('roomLinenNoteLabel')}</Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={note}
            onChangeText={setNote}
            placeholder={t('roomLinenNotePlaceholder')}
            placeholderTextColor="#9ca3af"
            multiline
          />
          <TouchableOpacity
            style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
            onPress={() => void submitHandover()}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>{t('roomLinenSubmit')}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} />
          }
        >
          {loading && rows.length === 0 ? (
            <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />
          ) : tab === 'pickup' ? (
            pendingRows.length === 0 ? (
              <Text style={styles.empty}>{t('roomLinenEmptyPending')}</Text>
            ) : (
              pendingRows.map((row) => renderRow(row, 'pickup'))
            )
          ) : historyRows.length === 0 ? (
            <Text style={styles.empty}>{t('roomLinenEmptyHistory')}</Text>
          ) : (
            historyRows.map((row) => renderRow(row, 'history'))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  pageTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a', paddingHorizontal: 16, marginTop: 8 },
  pageSub: { fontSize: 14, color: '#64748b', paddingHorizontal: 16, marginTop: 4, marginBottom: 12 },
  tabs: { flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 8 },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  tabBtnActive: { backgroundColor: ACCENT },
  tabBtnText: { fontWeight: '700', color: '#475569', fontSize: 13 },
  tabBtnTextActive: { color: '#fff' },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  formContent: { padding: 16, paddingBottom: 40 },
  listContent: { padding: 16, paddingBottom: 40 },
  label: { fontWeight: '700', color: '#334155', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0f172a',
  },
  qtyInput: { width: 80 },
  noteInput: { minHeight: 80, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
  },
  chipActive: { backgroundColor: ACCENT },
  chipText: { color: '#475569', fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#fff' },
  submitBtn: {
    marginTop: 24,
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: ACCENT,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardCancelled: { borderLeftColor: '#94a3b8', opacity: 0.85 },
  cardTop: { gap: 4 },
  roomBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#ccfbf1',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roomBadgeText: { fontWeight: '800', color: ACCENT, fontSize: 15 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  cardMeta: { fontSize: 12, color: '#64748b' },
  cardNote: { fontSize: 13, color: '#475569', marginTop: 4 },
  cancelledLabel: { color: '#94a3b8', fontWeight: '700', fontSize: 12, marginTop: 4 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  pickupBtn: { backgroundColor: ACCENT },
  pickupBtnText: { color: '#fff', fontWeight: '700' },
  cancelBtn: { backgroundColor: '#f1f5f9' },
  cancelBtnText: { color: '#64748b', fontWeight: '700' },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 48, fontSize: 15 },
});
