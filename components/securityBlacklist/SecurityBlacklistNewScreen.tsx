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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { CachedImage } from '@/components/CachedImage';
import { useAuthStore } from '@/stores/authStore';
import { createSecurityBlacklistEntry } from '@/lib/securityBlacklist';
import { SECURITY_BLACKLIST_MEDIA_BUCKET } from '@/lib/securityBlacklistMedia';
import { BlacklistScrollTopBar } from '@/components/securityBlacklist/BlacklistScrollTopBar';
import { blacklistTheme } from '@/lib/securityBlacklistTheme';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';

export function SecurityBlacklistNewScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [hotelNote, setHotelNote] = useState('');
  const [familyNote, setFamilyNote] = useState('');
  const [nationality, setNationality] = useState('');
  const [idDocumentRef, setIdDocumentRef] = useState('');
  const [incidentDate, setIncidentDate] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pickPhoto = async (fromCamera: boolean) => {
    if (fromCamera) {
      const ok = await ensureCameraPermission({
        title: 'Kamera',
        message: 'Fotoğraf için kamera gerekli.',
        settingsMessage: 'Ayarlardan kamera iznini açın.',
      });
      if (!ok) return;
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      if (!r.canceled && r.assets[0]?.uri) setPhotoUri(r.assets[0].uri);
      return;
    }
    const ok = await ensureMediaLibraryPermission({
      title: 'Galeri',
      message: 'Fotoğraf seçmek için galeri erişimi gerekli.',
      settingsMessage: 'Ayarlardan galeri iznini açın.',
    });
    if (!ok) return;
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!r.canceled && r.assets[0]?.uri) setPhotoUri(r.assets[0].uri);
  };

  const submit = async () => {
    if (!staff?.organization_id || !staff.id) {
      Alert.alert('Oturum', 'Personel kaydı gerekli.');
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Form', 'Ad ve soyad zorunludur.');
      return;
    }
    if (!incidentDescription.trim()) {
      Alert.alert('Form', 'Ne yaptığı / olay açıklaması zorunludur.');
      return;
    }

    setSaving(true);
    try {
      let photoUrl: string | null = null;
      let photoStoragePath: string | null = null;
      if (photoUri) {
        const uploaded = await uploadUriToPublicBucket({
          bucketId: SECURITY_BLACKLIST_MEDIA_BUCKET,
          uri: photoUri,
          kind: 'image',
          subfolder: staff.organization_id,
        });
        photoUrl = uploaded.publicUrl;
        photoStoragePath = uploaded.path;
      }

      const { data, error } = await createSecurityBlacklistEntry(staff.organization_id, staff.id, {
        firstName,
        lastName,
        incidentDescription,
        additionalNotes: additionalNotes || null,
        hotelNote: hotelNote || null,
        familyNote: familyNote || null,
        nationality: nationality || null,
        idDocumentRef: idDocumentRef || null,
        incidentDate: incidentDate.trim() || null,
        photoUrl,
        photoStoragePath,
      });

      if (error || !data) throw new Error(error ?? 'Kayıt oluşturulamadı');

      Alert.alert('Kaydedildi', `${data.reference_code} kaydı oluşturuldu. Tüm personele bildirim gönderildi.`, [
        { text: 'Tamam', onPress: () => router.replace(`/admin/blacklist/${data.id}` as never) },
      ]);
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Kayıt oluşturulamadı');
    }
    setSaving(false);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={['#2A1B1B', '#1A2332']} style={styles.hero}>
          <BlacklistScrollTopBar fallback="/admin/blacklist" />
          <Ionicons name="person-add-outline" size={28} color="#FCA5A5" />
          <Text style={styles.heroTitle}>Yeni kara liste kaydı</Text>
          <Text style={styles.heroSub}>Kayıt sonrası otel personeline anında bildirim gider.</Text>
        </LinearGradient>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fotoğraf</Text>
          <View style={styles.photoRow}>
            <TouchableOpacity style={styles.photoBox} onPress={() => pickPhoto(false)} activeOpacity={0.85}>
              {photoUri ? (
                <CachedImage uri={photoUri} style={styles.photo} contentFit="cover" />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="person-outline" size={36} color={blacklistTheme.textMuted} />
                  <Text style={styles.photoHint}>Galeriden seç</Text>
                </View>
              )}
            </TouchableOpacity>
            <View style={styles.photoActions}>
              <TouchableOpacity style={styles.photoBtn} onPress={() => pickPhoto(true)}>
                <Ionicons name="camera-outline" size={18} color="#FCA5A5" />
                <Text style={styles.photoBtnText}>Kamera</Text>
              </TouchableOpacity>
              {photoUri ? (
                <TouchableOpacity style={styles.photoBtn} onPress={() => setPhotoUri(null)}>
                  <Ionicons name="trash-outline" size={18} color={blacklistTheme.textMuted} />
                  <Text style={[styles.photoBtnText, { color: blacklistTheme.textMuted }]}>Kaldır</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <Field label="Ad *" value={firstName} onChangeText={setFirstName} placeholder="Ad" />
          <Field label="Soyad *" value={lastName} onChangeText={setLastName} placeholder="Soyad" />
          <Field label="Uyruk" value={nationality} onChangeText={setNationality} placeholder="Örn. Türkiye" />
          <Field label="Kimlik / pasaport no" value={idDocumentRef} onChangeText={setIdDocumentRef} placeholder="Opsiyonel" />
          <Field
            label="Ne yaptı? *"
            value={incidentDescription}
            onChangeText={setIncidentDescription}
            placeholder="Olay açıklaması"
            multiline
          />
          <Field label="Olay tarihi (YYYY-AA-GG)" value={incidentDate} onChangeText={setIncidentDate} placeholder="2026-03-15" />
          <Text style={styles.sectionTitle}>Otel ve aile notları</Text>
          <Text style={styles.sectionHint}>Personele hangi bağlamda dikkat edileceğini yazın.</Text>
          <Field
            label="Otel notu"
            value={hotelNote}
            onChangeText={setHotelNote}
            placeholder="Otel / tesis güvenliği — resepsiyon, oda, ortak alan uyarısı"
            multiline
          />
          <Field
            label="Aile notu"
            value={familyNote}
            onChangeText={setFamilyNote}
            placeholder="Personel ailesi / yakın çevre — kimlerle temas edilmemeli"
            multiline
          />
          <Field
            label="Genel ek notlar"
            value={additionalNotes}
            onChangeText={setAdditionalNotes}
            placeholder="Oda no, tanık, polis tutanağı vb."
            multiline
          />

          <TouchableOpacity style={styles.saveBtn} onPress={submit} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="shield-checkmark" size={20} color="#fff" />
                <Text style={styles.saveBtnText}>Kara listeye ekle ve bildir</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.textArea]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={blacklistTheme.textMuted}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'auto'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: blacklistTheme.bg },
  content: { paddingBottom: 40 },
  hero: { padding: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, gap: 8 },
  heroTitle: { fontSize: 22, fontWeight: '900', color: '#fff' },
  heroSub: { fontSize: 13, color: '#CBD5E1', lineHeight: 19 },
  section: {
    margin: 16,
    marginTop: 14,
    padding: 16,
    borderRadius: 20,
    backgroundColor: blacklistTheme.surface,
    borderWidth: 1,
    borderColor: blacklistTheme.border,
    gap: 4,
  },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#FCA5A5', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 4 },
  sectionHint: { fontSize: 12, color: blacklistTheme.textMuted, marginBottom: 8, lineHeight: 17 },
  field: { marginTop: 8 },
  label: { fontSize: 13, fontWeight: '700', color: blacklistTheme.textMuted, marginBottom: 6 },
  input: {
    backgroundColor: blacklistTheme.surfaceElevated,
    borderWidth: 1,
    borderColor: blacklistTheme.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 15,
    color: blacklistTheme.text,
  },
  textArea: { minHeight: 96, paddingTop: 12 },
  photoRow: { flexDirection: 'row', gap: 14, alignItems: 'center', marginBottom: 8 },
  photoBox: {
    width: 104,
    height: 104,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: blacklistTheme.border,
    backgroundColor: blacklistTheme.surfaceElevated,
  },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  photoHint: { fontSize: 11, color: blacklistTheme.textMuted },
  photoActions: { gap: 8 },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: blacklistTheme.surfaceElevated,
    borderWidth: 1,
    borderColor: blacklistTheme.border,
  },
  photoBtnText: { fontSize: 13, fontWeight: '700', color: '#FCA5A5' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 15,
    borderRadius: 16,
    backgroundColor: blacklistTheme.accentDeep,
  },
  saveBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});
