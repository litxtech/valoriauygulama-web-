import { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Alert, TextInput } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { fetchCariNetBalance } from '@/lib/kitchenOps/api';
import { fmtKitchenMoney } from '@/lib/kitchenOps/stockStatus';
import { KITCHEN_CARI_DIRECTIONS } from '@/lib/kitchenOps/constants';
import { KitchenChipSelect, KitchenSaveButton } from '@/components/kitchenOps/KitchenUi';
import { KitchenCariPrintBar } from '@/components/kitchenOps/KitchenPrintBar';
import { formatDateShort } from '@/lib/date';
import { useCachedFocusLoad } from '@/hooks/useCachedFocusLoad';

type LedgerRow = { id: string; direction: string; amount: number; description: string | null; entry_date: string; category: string | null };

type CariCache = {
  net: number;
  rows: LedgerRow[];
  cariLimit: number;
};

export default function KitchenCariScreen() {
  const staff = useAuthStore((s) => s.staff);
  const [direction, setDirection] = useState<(typeof KITCHEN_CARI_DIRECTIONS)[number]['value'] | ''>('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async (): Promise<CariCache | null> => {
    const [balance, { data: ledger }, { data: settings }] = await Promise.all([
      fetchCariNetBalance(),
      supabase.from('kitchen_cari_ledger').select('id, direction, amount, description, entry_date, category').order('entry_date', { ascending: false }).limit(30),
      supabase.from('kitchen_ops_settings').select('cari_debt_limit').maybeSingle(),
    ]);
    return {
      net: balance,
      rows: (ledger ?? []) as LedgerRow[],
      cariLimit: settings?.cari_debt_limit ? Number(settings.cari_debt_limit) : 50000,
    };
  }, []);

  const { data, refreshing, refresh, reload } = useCachedFocusLoad<CariCache>({
    cacheKey: 'kitchen-cari-ledger',
    fetchData,
  });

  const net = data?.net ?? 0;
  const rows = data?.rows ?? [];
  const cariLimit = data?.cariLimit ?? 50000;

  const kitchenOwes = rows.filter((r) => r.direction === 'kitchen_owes_hotel').reduce((s, r) => s + Number(r.amount), 0);
  const hotelOwes = rows.filter((r) => r.direction === 'hotel_owes_kitchen').reduce((s, r) => s + Number(r.amount), 0);

  const addEntry = async () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!direction || !amt) {
      Alert.alert('Eksik', 'Yön, tutar zorunlu.');
      return;
    }
    if (direction === 'kitchen_owes_hotel' && kitchenOwes + amt > cariLimit) {
      Alert.alert('Cari limit', `Mutfak maksimum ${fmtKitchenMoney(cariLimit)} borçlanabilir. Limit aşıldı!`);
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('kitchen_cari_ledger').insert({
        organization_id: staff?.organization_id,
        direction,
        amount: amt,
        description: description.trim() || null,
        created_by: staff?.id,
      });
      if (error) throw error;
      setAmount('');
      setDescription('');
      await reload();
    } catch (e) {
      Alert.alert('Hata', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <KitchenCariPrintBar defaultOpen />
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>Net cari durum</Text>
        <Text style={[styles.heroValue, net >= 0 ? styles.positive : styles.negative]}>{fmtKitchenMoney(net)}</Text>
        <Text style={styles.heroSub}>{net >= 0 ? 'Otel mutfağa borçlu' : 'Mutfak otele borçlu'}</Text>
        <Text style={styles.limit}>Limit: {fmtKitchenMoney(cariLimit)}</Text>
      </View>

      <Text style={styles.section}>Yeni hareket</Text>
      <KitchenChipSelect options={KITCHEN_CARI_DIRECTIONS.map((d) => ({ value: d.value, label: d.label }))} value={direction} onChange={setDirection} />
      <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Tutar (₺)" placeholderTextColor={theme.colors.textMuted} />
      <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="Açıklama" placeholderTextColor={theme.colors.textMuted} />
      <KitchenSaveButton label="Cari Kaydet" onPress={addEntry} loading={saving} />

      <Text style={styles.section}>Son hareketler</Text>
      {rows.map((r) => (
        <View key={r.id} style={styles.row}>
          <Text style={styles.rowMain}>{r.direction === 'kitchen_owes_hotel' ? 'Mutfak → Otel' : 'Otel → Mutfak'} · {fmtKitchenMoney(Number(r.amount))}</Text>
          <Text style={styles.rowSub}>{formatDateShort(r.entry_date)} {r.description ? `· ${r.description}` : ''}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 40 },
  hero: { backgroundColor: '#0d9488', borderRadius: 16, padding: 20, marginBottom: 16 },
  heroLabel: { color: '#ccfbf1', fontSize: 13, fontWeight: '600' },
  heroValue: { fontSize: 32, fontWeight: '900', color: '#fff', marginTop: 4 },
  positive: { color: '#ecfdf5' },
  negative: { color: '#fecaca' },
  heroSub: { color: '#99f6e4', fontSize: 14, marginTop: 4 },
  limit: { color: '#5eead4', fontSize: 12, marginTop: 8 },
  section: { fontSize: 14, fontWeight: '800', color: theme.colors.text, marginTop: 16, marginBottom: 8 },
  input: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: theme.colors.text, marginTop: 8 },
  row: { backgroundColor: theme.colors.surface, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.borderLight },
  rowMain: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  rowSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
});
