import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Pressable,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { KitchenChipSelect, KitchenSaveButton } from '@/components/kitchenOps/KitchenUi';
import { KITCHEN_PAYMENT_TYPES } from '@/lib/kitchenOps/constants';
import { fetchDaySummary } from '@/lib/kitchenOps/api';
import { fmtKitchenMoney } from '@/lib/kitchenOps/stockStatus';
import {
  insertKitchenRevenue,
  kitchenTableLabel,
  kitchenTableNumbers,
} from '@/lib/kitchenOps/revenueTables';

function parseAmount(raw: string): number {
  const n = parseFloat(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export default function KitchenRevenueNewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const amountRef = useRef<View>(null);
  const descriptionRef = useRef<View>(null);
  const noteRef = useRef<View>(null);
  const staff = useAuthStore((s) => s.staff);
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [paymentType, setPaymentType] = useState<(typeof KITCHEN_PAYMENT_TYPES)[number]['value'] | ''>('');
  const [note, setNote] = useState('');
  const [description, setDescription] = useState('');
  const [showOptional, setShowOptional] = useState(false);
  const [saving, setSaving] = useState(false);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const scrollFieldIntoView = (target: React.RefObject<View | null>) => {
    const content = contentRef.current;
    const field = target.current;
    if (!content || !field) return;
    requestAnimationFrame(() => {
      field.measureLayout(
        content,
        (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 96), animated: true }),
        () => {}
      );
    });
  };

  const contentPadBottom = Math.max(insets.bottom, 16) + 48 + (Platform.OS === 'android' ? keyboardHeight : 0);

  useEffect(() => {
    fetchDaySummary()
      .then((s) => setTodayRevenue(Number(s.total_revenue ?? 0)))
      .catch(() => setTodayRevenue(0));
  }, []);

  const resetForm = (keepTable = true) => {
    if (!keepTable) setTableNumber(null);
    setAmount('');
    setPaymentType('');
    setNote('');
    setDescription('');
    setShowOptional(false);
  };

  const save = async (addAnother: boolean) => {
    const amt = parseAmount(amount);
    if (!tableNumber) {
      Alert.alert('Eksik', 'Masa seçin.');
      return;
    }
    if (!amt || amt <= 0) {
      Alert.alert('Eksik', 'Geçerli bir tutar girin.');
      return;
    }
    if (!staff?.organization_id) {
      Alert.alert('Hata', 'Organizasyon bilgisi bulunamadı.');
      return;
    }

    setSaving(true);
    try {
      await insertKitchenRevenue({
        organizationId: staff.organization_id,
        staffId: staff.id,
        tableNumber,
        amount: amt,
        paymentType: paymentType || 'nakit',
        note,
        description: description.trim() || undefined,
      });

      const summary = await fetchDaySummary().catch(() => ({ total_revenue: todayRevenue + amt }));
      setTodayRevenue(Number(summary.total_revenue ?? todayRevenue + amt));

      if (addAnother) {
        resetForm(true);
        Alert.alert('Tamam', `${kitchenTableLabel(tableNumber)} — ${fmtKitchenMoney(amt)} kaydedildi.`);
      } else {
        Alert.alert('Tamam', 'Hasılat kaydedildi.', [{ text: 'Tamam', onPress: () => router.back() }]);
      }
    } catch (e) {
      Alert.alert('Hata', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + headerHeight : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: contentPadBottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <View ref={contentRef} collapsable={false}>
      <LinearGradient colors={['#059669', '#047857', '#065f46']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroRow}>
          <View style={styles.heroIcon}>
            <Ionicons name="cash" size={24} color="#fff" />
          </View>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Hasılat gir</Text>
            <Text style={styles.heroSub}>Masa + tutar yeterli · saat otomatik kaydedilir</Text>
          </View>
        </View>
        <View style={styles.heroStat}>
          <Text style={styles.heroStatLabel}>Bugün toplam</Text>
          <Text style={styles.heroStatValue}>{fmtKitchenMoney(todayRevenue)}</Text>
        </View>
      </LinearGradient>

      <View style={styles.formCard}>
        <Text style={styles.sectionLabel}>Masa *</Text>
        <View style={styles.tableGrid}>
          {kitchenTableNumbers().map((n) => {
            const active = tableNumber === n;
            return (
              <Pressable
                key={n}
                onPress={() => setTableNumber(n)}
                style={[styles.tableBtn, active && styles.tableBtnActive]}
              >
                <Text style={[styles.tableBtnNum, active && styles.tableBtnNumActive]}>{n}</Text>
                <Text style={[styles.tableBtnLabel, active && styles.tableBtnLabelActive]}>Masa</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>Tutar (₺) *</Text>
        <View ref={amountRef} collapsable={false}>
        <TextInput
          style={[styles.input, styles.amountInput]}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0,00"
          placeholderTextColor={theme.colors.textMuted}
          onFocus={() => scrollFieldIntoView(amountRef)}
        />
        </View>

        <TouchableOpacity
          style={styles.optionalToggle}
          onPress={() => {
            setShowOptional((v) => {
              const next = !v;
              if (next) {
                setTimeout(() => scrollFieldIntoView(descriptionRef), 120);
              }
              return next;
            });
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.optionalToggleText}>Detaylar (opsiyonel)</Text>
          <Ionicons name={showOptional ? 'chevron-up' : 'chevron-down'} size={18} color="#64748b" />
        </TouchableOpacity>

        {showOptional ? (
          <View style={styles.optionalBox}>
            <Text style={styles.label}>Ödeme tipi</Text>
            <KitchenChipSelect
              options={KITCHEN_PAYMENT_TYPES.map((p) => ({ value: p.value, label: p.label }))}
              value={paymentType}
              onChange={(v) => setPaymentType(v)}
            />

            <Text style={styles.label}>Açıklama</Text>
            <View ref={descriptionRef} collapsable={false}>
            <TextInput
              style={styles.input}
              value={description}
              onChangeText={setDescription}
              placeholder={tableNumber ? kitchenTableLabel(tableNumber) : 'Opsiyonel'}
              placeholderTextColor={theme.colors.textMuted}
              onFocus={() => scrollFieldIntoView(descriptionRef)}
            />
            </View>

            <Text style={styles.label}>Not</Text>
            <View ref={noteRef} collapsable={false}>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={note}
              onChangeText={setNote}
              multiline
              placeholder="Opsiyonel not"
              placeholderTextColor={theme.colors.textMuted}
              onFocus={() => scrollFieldIntoView(noteRef)}
            />
            </View>
          </View>
        ) : null}

        <KitchenSaveButton label="Kaydet" onPress={() => save(false)} loading={saving} />
        <Pressable
          onPress={() => save(true)}
          disabled={saving}
          style={({ pressed }) => [styles.secondaryBtn, (saving || pressed) && { opacity: 0.85 }]}
        >
          <Text style={styles.secondaryBtnText}>Kaydet ve yeni</Text>
        </Pressable>

        <TouchableOpacity style={styles.historyLink} onPress={() => router.push('/staff/kitchen-ops/revenue' as never)}>
          <Ionicons name="calendar-outline" size={18} color="#2563eb" />
          <Text style={styles.historyLinkText}>Günlük hasılat geçmişi</Text>
        </TouchableOpacity>
      </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16 },
  hero: { borderRadius: 18, padding: 18, marginBottom: 16, ...theme.shadows.md },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1 },
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.88)', marginTop: 2, lineHeight: 18 },
  heroStat: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.22)',
  },
  heroStatLabel: { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  heroStatValue: { fontSize: 24, fontWeight: '800', color: '#fff', marginTop: 2 },
  formCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  sectionLabel: { fontSize: 14, fontWeight: '800', color: theme.colors.text, marginBottom: 10 },
  tableGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  tableBtn: {
    width: '22%',
    minWidth: 68,
    flexGrow: 1,
    aspectRatio: 1,
    maxWidth: 82,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableBtnActive: { backgroundColor: '#059669', borderColor: '#047857' },
  tableBtnNum: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  tableBtnNumActive: { color: '#fff' },
  tableBtnLabel: { fontSize: 10, fontWeight: '600', color: theme.colors.textMuted, marginTop: 2 },
  tableBtnLabelActive: { color: 'rgba(255,255,255,0.85)' },
  label: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.colors.text,
  },
  amountInput: { fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  optionalToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingVertical: 10,
  },
  optionalToggleText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  optionalBox: { borderTopWidth: 1, borderTopColor: theme.colors.borderLight, paddingTop: 4 },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  secondaryBtn: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    backgroundColor: '#ecfdf5',
  },
  secondaryBtnText: { color: '#047857', fontSize: 15, fontWeight: '700' },
  historyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 8,
  },
  historyLinkText: { color: '#2563eb', fontSize: 14, fontWeight: '600' },
});
