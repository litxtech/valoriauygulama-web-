import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { cancelGuestStaffTipIfPending, createGuestStaffTipStripePayment, waitForStaffTipPaid } from '@/lib/staffTips';
import { staffTipText, TIP_PRESET_AMOUNTS, formatTipAmount } from '@/lib/staffTipsI18n';
import { useTranslation } from 'react-i18next';
import { useStaffTipPaymentStore } from '@/stores/staffTipPaymentStore';

const ACCENT = '#b8860b';
const PAY_GRADIENT = ['#1e293b', '#0f172a'] as const;

export type StaffTipTarget = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  department?: string | null;
};

type Props = {
  visible: boolean;
  staff: StaffTipTarget | null;
  guestName?: string | null;
  roomNumber?: string | null;
  onClose: () => void;
  onSuccess?: (tipId: string) => void;
};

function parseAmountInput(raw: string): number | null {
  const n = parseFloat(raw.replace(',', '.').trim());
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100) / 100;
}

export const StaffTipSheet = memo(function StaffTipSheet({
  visible,
  staff,
  onClose,
  onSuccess,
}: Props) {
  const insets = useSafeAreaInsets();
  const { i18n } = useTranslation();
  void i18n.language;
  const [selectedPreset, setSelectedPreset] = useState<number | null>(100);
  const [customAmount, setCustomAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const waitCancelRef = useRef<(() => void) | null>(null);
  const paySessionRef = useRef(0);
  const externalPayRef = useRef(false);

  const abortPaymentWatch = useCallback(() => {
    waitCancelRef.current?.();
    waitCancelRef.current = null;
    paySessionRef.current += 1;
    externalPayRef.current = false;
    useStaffTipPaymentStore.getState().finishExternalPay();
  }, []);

  const resetForm = useCallback(() => {
    setSelectedPreset(100);
    setCustomAmount('');
    setNote('');
    setSubmitting(false);
  }, []);

  const reset = useCallback(() => {
    abortPaymentWatch();
    resetForm();
  }, [abortPaymentWatch, resetForm]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  useEffect(() => {
    if (visible) return;
    if (externalPayRef.current) return;
    reset();
  }, [visible, reset]);

  const amount = useMemo(() => {
    if (customAmount.trim()) return parseAmountInput(customAmount);
    return selectedPreset;
  }, [customAmount, selectedPreset]);

  const validAmount = amount != null && amount >= 10 && amount <= 50000;

  const submit = async () => {
    if (!staff?.id || !validAmount || amount == null) {
      Alert.alert(staffTipText('tipAmountLabel'), staffTipText('tipErrorAmount'));
      return;
    }
    setSubmitting(true);
    const session = paySessionRef.current;
    try {
      const payment = await createGuestStaffTipStripePayment({
        staffId: staff.id,
        amount,
        note,
      });
      if (session !== paySessionRef.current) return;

      const canOpen = await Linking.canOpenURL(payment.payUrl);
      if (!canOpen) {
        throw new Error(staffTipText('tipErrorGeneric'));
      }
      await Linking.openURL(payment.payUrl);
      setSubmitting(false);

      externalPayRef.current = true;
      useStaffTipPaymentStore.getState().beginExternalPay({
        tipId: payment.tipId,
        staffName: staff.name,
        amount,
      });
      onClose();

      waitCancelRef.current?.();
      const { promise, cancel } = waitForStaffTipPaid(payment.tipId);
      waitCancelRef.current = cancel;
      useStaffTipPaymentStore.getState().setPaymentWatchCancel(cancel);

      void promise
        .then(() => {
          if (session !== paySessionRef.current) return;
          externalPayRef.current = false;
          useStaffTipPaymentStore.getState().finishExternalPay();
          resetForm();
          onSuccess?.(payment.tipId);
        })
        .catch(() => {
          if (session !== paySessionRef.current) return;
          externalPayRef.current = false;
          useStaffTipPaymentStore.getState().finishExternalPay();
          void cancelGuestStaffTipIfPending(payment.tipId).catch(() => {});
        })
        .finally(() => {
          if (waitCancelRef.current === cancel) waitCancelRef.current = null;
        });
    } catch (e) {
      if (session !== paySessionRef.current) return;
      Alert.alert(staffTipText('tipAlertError'), (e as Error)?.message || staffTipText('tipErrorGeneric'));
      setSubmitting(false);
    }
  };

  if (!staff) return null;

  const initial = (staff.name || '?').charAt(0).toUpperCase();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <LinearGradient colors={['#b8860b', '#d97706']} style={styles.headerIcon}>
              <Ionicons name="gift" size={22} color="#fff" />
            </LinearGradient>
            <View style={styles.headerText}>
              <Text style={styles.title}>{staffTipText('tipSheetTitle')}</Text>
              <Text style={styles.subtitle}>{staffTipText('tipSheetSubtitle', { name: staff.name })}</Text>
            </View>
            <TouchableOpacity onPress={handleClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.staffRow}>
              {staff.avatarUrl ? (
                <CachedImage uri={staff.avatarUrl} style={styles.staffAvatar} contentFit="cover" />
              ) : (
                <View style={[styles.staffAvatar, styles.staffAvatarPh]}>
                  <Text style={styles.staffAvatarLetter}>{initial}</Text>
                </View>
              )}
              <View style={styles.staffMeta}>
                <Text style={styles.staffName}>{staff.name}</Text>
                {staff.department ? <Text style={styles.staffDept}>{staff.department}</Text> : null}
              </View>
            </View>

            <Text style={styles.sectionLabel}>{staffTipText('tipAmountLabel')}</Text>
            <View style={styles.presetRow}>
              {TIP_PRESET_AMOUNTS.map((v) => {
                const active = selectedPreset === v && !customAmount.trim();
                return (
                  <TouchableOpacity
                    key={v}
                    activeOpacity={0.85}
                    onPress={() => {
                      setSelectedPreset(v);
                      setCustomAmount('');
                    }}
                    style={[styles.presetChip, active && styles.presetChipActive]}
                  >
                    <Text style={[styles.presetChipText, active && styles.presetChipTextActive]}>
                      {formatTipAmount(v, 'try')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.customLabel}>{staffTipText('tipCustomAmount')}</Text>
            <TextInput
              style={styles.amountInput}
              placeholder={staffTipText('tipCustomPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="decimal-pad"
              value={customAmount}
              onChangeText={(t) => {
                setCustomAmount(t);
                if (t.trim()) setSelectedPreset(null);
              }}
            />

            <Text style={styles.sectionLabel}>{staffTipText('tipNoteLabel')}</Text>
            <TextInput
              style={styles.noteInput}
              placeholder={staffTipText('tipNotePlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={300}
            />

            <TouchableOpacity
              activeOpacity={0.92}
              onPress={() => void submit()}
              disabled={submitting || !validAmount}
              style={[styles.payBtnOuter, (!validAmount || submitting) && styles.payBtnDisabled]}
            >
              <LinearGradient
                colors={[...PAY_GRADIENT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.payBtnGradient}
              >
                <View style={styles.payBtnGlow} />
                <View style={styles.payBtnRow}>
                  <View style={styles.payCardIconWrap}>
                    <Ionicons name="card" size={22} color="#fff" />
                  </View>
                  <View style={styles.payBtnTextCol}>
                    <Text style={styles.payBtnTitle}>
                      {validAmount ? staffTipText('tipSubmitPay') : staffTipText('tipSubmitPayShort')}
                    </Text>
                    {validAmount ? (
                      <Text style={styles.payBtnAmount}>{formatTipAmount(amount!, 'try')}</Text>
                    ) : (
                      <Text style={styles.payBtnSub}>{staffTipText('tipSelectAmount')}</Text>
                    )}
                  </View>
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <View style={styles.payBtnChevron}>
                      <Ionicons name="arrow-forward" size={18} color="#fff" />
                    </View>
                  )}
                </View>
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.secureRow}>
              <Ionicons name="shield-checkmark" size={14} color={theme.colors.textMuted} />
              <Text style={styles.secureText}>{staffTipText('tipSecureHint')}</Text>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '92%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderLight,
    marginBottom: 12,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  headerIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 18, fontWeight: '900', color: theme.colors.text },
  subtitle: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
  closeBtn: { padding: 4 },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: `${ACCENT}10`,
    borderWidth: 1,
    borderColor: `${ACCENT}25`,
    marginBottom: 16,
  },
  staffAvatar: { width: 52, height: 52, borderRadius: 16 },
  staffAvatarPh: { backgroundColor: `${ACCENT}22`, alignItems: 'center', justifyContent: 'center' },
  staffAvatarLetter: { fontSize: 20, fontWeight: '900', color: ACCENT },
  staffMeta: { flex: 1, minWidth: 0 },
  staffName: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  staffDept: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 4,
  },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  presetChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  presetChipActive: { borderColor: ACCENT, backgroundColor: `${ACCENT}18` },
  presetChipText: { fontSize: 14, fontWeight: '800', color: theme.colors.textSecondary },
  presetChipTextActive: { color: ACCENT },
  customLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted, marginBottom: 6 },
  amountInput: {
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: theme.colors.text,
    minHeight: 72,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  payBtnOuter: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  payBtnDisabled: { opacity: 0.45 },
  payBtnGradient: {
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  payBtnGlow: {
    position: 'absolute',
    top: -20,
    right: -10,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(184,134,11,0.25)',
  },
  payBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  payCardIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  payBtnTextCol: { flex: 1, minWidth: 0 },
  payBtnTitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  payBtnAmount: { color: '#fff', fontSize: 26, fontWeight: '900', marginTop: 2, letterSpacing: -0.5 },
  payBtnSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600', marginTop: 2 },
  payBtnChevron: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 8,
  },
  secureText: { fontSize: 12, color: theme.colors.textMuted, fontWeight: '600' },
});
