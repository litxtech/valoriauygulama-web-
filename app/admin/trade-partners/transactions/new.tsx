import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TradePartnerAdminGate } from '@/components/tradePartner/TradePartnerAdminGate';
import { useTradePartnerProviderOrgId } from '@/hooks/useTradePartnerProviderOrgId';
import {
  calcLineTotal,
  createTradeTransaction,
  fetchTradePartners,
  formatTradeMoney,
  type TradePartnerRow,
  type TradeTransactionItemInput,
} from '@/lib/tradePartner';
import { tradePartnerTheme as theme } from '@/lib/tradePartnerTheme';

type DraftItem = TradeTransactionItemInput & { key: string };

export default function AdminTradeTransactionNewScreen() {
  return (
    <TradePartnerAdminGate>
      <AdminTradeTransactionNewForm />
    </TradePartnerAdminGate>
  );
}

function AdminTradeTransactionNewForm() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ partnerId?: string }>();
  const { orgId } = useTradePartnerProviderOrgId();
  const [partners, setPartners] = useState<TradePartnerRow[]>([]);
  const [partnerId, setPartnerId] = useState(params.partnerId ?? '');
  const [referenceCode, setReferenceCode] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DraftItem[]>([
    { key: '1', description: '', quantity: 1, unit_label: 'Adet', unit_price: 0 },
  ]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    void fetchTradePartners(orgId).then(setPartners);
  }, [orgId]);

  useEffect(() => {
    if (params.partnerId) setPartnerId(params.partnerId);
  }, [params.partnerId]);

  const total = useMemo(
    () => items.reduce((s, i) => s + calcLineTotal(Number(i.quantity) || 0, Number(i.unit_price) || 0), 0),
    [items]
  );

  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  };

  const addItem = () => {
    setItems((prev) => [...prev, { key: String(Date.now()), description: '', quantity: 1, unit_label: 'Adet', unit_price: 0 }]);
  };

  const removeItem = (key: string) => {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((i) => i.key !== key)));
  };

  const submit = async () => {
    if (!partnerId) {
      Alert.alert('Hata', 'Partner seçin.');
      return;
    }
    const validItems = items.filter((i) => i.description.trim() && Number(i.quantity) > 0);
    if (validItems.length === 0) {
      Alert.alert('Hata', 'En az bir geçerli kalem girin.');
      return;
    }
    setLoading(true);
    try {
      const txId = await createTradeTransaction({
        partnerId,
        items: validItems.map((i) => ({
          description: i.description.trim(),
          quantity: Number(i.quantity),
          unit_label: i.unit_label?.trim() || 'Adet',
          unit_price: Number(i.unit_price),
        })),
        notes: notes.trim() || undefined,
        referenceCode: referenceCode.trim() || undefined,
      });
      Alert.alert('Kaydedildi', 'İşlem partner onayına gönderildi.', [
        { text: 'Tamam', onPress: () => router.replace(`/admin/trade-partners/transactions/${txId}`) },
      ]);
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Kaydedilemedi');
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24, paddingHorizontal: 16 }}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={20} color={theme.accent} />
          <Text style={styles.backText}>Geri</Text>
        </TouchableOpacity>
        <Text style={styles.title}>İşlem oluştur</Text>

        <Text style={styles.label}>Partner *</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          {partners.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.chip, partnerId === p.id && styles.chipActive]}
              onPress={() => setPartnerId(p.id)}
            >
              <Text style={[styles.chipText, partnerId === p.id && styles.chipTextActive]} numberOfLines={1}>
                {p.company_name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Field label="Referans kodu" value={referenceCode} onChangeText={setReferenceCode} />
        <Field label="Not" value={notes} onChangeText={setNotes} multiline />

        <Text style={styles.sectionTitle}>Kalemler</Text>
        {items.map((item) => (
          <View key={item.key} style={styles.itemCard}>
            <Field label="Ürün / hizmet" value={item.description} onChangeText={(v) => updateItem(item.key, { description: v })} />
            <View style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Field label="Adet" value={String(item.quantity)} onChangeText={(v) => updateItem(item.key, { quantity: Number(v.replace(',', '.')) || 0 })} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Birim" value={item.unit_label ?? 'Adet'} onChangeText={(v) => updateItem(item.key, { unit_label: v })} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Birim fiyat" value={String(item.unit_price)} onChangeText={(v) => updateItem(item.key, { unit_price: Number(v.replace(',', '.')) || 0 })} keyboardType="decimal-pad" />
              </View>
            </View>
            <Text style={styles.lineTotal}>
              Satır: {formatTradeMoney(calcLineTotal(Number(item.quantity) || 0, Number(item.unit_price) || 0))}
            </Text>
            {items.length > 1 ? (
              <TouchableOpacity onPress={() => removeItem(item.key)}>
                <Text style={styles.removeText}>Kalemi sil</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}

        <TouchableOpacity style={styles.addItemBtn} onPress={addItem}>
          <Ionicons name="add" size={18} color={theme.accent} />
          <Text style={styles.addItemText}>Kalem ekle</Text>
        </TouchableOpacity>

        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Toplam</Text>
          <Text style={styles.totalValue}>{formatTradeMoney(total)}</Text>
        </View>

        <TouchableOpacity style={[styles.submit, loading && { opacity: 0.6 }]} onPress={submit} disabled={loading}>
          {loading ? <ActivityIndicator color="#0f172a" /> : <Text style={styles.submitText}>Kaydet ve onaya gönder</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  multiline?: boolean;
  keyboardType?: 'default' | 'decimal-pad';
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        style={[styles.input, props.multiline && { minHeight: 72, textAlignVertical: 'top' }]}
        placeholderTextColor={theme.mutedSoft}
        multiline={props.multiline}
        keyboardType={props.keyboardType}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  backText: { color: theme.accent, fontWeight: '700' },
  title: { color: theme.text, fontSize: 24, fontWeight: '800', marginBottom: 12 },
  label: { color: theme.muted, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: {
    backgroundColor: theme.surfaceInput,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.text,
    fontSize: 16,
  },
  chip: {
    maxWidth: 180,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    backgroundColor: theme.cardElevated,
    marginRight: 8,
  },
  chipActive: { borderColor: theme.accent, backgroundColor: theme.accentSoft },
  chipText: { color: theme.muted, fontWeight: '700', fontSize: 13 },
  chipTextActive: { color: theme.accent },
  sectionTitle: { color: theme.text, fontSize: 16, fontWeight: '800', marginBottom: 8, marginTop: 4 },
  itemCard: {
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  itemRow: { flexDirection: 'row', gap: 8 },
  lineTotal: { color: theme.accent, fontWeight: '700', marginTop: 4 },
  removeText: { color: theme.danger, fontWeight: '700', marginTop: 6 },
  addItemBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  addItemText: { color: theme.accent, fontWeight: '700' },
  totalCard: {
    backgroundColor: theme.cardElevated,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.cardBorderFocus,
  },
  totalLabel: { color: theme.muted, fontSize: 12, fontWeight: '600' },
  totalValue: { color: theme.text, fontSize: 24, fontWeight: '800', marginTop: 4 },
  submit: { backgroundColor: theme.accent, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  submitText: { color: '#0f172a', fontWeight: '800', fontSize: 16 },
});
