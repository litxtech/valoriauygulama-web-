import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { CachedImage } from '@/components/CachedImage';
import {
  COUNTERPARTY_TYPE_META,
  counterpartyInitials,
  resolveCounterpartyTypeMeta,
} from '@/lib/financeCounterpartyUi';
import type { FinanceCounterpartyType } from '@/lib/financeLedger';
import { invalidateCounterpartyBalanceCache } from '@/lib/financeCounterpartyBalances';
import {
  pickCounterpartyProfileImage,
  uploadCounterpartyProfileImage,
  clearCounterpartyProfileImage,
} from '@/lib/financeCounterpartyAvatar';

const TYPES = Object.keys(COUNTERPARTY_TYPE_META) as FinanceCounterpartyType[];

export default function CounterpartyEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [partyType, setPartyType] = useState<FinanceCounterpartyType>('other');
  const [customTypeLabel, setCustomTypeLabel] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('finance_counterparties')
        .select('id, organization_id, name, party_type, party_type_label, phone, notes, profile_image')
        .eq('id', id)
        .single();
      if (error || !data) {
        setLoading(false);
        Alert.alert('Hata', 'Kişi bulunamadı.');
        router.back();
        return;
      }
      const row = data as {
        organization_id: string;
        name: string;
        party_type: FinanceCounterpartyType;
        party_type_label: string | null;
        phone: string | null;
        notes: string | null;
      };
      setOrgId(row.organization_id);
      setName(row.name);
      setPhone(row.phone ?? '');
      setNotes(row.notes ?? '');
      setPartyType(row.party_type);
      setCustomTypeLabel(row.party_type_label ?? '');
      setProfileImage((row as { profile_image?: string | null }).profile_image ?? null);
      setLoading(false);
    })();
  }, [id, router]);

  const changePhoto = async () => {
    if (!id || !orgId) return;
    const uri = await pickCounterpartyProfileImage();
    if (!uri) return;
    setUploadingPhoto(true);
    const res = await uploadCounterpartyProfileImage(orgId, id, uri);
    setUploadingPhoto(false);
    if ('error' in res) Alert.alert('Hata', res.error);
    else setProfileImage(res.publicUrl);
  };

  const removePhoto = () => {
    if (!id) return;
    Alert.alert('Sil', 'Profil fotoğrafı kaldırılsın mı?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          setUploadingPhoto(true);
          const err = await clearCounterpartyProfileImage(id);
          setUploadingPhoto(false);
          if (err) Alert.alert('Hata', err);
          else setProfileImage(null);
        },
      },
    ]);
  };

  const save = async () => {
    if (!id || !name.trim()) {
      Alert.alert('Ad gerekli', 'Kişi veya firma adını yazın.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('finance_counterparties')
      .update({
        name: name.trim(),
        party_type: partyType,
        party_type_label: customTypeLabel.trim() || null,
        phone: phone.trim() || null,
        notes: notes.trim() || null,
      })
      .eq('id', id);
    setSaving(false);
    if (error) {
      Alert.alert('Kaydedilemedi', error.message);
      return;
    }
    if (orgId) invalidateCounterpartyBalanceCache(orgId);
    router.replace({
      pathname: '/admin/accounting/counterparties/[id]',
      params: { id },
    } as never);
  };

  const removePerson = () => {
    Alert.alert(
      'Kişiyi kaldır',
      'Liste dışı bırakılır; geçmiş ödeme kayıtları silinmez. Devam?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Kaldır',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('finance_counterparties')
              .update({ is_active: false })
              .eq('id', id);
            if (error) {
              Alert.alert('Hata', error.message);
              return;
            }
            if (orgId) invalidateCounterpartyBalanceCache(orgId);
            router.replace('/admin/accounting/counterparties' as never);
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  const meta = resolveCounterpartyTypeMeta(partyType, customTypeLabel);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.lead}>Kişi / firma bilgilerini güncelleyin.</Text>

      <View style={styles.photoRow}>
        <TouchableOpacity style={styles.photoBtn} onPress={changePhoto} disabled={uploadingPhoto}>
          {profileImage ? (
            <CachedImage uri={profileImage} style={styles.photoImg} contentFit="cover" />
          ) : (
            <View style={[styles.photoPh, { backgroundColor: meta.bg }]}>
              <Text style={[styles.photoLetter, { color: meta.color }]}>
                {counterpartyInitials(name || '?')}
              </Text>
            </View>
          )}
          <View style={styles.photoFab}>
            {uploadingPhoto ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="camera-outline" size={14} color="#fff" />
            )}
          </View>
        </TouchableOpacity>
        <View style={styles.photoActions}>
          <TouchableOpacity onPress={changePhoto} disabled={uploadingPhoto}>
            <Text style={styles.photoLink}>
              {profileImage ? 'Fotoğrafı değiştir' : 'Profil fotoğrafı ekle'}
            </Text>
          </TouchableOpacity>
          {profileImage ? (
            <TouchableOpacity onPress={removePhoto}>
              <Text style={styles.photoRemove}>Kaldır</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <Text style={styles.label}>Ad *</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ad" />

      <Text style={styles.label}>Tür</Text>
      <View style={styles.typeGrid}>
        {TYPES.map((t) => {
          const m = COUNTERPARTY_TYPE_META[t];
          const on = partyType === t;
          return (
            <TouchableOpacity
              key={t}
              style={[styles.typeCard, on && { borderColor: m.color, backgroundColor: m.bg }]}
              onPress={() => setPartyType(t)}
            >
              <Ionicons name={m.icon} size={20} color={m.color} />
              <Text style={[styles.typeLabel, on && { color: m.color }]}>{m.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Özel tür adı (isteğe bağlı)</Text>
      <TextInput
        style={styles.input}
        value={customTypeLabel}
        onChangeText={setCustomTypeLabel}
        placeholder="Örn. Komşu, Bahçıvan"
        placeholderTextColor={adminTheme.colors.textMuted}
      />

      <Text style={styles.label}>Telefon</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="05xx…"
      />

      <Text style={styles.label}>Not</Text>
      <TextInput
        style={[styles.input, styles.area]}
        value={notes}
        onChangeText={setNotes}
        multiline
        placeholder="Örn. Toprak Grup cari hesabı"
        placeholderTextColor={adminTheme.colors.textMuted}
      />

      <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Kaydet</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.delBtn} onPress={removePerson}>
        <Ionicons name="person-remove-outline" size={18} color="#dc2626" />
        <Text style={styles.delBtnText}>Kişiyi listeden kaldır</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  lead: { fontSize: 14, color: adminTheme.colors.textMuted, marginBottom: 16, lineHeight: 20 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  photoBtn: { position: 'relative' },
  photoImg: { width: 72, height: 72, borderRadius: 36 },
  photoPh: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoLetter: { fontSize: 24, fontWeight: '800' },
  photoFab: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#7c3aed',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: adminTheme.colors.surfaceSecondary,
  },
  photoActions: { flex: 1, gap: 6 },
  photoLink: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.primary },
  photoRemove: { fontSize: 13, color: '#dc2626', fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textMuted, marginBottom: 8 },
  input: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: adminTheme.colors.text,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginBottom: 16,
  },
  area: { minHeight: 80, textAlignVertical: 'top' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  typeCard: {
    width: '47%',
    padding: 10,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surface,
    alignItems: 'center',
  },
  typeLabel: { fontSize: 12, fontWeight: '700', marginTop: 6, color: adminTheme.colors.text },
  saveBtn: {
    backgroundColor: adminTheme.colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  delBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    padding: 14,
  },
  delBtnText: { color: '#dc2626', fontWeight: '600' },
});
