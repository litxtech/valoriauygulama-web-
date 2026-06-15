import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/constants/theme';
import { createPaymentRequest } from '@/lib/payments';
import { createPaymentQrStand } from '@/lib/paymentQrStands';
import {
  PAYMENT_CURRENCIES,
  PAYMENT_SERVICE_KINDS,
  paymentCurrencyLabel,
  paymentKindLabel,
  paymentText,
  type PaymentCurrency,
  type PaymentServiceKind,
} from '@/lib/paymentsI18n';

const ACCENT = '#635bff';

type QrMode = 'single' | 'standing';

type Props = {
  successBasePath: '/staff/payments' | '/admin/payments';
};

function parseAmount(raw: string): number | null {
  const n = parseFloat(raw.replace(',', '.').trim());
  if (Number.isNaN(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export function PaymentNewForm({ successBasePath }: Props) {
  const router = useRouter();
  const [qrMode, setQrMode] = useState<QrMode>('single');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [serviceKind, setServiceKind] = useState<PaymentServiceKind>('generic');
  const [currency, setCurrency] = useState<PaymentCurrency>('try');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const parsed = parseAmount(amount);
    if (!parsed) {
      Alert.alert(paymentText('paymentsAmount'), paymentText('paymentsErrorAmount'));
      return;
    }
    if (!title.trim()) {
      Alert.alert(paymentText('paymentsTitleLabel'), paymentText('paymentsErrorTitle'));
      return;
    }
    setSubmitting(true);
    try {
      if (qrMode === 'standing') {
        const result = await createPaymentQrStand({
          amount: parsed,
          currency,
          title: title.trim(),
          description: description.trim() || null,
          serviceKind,
        });
        router.replace(`${successBasePath}/stand/${result.id}`);
      } else {
        const result = await createPaymentRequest({
          amount: parsed,
          currency,
          title: title.trim(),
          description: description.trim() || null,
          serviceKind,
        });
        router.replace(`${successBasePath}/${result.id}`);
      }
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message || paymentText('paymentsErrorStripe'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <Ionicons name="qr-code" size={32} color={ACCENT} />
        <Text style={styles.heroTitle}>{paymentText('paymentsTitle')}</Text>
      </View>

      <Text style={styles.label}>QR türü</Text>
      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeBtn, qrMode === 'single' && styles.modeBtnActive]}
          onPress={() => setQrMode('single')}
        >
          <Ionicons name="flash-outline" size={18} color={qrMode === 'single' ? '#fff' : ACCENT} />
          <Text style={[styles.modeBtnText, qrMode === 'single' && styles.modeBtnTextActive]}>
            {paymentText('paymentsQrModeSingle')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, qrMode === 'standing' && styles.modeBtnActive]}
          onPress={() => setQrMode('standing')}
        >
          <Ionicons name="infinite-outline" size={18} color={qrMode === 'standing' ? '#fff' : ACCENT} />
          <Text style={[styles.modeBtnText, qrMode === 'standing' && styles.modeBtnTextActive]}>
            {paymentText('paymentsQrModeStanding')}
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.modeHint}>
        {qrMode === 'single' ? paymentText('paymentsQrModeSingleHint') : paymentText('paymentsQrModeStandingHint')}
      </Text>

      <Text style={styles.label}>{paymentText('paymentsCurrency')}</Text>
      <View style={styles.chipWrap}>
        {PAYMENT_CURRENCIES.map((c) => {
          const active = currency === c;
          return (
            <TouchableOpacity key={c} onPress={() => setCurrency(c)} style={[styles.chip, styles.currencyChip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{paymentCurrencyLabel(c)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>{paymentText('paymentsAmount')} ({currency.toUpperCase()})</Text>
      <TextInput
        style={styles.inputLg}
        placeholder={paymentText('paymentsAmountPlaceholder')}
        placeholderTextColor={theme.colors.textMuted}
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
      />

      <Text style={styles.label}>{paymentText('paymentsTitleLabel')}</Text>
      <TextInput
        style={styles.input}
        placeholder={paymentText('paymentsTitlePlaceholder')}
        placeholderTextColor={theme.colors.textMuted}
        value={title}
        onChangeText={setTitle}
      />

      <Text style={styles.label}>{paymentText('paymentsDescription')}</Text>
      <TextInput
        style={[styles.input, styles.inputMulti]}
        placeholder={paymentText('paymentsDescriptionPlaceholder')}
        placeholderTextColor={theme.colors.textMuted}
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <Text style={styles.label}>{paymentText('paymentsCategory')}</Text>
      <View style={styles.chipWrap}>
        {PAYMENT_SERVICE_KINDS.map((k) => {
          const active = serviceKind === k;
          return (
            <TouchableOpacity key={k} onPress={() => setServiceKind(k)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{paymentKindLabel(k)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity activeOpacity={0.88} onPress={() => void submit()} disabled={submitting} style={styles.submitWrap}>
        <LinearGradient colors={['#635bff', '#4f46e5']} style={styles.submitBtn}>
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="qr-code-outline" size={20} color="#fff" />
              <Text style={styles.submitText}>{paymentText('paymentsCreateQr')}</Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 40 },
  hero: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  heroTitle: { fontSize: 20, fontWeight: '900', color: theme.colors.text },
  label: { fontSize: 11, fontWeight: '800', color: theme.colors.textSecondary, marginTop: 12, marginBottom: 6, letterSpacing: 0.4 },
  modeRow: { flexDirection: 'row', gap: 10 },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: ACCENT + '44',
    backgroundColor: theme.colors.surface,
  },
  modeBtnActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  modeBtnText: { fontSize: 12, fontWeight: '800', color: ACCENT },
  modeBtnTextActive: { color: '#fff' },
  modeHint: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 8, lineHeight: 18 },
  inputLg: {
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 28,
    fontWeight: '900',
    color: ACCENT,
    backgroundColor: theme.colors.surface,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  chipActive: { borderColor: ACCENT, backgroundColor: ACCENT + '14' },
  currencyChip: { minWidth: 72, alignItems: 'center' },
  chipText: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },
  chipTextActive: { color: ACCENT },
  submitWrap: { marginTop: 24, borderRadius: 14, overflow: 'hidden' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
