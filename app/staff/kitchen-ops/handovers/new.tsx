import { useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, Alert, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { KitchenProductSuggestInput } from '@/components/kitchenOps/KitchenProductSuggestInput';
import { KitchenMultiPhotoPicker } from '@/components/kitchenOps/KitchenMultiPhotoPicker';
import { KitchenChipSelect, KitchenSaveButton } from '@/components/kitchenOps/KitchenUi';
import { KITCHEN_UNITS } from '@/lib/kitchenOps/constants';
import { saveKitchenHandover } from '@/lib/kitchenOps/handover';
import type { KitchenStockItem } from '@/lib/kitchenOps/types';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';

type DraftMaterial = {
  localId: string;
  name: string;
  quantity: string;
  unit: string;
  stockItemId: string | null;
  note: string;
  photos: string[];
};

function newMaterial(): DraftMaterial {
  return {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    quantity: '',
    unit: 'adet',
    stockItemId: null,
    note: '',
    photos: [],
  };
}

export default function KitchenHandoverNewScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const today = new Date().toISOString().slice(0, 10);

  const [handoverDate, setHandoverDate] = useState(today);
  const [handedBy, setHandedBy] = useState('Otel Mutfağı');
  const [receivedBy, setReceivedBy] = useState(staff?.full_name ?? '');
  const [notes, setNotes] = useState('');
  const [materials, setMaterials] = useState<DraftMaterial[]>([newMaterial()]);
  const [saving, setSaving] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const updateMaterial = (localId: string, patch: Partial<DraftMaterial>) => {
    setMaterials((prev) => prev.map((m) => (m.localId === localId ? { ...m, ...patch } : m)));
  };

  const removeMaterial = (localId: string) => {
    setMaterials((prev) => (prev.length <= 1 ? prev : prev.filter((m) => m.localId !== localId)));
  };

  const onSelectStock = (localId: string, item: KitchenStockItem) => {
    updateMaterial(localId, {
      name: item.name,
      unit: item.unit,
      stockItemId: item.id,
    });
  };

  const validCount = useMemo(() => materials.filter((m) => m.name.trim()).length, [materials]);

  const save = async () => {
    const items = materials
      .filter((m) => m.name.trim())
      .map((m) => ({
        material_name: m.name.trim(),
        quantity: m.quantity ? parseFloat(m.quantity.replace(',', '.')) : null,
        unit: m.unit,
        stock_item_id: m.stockItemId,
        note: m.note.trim() || null,
        image_urls: m.photos,
      }));

    if (!handedBy.trim() || !receivedBy.trim()) {
      Alert.alert('Eksik', 'Teslim eden ve teslim alan zorunlu.');
      return;
    }
    if (items.length === 0) {
      Alert.alert('Eksik', 'En az bir malzeme ekleyin.');
      return;
    }

    setSaving(true);
    try {
      const id = await saveKitchenHandover({
        handoverDate,
        handedByName: handedBy.trim(),
        receivedByName: receivedBy.trim(),
        notes: notes.trim() || null,
        items,
      });
      Alert.alert('Tamam', 'Teslim kaydı oluşturuldu.', [
        { text: 'Detay', onPress: () => router.replace(`/staff/kitchen-ops/handovers/${id}` as never) },
        { text: 'Listeye dön', onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert('Hata', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <Ionicons name="swap-horizontal-outline" size={28} color="#fff" />
        <Text style={styles.heroTitle}>Mutfak Teslim Kaydı</Text>
        <Text style={styles.heroSub}>Otel mutfağının mutfakçıya teslim ettiği malzemeler</Text>
      </View>

      <Text style={styles.label}>Teslim tarihi</Text>
      <TextInput
        style={styles.input}
        value={handoverDate}
        onChangeText={setHandoverDate}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={theme.colors.textMuted}
        autoCapitalize="none"
      />

      <Text style={styles.label}>Teslim eden (otel mutfağı) *</Text>
      <TextInput style={styles.input} value={handedBy} onChangeText={setHandedBy} placeholder="Örn. Otel Mutfağı / Şef adı" placeholderTextColor={theme.colors.textMuted} />

      <Text style={styles.label}>Teslim alan (mutfakçı) *</Text>
      <TextInput style={styles.input} value={receivedBy} onChangeText={setReceivedBy} placeholder="Mutfak personeli" placeholderTextColor={theme.colors.textMuted} />

      <Text style={styles.label}>Genel not</Text>
      <TextInput style={[styles.input, styles.multiline]} value={notes} onChangeText={setNotes} multiline placeholder="Opsiyonel" placeholderTextColor={theme.colors.textMuted} />

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Malzemeler ({validCount})</Text>
        <TouchableOpacity style={styles.addMatBtn} onPress={() => setMaterials((p) => [...p, newMaterial()])}>
          <Ionicons name="add-circle-outline" size={18} color="#0d9488" />
          <Text style={styles.addMatText}>Malzeme ekle</Text>
        </TouchableOpacity>
      </View>

      {materials.map((mat, index) => (
        <View key={mat.localId} style={styles.matCard}>
          <View style={styles.matHead}>
            <Text style={styles.matIndex}>Malzeme {index + 1}</Text>
            {materials.length > 1 ? (
              <TouchableOpacity onPress={() => removeMaterial(mat.localId)}>
                <Ionicons name="trash-outline" size={18} color="#dc2626" />
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={styles.fieldLabel}>Ürün / malzeme adı *</Text>
          <KitchenProductSuggestInput
            value={mat.name}
            onChangeText={(t) => updateMaterial(mat.localId, { name: t, stockItemId: null })}
            onSelect={(item) => onSelectStock(mat.localId, item)}
            placeholder="Malzeme ara veya yaz"
          />

          <View style={styles.row2}>
            <View style={styles.flex1}>
              <Text style={styles.fieldLabel}>Miktar</Text>
              <TextInput
                style={styles.input}
                value={mat.quantity}
                onChangeText={(t) => updateMaterial(mat.localId, { quantity: t })}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={theme.colors.textMuted}
              />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.fieldLabel}>Birim</Text>
              <KitchenChipSelect
                options={KITCHEN_UNITS.map((u) => ({ value: u, label: u }))}
                value={mat.unit as (typeof KITCHEN_UNITS)[number]}
                onChange={(v) => updateMaterial(mat.localId, { unit: v })}
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>Not</Text>
          <TextInput
            style={styles.input}
            value={mat.note}
            onChangeText={(t) => updateMaterial(mat.localId, { note: t })}
            placeholder="Opsiyonel"
            placeholderTextColor={theme.colors.textMuted}
          />

          <KitchenMultiPhotoPicker
            photos={mat.photos}
            onChange={(urls) => updateMaterial(mat.localId, { photos: urls })}
            subfolder="handover"
            label="Malzeme fotoğrafları"
            onPreview={setPreviewUri}
          />
        </View>
      ))}

      <KitchenSaveButton label="Teslim Kaydını Kaydet" onPress={save} loading={saving} />
      <ImagePreviewModal visible={!!previewUri} uri={previewUri} onClose={() => setPreviewUri(null)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 40 },
  hero: { backgroundColor: '#0d9488', borderRadius: 16, padding: 18, marginBottom: 8, gap: 4 },
  heroTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  heroSub: { color: '#ccfbf1', fontSize: 13, marginTop: 2 },
  label: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 6, marginTop: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontSize: 16,
    color: theme.colors.text,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  addMatBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addMatText: { fontSize: 13, fontWeight: '700', color: '#0d9488' },
  matCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  matHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  matIndex: { fontSize: 14, fontWeight: '800', color: '#0f766e' },
  row2: { flexDirection: 'row', gap: 10 },
  flex1: { flex: 1 },
});
