import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, Alert, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '@/constants/theme';
import { KitchenProductSuggestInput } from '@/components/kitchenOps/KitchenProductSuggestInput';
import { KitchenChipSelect, KitchenSaveButton } from '@/components/kitchenOps/KitchenUi';
import { KitchenStockItemCard } from '@/components/kitchenOps/KitchenStockItemCard';
import { KITCHEN_USAGE_REASONS } from '@/lib/kitchenOps/constants';
import { applyKitchenMovement, fetchKitchenItems } from '@/lib/kitchenOps/api';
import type { KitchenStockItem } from '@/lib/kitchenOps/types';

function singleParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && s.trim() ? s.trim() : undefined;
}

export default function KitchenStockExitScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ itemId?: string }>();
  const itemIdParam = singleParam(params.itemId);

  const [selected, setSelected] = useState<KitchenStockItem | null>(null);
  const [searchName, setSearchName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<(typeof KITCHEN_USAGE_REASONS)[number]['value'] | ''>('');
  const [note, setNote] = useState('');
  const [frequent, setFrequent] = useState<KitchenStockItem[]>([]);
  const [saving, setSaving] = useState(false);

  const loadFrequent = useCallback(async () => {
    const items = await fetchKitchenItems();
    setFrequent(items.slice(0, 8));
    if (itemIdParam) {
      const found = items.find((i) => i.id === itemIdParam);
      if (found) setSelected(found);
    }
  }, [itemIdParam]);

  useEffect(() => { loadFrequent(); }, [loadFrequent]);

  const quickExit = async (item: KitchenStockItem, qty: number, r?: string) => {
    const movementType = r === 'bozuldu' ? 'waste' : 'out';
    try {
      await applyKitchenMovement({
        itemId: item.id,
        movementType,
        quantity: qty,
        reason: r ?? 'diger',
        source: 'quick_button',
      });
      Alert.alert('Tamam', `${item.name}: -${qty} ${item.unit}`);
      loadFrequent();
    } catch (e) {
      Alert.alert('Hata', (e as Error).message);
    }
  };

  const save = async () => {
    if (!selected) {
      Alert.alert('Ürün seçin', 'Çıkış yapılacak ürünü seçin.');
      return;
    }
    const qty = parseFloat(quantity.replace(',', '.'));
    if (!qty || qty <= 0) {
      Alert.alert('Miktar', 'Geçerli bir miktar girin.');
      return;
    }
    if (!reason) {
      Alert.alert('Neden', 'Kullanım nedeni seçin.');
      return;
    }
    setSaving(true);
    try {
      await applyKitchenMovement({
        itemId: selected.id,
        movementType: reason === 'bozuldu' ? 'waste' : 'out',
        quantity: qty,
        reason,
        note: note.trim() || null,
      });
      Alert.alert('Tamam', 'Stok çıkışı kaydedildi.', [{ text: 'Tamam', onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert('Hata', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={false} onRefresh={loadFrequent} />}
    >
      <Text style={styles.section}>Hızlı düş — sık kullanılan</Text>
      {frequent.map((item) => (
        <KitchenStockItemCard
          key={item.id}
          item={item}
          showQuickExit
          onQuickExit={(qty) => quickExit(item, qty, 'diger')}
          onPress={() => router.push(`/staff/kitchen-ops/stock/product/${item.id}` as never)}
        />
      ))}

      <Text style={[styles.section, { marginTop: 20 }]}>Manuel çıkış</Text>
      <KitchenProductSuggestInput
        value={searchName}
        onChangeText={setSearchName}
        onSelect={(item) => { setSelected(item); setSearchName(item.name); }}
        placeholder="Ürün ara..."
      />
      {selected ? (
        <Text style={styles.selected}>Seçili: {selected.name} ({Number(selected.current_quantity)} {selected.unit})</Text>
      ) : null}

      <Text style={styles.label}>Miktar</Text>
      <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.colors.textMuted} />

      <Text style={styles.label}>Kullanım nedeni</Text>
      <KitchenChipSelect
        options={KITCHEN_USAGE_REASONS.map((r) => ({ value: r.value, label: r.label }))}
        value={reason}
        onChange={(v) => setReason(v)}
      />

      <Text style={styles.label}>Not</Text>
      <TextInput style={[styles.input, styles.multiline]} value={note} onChangeText={setNote} multiline placeholder="Opsiyonel" placeholderTextColor={theme.colors.textMuted} />

      <KitchenSaveButton label="Stoktan Düş" onPress={save} loading={saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 40 },
  section: { fontSize: 14, fontWeight: '800', color: theme.colors.text, marginBottom: 10 },
  selected: { marginTop: 8, fontSize: 13, color: theme.colors.primary, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.colors.text,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
});
