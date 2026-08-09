import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { adminTheme } from '@/constants/adminTheme';
import { createBookableShowcaseRoom } from '@/lib/onlineBooking';

const CAPACITY_PRESETS = ['1+1', '2+1', '2 kişilik', '3 kişilik', '4 kişilik', 'Aile'] as const;

export default function AdminBookingNewRoom() {
  const router = useRouter();
  const [capacityLabel, setCapacityLabel] = useState('2+1');
  const [displayTitle, setDisplayTitle] = useState('');
  const [price, setPrice] = useState('');
  const [maxGuests, setMaxGuests] = useState('3');
  const [description, setDescription] = useState('');
  const [bedType, setBedType] = useState('');
  const [viewType, setViewType] = useState('');
  const [area, setArea] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!capacityLabel.trim()) {
      Alert.alert('Hata', 'Kapasite etiketi gerekli (örn. 2+1).');
      return;
    }
    setLoading(true);
    try {
      const id = await createBookableShowcaseRoom({
        capacityLabel,
        displayTitle,
        pricePerNight: price.trim() ? Number(price.replace(',', '.')) : null,
        maxGuests: maxGuests.trim() ? Number(maxGuests) : null,
        description,
        bedType,
        viewType,
        areaSqm: area.trim() ? Number(area.replace(',', '.')) : null,
      });
      router.replace({ pathname: '/admin/booking/rooms/[id]', params: { id } });
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message || 'Oda eklenemedi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Yeni vitrin odası</Text>
        <Text style={styles.sub}>
          İç oda numarası otomatik üretilir. Misafire sadece kapasite (2+1, 3 kişilik…) görünür.
        </Text>

        <Text style={styles.label}>Kapasite *</Text>
        <TextInput style={styles.input} value={capacityLabel} onChangeText={setCapacityLabel} placeholder="2+1" />
        <View style={styles.chips}>
          {CAPACITY_PRESETS.map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.chip, capacityLabel === p && styles.chipOn]}
              onPress={() => setCapacityLabel(p)}
            >
              <Text style={[styles.chipText, capacityLabel === p && styles.chipTextOn]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Vitrin başlığı</Text>
        <TextInput style={styles.input} value={displayTitle} onChangeText={setDisplayTitle} placeholder="Göl Suite" />

        <Text style={styles.label}>Gecelik fiyat</Text>
        <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="4500" />

        <Text style={styles.label}>Maks. kişi</Text>
        <TextInput style={styles.input} value={maxGuests} onChangeText={setMaxGuests} keyboardType="number-pad" />

        <Text style={styles.label}>Açıklama</Text>
        <TextInput style={[styles.input, styles.area]} value={description} onChangeText={setDescription} multiline />

        <Text style={styles.label}>Yatak</Text>
        <TextInput style={styles.input} value={bedType} onChangeText={setBedType} />

        <Text style={styles.label}>Manzara</Text>
        <TextInput style={styles.input} value={viewType} onChangeText={setViewType} />

        <Text style={styles.label}>m²</Text>
        <TextInput style={styles.input} value={area} onChangeText={setArea} keyboardType="decimal-pad" />

        <TouchableOpacity style={styles.btn} onPress={() => void submit()} disabled={loading} activeOpacity={0.88}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Oluştur ve medya ekle</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: adminTheme.colors.background },
  content: { padding: 20, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: '900', color: adminTheme.colors.text },
  sub: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textMuted, marginBottom: 16, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textMuted, marginTop: 10, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    backgroundColor: '#fff',
    fontWeight: '600',
    color: adminTheme.colors.text,
  },
  area: { minHeight: 88, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  chipOn: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  chipText: { fontWeight: '700', color: adminTheme.colors.text, fontSize: 13 },
  chipTextOn: { color: '#fff' },
  btn: {
    marginTop: 22,
    backgroundColor: '#0f172a',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '800' },
});
