import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import type { MrzRecentDocRow } from '@/lib/loadMrzRecentDocuments';
import { guestDisplayName } from '@/lib/mrzPassportArchive';
import { fetchKbsOpsRooms } from '@/lib/kbsStaffOpsEdge';
import { notifyMrzArchiveToKbs, updateMrzArchiveRecord } from '@/lib/mrzPassportArchiveActions';

type Props = {
  visible: boolean;
  row: MrzRecentDocRow | null;
  onClose: () => void;
  onDone: () => void;
};

export function MrzPassportNotifySheet({ visible, row, onClose, onDone }: Props) {
  const { t } = useTranslation();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [docNo, setDocNo] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<{ id: string; room_number: string }[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible || !row) return;
    setFirstName(row.guest?.first_name ?? '');
    setLastName(row.guest?.last_name ?? '');
    setDocNo(row.document_number ?? '');
    setBirthDate(row.guest?.birth_date?.slice(0, 10) ?? '');
    setRoomId(null);
  }, [visible, row]);

  const loadRooms = useCallback(async () => {
    setRoomsLoading(true);
    const res = await fetchKbsOpsRooms();
    setRoomsLoading(false);
    if (res.ok) setRooms(res.data ?? []);
    else Alert.alert(t('kbsSelectRoomTitle'), res.error.message);
  }, [t]);

  useEffect(() => {
    if (visible) void loadRooms();
  }, [visible, loadRooms]);

  const roomChips = useMemo(() => rooms.slice(0, 40), [rooms]);

  const saveEdits = async (): Promise<boolean> => {
    if (!row) return false;
    const res = await updateMrzArchiveRecord(row, {
      first_name: firstName,
      last_name: lastName,
      document_number: docNo,
      birth_date: birthDate.trim() || null,
    });
    if (!res.ok) {
      Alert.alert(t('error'), res.message);
      return false;
    }
    return true;
  };

  const onNotify = async () => {
    if (!row || !roomId) {
      Alert.alert(t('kbsSelectRoomTitle'), t('staffPassportsPickRoom'));
      return;
    }
    setBusy(true);
    const saved = await saveEdits();
    if (!saved) {
      setBusy(false);
      return;
    }
    const res = await notifyMrzArchiveToKbs({
      guestDocumentId: row.id,
      roomId,
      currentStatus: row.scan_status,
    });
    setBusy(false);
    if (!res.ok) {
      Alert.alert(t('kbsNotifyTitle'), res.message);
      return;
    }
    Alert.alert(t('kbsNotifyTitle'), t('staffPassportsNotifyOk'));
    onDone();
    onClose();
  };

  if (!row) return null;

  const titleName = guestDisplayName(row.guest ?? null) || t('staffPassportCardGuest');

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>{t('staffPassportsNotifySheetTitle')}</Text>
          <Text style={styles.sheetSub}>{titleName}</Text>

          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.fieldLbl}>{t('staffPassportsEditSection')}</Text>
            <View style={styles.row2}>
              <View style={styles.fieldHalf}>
                <Text style={styles.lbl}>{t('kbsGuestFirstName')}</Text>
                <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={styles.lbl}>{t('kbsGuestLastName')}</Text>
                <TextInput style={styles.input} value={lastName} onChangeText={setLastName} />
              </View>
            </View>
            <Text style={styles.lbl}>{t('staffPassportCardDoc')}</Text>
            <TextInput style={styles.input} value={docNo} onChangeText={setDocNo} autoCapitalize="characters" />
            <Text style={styles.lbl}>{t('staffPassportsBirthDate')}</Text>
            <TextInput
              style={styles.input}
              value={birthDate}
              onChangeText={setBirthDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.colors.textMuted}
            />

            <Text style={[styles.fieldLbl, { marginTop: 16 }]}>{t('kbsSelectRoomTitle')}</Text>
            {roomsLoading ? (
              <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 12 }} />
            ) : roomChips.length === 0 ? (
              <Text style={styles.muted}>{t('kbsNoRoomsBody')}</Text>
            ) : (
              <View style={styles.roomGrid}>
                {roomChips.map((r) => (
                  <Pressable
                    key={r.id}
                    style={[styles.roomChip, roomId === r.id && styles.roomChipOn]}
                    onPress={() => setRoomId(r.id)}
                  >
                    <Text style={[styles.roomChipText, roomId === r.id && styles.roomChipTextOn]}>
                      {r.room_number}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={styles.btnGhost} onPress={onClose} disabled={busy}>
              <Text style={styles.btnGhostText}>{t('cancel')}</Text>
            </Pressable>
            <Pressable
              style={[styles.btnPrimary, (!roomId || busy) && styles.btnDisabled]}
              onPress={() => void onNotify()}
              disabled={!roomId || busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="paper-plane" size={18} color="#fff" />
                  <Text style={styles.btnPrimaryText}>{t('kbsNotifyTitle')}</Text>
                </>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '88%',
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginTop: 10,
    marginBottom: 8,
  },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: theme.colors.text, paddingHorizontal: 20 },
  sheetSub: { fontSize: 13, color: theme.colors.textSecondary, paddingHorizontal: 20, marginTop: 4, marginBottom: 12 },
  scroll: { paddingHorizontal: 20, maxHeight: 400 },
  fieldLbl: { fontSize: 11, fontWeight: '800', color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  lbl: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary, marginTop: 10, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.colors.text,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  row2: { flexDirection: 'row', gap: 10 },
  fieldHalf: { flex: 1 },
  roomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 12 },
  roomChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  roomChipOn: { backgroundColor: '#fef3c7', borderColor: '#f59e0b' },
  roomChipText: { fontWeight: '800', color: theme.colors.text },
  roomChipTextOn: { color: '#b45309' },
  muted: { color: theme.colors.textMuted, fontSize: 13, marginVertical: 8 },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderLight,
  },
  btnGhost: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: theme.colors.backgroundSecondary,
  },
  btnGhostText: { fontWeight: '800', color: theme.colors.text },
  btnPrimary: {
    flex: 2,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#d97706',
  },
  btnPrimaryText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  btnDisabled: { opacity: 0.5 },
});
