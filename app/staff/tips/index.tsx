import { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import { useCachedList } from '@/hooks/useCachedList';
import {
  fetchStaffTipsReceived,
  sendStaffTipThankYou,
  type StaffTipRow,
} from '@/lib/staffTips';
import {
  staffTipText,
  formatTipAmount,
  TIP_THANK_YOU_PRESET_KEYS,
  staffTipLang,
} from '@/lib/staffTipsI18n';

const TIP_GOLD = '#b8860b';

export default function StaffTipsScreen() {
  const insets = useSafeAreaInsets();
  const { i18n } = useTranslation();
  const locale = staffTipLang();
  const {
    items: rows,
    setItems: setRows,
    loading,
    refreshing,
    refresh,
  } = useCachedList<StaffTipRow>({
    cacheKey: 'staff-tips-received',
    fetchItems: async () => {
      try {
        return await fetchStaffTipsReceived();
      } catch {
        return [];
      }
    },
  });
  const [selectedTip, setSelectedTip] = useState<StaffTipRow | null>(null);
  const [thankMessage, setThankMessage] = useState('');
  const [sending, setSending] = useState(false);

  const openThankYou = (row: StaffTipRow) => {
    if (row.thank_you_at) {
      Alert.alert(staffTipText('tipAlertInfo'), staffTipText('tipThankYouAlreadySent'));
      return;
    }
    setSelectedTip(row);
    setThankMessage('');
  };

  const closeThankYou = () => {
    if (sending) return;
    setSelectedTip(null);
    setThankMessage('');
  };

  const submitThankYou = async () => {
    if (!selectedTip || sending) return;
    const msg = thankMessage.trim();
    if (!msg) return;
    setSending(true);
    try {
      await sendStaffTipThankYou(selectedTip.id, msg);
      setRows((prev) =>
        prev.map((r) =>
          r.id === selectedTip.id
            ? { ...r, thank_you_message: msg, thank_you_at: new Date().toISOString() }
            : r
        )
      );
      closeThankYou();
      Alert.alert(staffTipText('tipAlertInfo'), staffTipText('tipThankYouSent'));
    } catch (e) {
      Alert.alert(staffTipText('tipAlertError'), (e as Error)?.message ?? staffTipText('tipErrorThankYouGeneric'));
    } finally {
      setSending(false);
    }
  };

  const guestLabel = (row: StaffTipRow) => {
    const name =
      (row.guest as { full_name?: string | null } | null)?.full_name?.trim() ||
      staffTipText('tipStaffFallback');
    return staffTipText('tipStaffTipsFromGuest', { name });
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {loading && rows.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={TIP_GOLD} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
            />
          }
        >
          {rows.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="gift-outline" size={44} color={TIP_GOLD} />
              <Text style={styles.emptyText}>{staffTipText('tipStaffTipsEmpty')}</Text>
            </View>
          ) : (
            rows.map((row) => {
              const currency = (row.currency ?? 'TRY').toLowerCase();
              const thanked = !!row.thank_you_at;
              return (
                <View key={row.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.guestName}>{guestLabel(row)}</Text>
                    {row.room_number ? (
                      <Text style={styles.roomMeta}>
                        {staffTipText('tipRoomLabel', { room: row.room_number })}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.amount}>{formatTipAmount(Number(row.amount), currency)}</Text>
                  {row.note ? <Text style={styles.guestNote}>"{row.note}"</Text> : null}
                  <Text style={styles.date}>
                    {new Date(row.confirmed_at ?? row.created_at).toLocaleString(i18n.language || locale, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>

                  {thanked ? (
                    <View style={styles.thankedBox}>
                      <Ionicons name="heart" size={16} color="#22c55e" />
                      <Text style={styles.thankedText}>{row.thank_you_message}</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.thankBtn}
                      onPress={() => openThankYou(row)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="chatbubble-ellipses-outline" size={18} color="#fff" />
                      <Text style={styles.thankBtnText}>{staffTipText('tipStaffTipsSendThanks')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <Modal visible={!!selectedTip} transparent animationType="slide" onRequestClose={closeThankYou}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={closeThankYou} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>{staffTipText('tipThankYouTitle')}</Text>
            <Text style={styles.modalSub}>{staffTipText('tipThankYouSubtitle')}</Text>

            <View style={styles.presetsRow}>
              {TIP_THANK_YOU_PRESET_KEYS.map((key) => (
                <TouchableOpacity
                  key={key}
                  style={styles.presetChip}
                  onPress={() => setThankMessage(staffTipText(key))}
                  activeOpacity={0.8}
                >
                  <Text style={styles.presetChipText} numberOfLines={2}>
                    {staffTipText(key)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.input}
              placeholder={staffTipText('tipThankYouPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              value={thankMessage}
              onChangeText={setThankMessage}
              multiline
              maxLength={500}
              editable={!sending}
            />

            <TouchableOpacity
              style={[styles.sendBtn, (!thankMessage.trim() || sending) && styles.sendBtnDisabled]}
              onPress={() => void submitThankYou()}
              disabled={!thankMessage.trim() || sending}
              activeOpacity={0.88}
            >
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="send" size={18} color="#fff" />
                  <Text style={styles.sendBtnText}>{staffTipText('tipThankYouSend')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 56, gap: 14 },
  emptyText: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', paddingHorizontal: 24 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  cardTop: { gap: 2 },
  guestName: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  roomMeta: { fontSize: 12, color: theme.colors.textSecondary },
  amount: { fontSize: 30, fontWeight: '900', color: TIP_GOLD, marginTop: 10 },
  guestNote: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 18,
  },
  date: { fontSize: 11, color: theme.colors.textMuted, marginTop: 10 },
  thankBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: TIP_GOLD,
  },
  thankBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  thankedBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
  },
  thankedText: { flex: 1, fontSize: 13, color: theme.colors.text, lineHeight: 18 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    gap: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  modalSub: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 18 },
  presetsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    maxWidth: '100%',
  },
  presetChipText: { fontSize: 12, color: theme.colors.text, fontWeight: '600' },
  input: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    color: theme.colors.text,
    textAlignVertical: 'top',
    backgroundColor: theme.colors.backgroundSecondary,
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: TIP_GOLD,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
