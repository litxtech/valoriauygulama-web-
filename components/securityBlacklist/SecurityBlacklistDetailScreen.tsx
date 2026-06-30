import { useCallback, useState, type ComponentProps } from 'react';
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
import { useFocusEffect, useLocalSearchParams, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { CachedImage } from '@/components/CachedImage';
import { useAuthStore } from '@/stores/authStore';
import { canAccessSecurityBlacklist } from '@/lib/staffPermissions';
import {
  getSecurityBlacklistEntry,
  removeSecurityBlacklistEntry,
  restoreSecurityBlacklistEntry,
  securityBlacklistFullName,
  updateSecurityBlacklistEntry,
  type SecurityBlacklistRow,
} from '@/lib/securityBlacklist';
import { BlacklistScrollTopBar } from '@/components/securityBlacklist/BlacklistScrollTopBar';
import { SECURITY_BLACKLIST_MEDIA_BUCKET } from '@/lib/securityBlacklistMedia';
import { blacklistTheme } from '@/lib/securityBlacklistTheme';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('tr-TR');
  } catch {
    return iso;
  }
}

export function SecurityBlacklistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin') ?? false;
  const listFallback = isAdminRoute ? '/admin/blacklist' : '/staff/blacklist';
  const staff = useAuthStore((s) => s.staff);
  const canManage = canAccessSecurityBlacklist(staff);
  const [row, setRow] = useState<SecurityBlacklistRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
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
  const [removalNote, setRemovalNote] = useState('');

  const hydrateForm = (data: SecurityBlacklistRow) => {
    setFirstName(data.first_name);
    setLastName(data.last_name);
    setIncidentDescription(data.incident_description);
    setAdditionalNotes(data.additional_notes ?? '');
    setHotelNote(data.hotel_note ?? '');
    setFamilyNote(data.family_note ?? '');
    setNationality(data.nationality ?? '');
    setIdDocumentRef(data.id_document_ref ?? '');
    setIncidentDate(data.incident_date ?? '');
    setPhotoUri(null);
  };

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error } = await getSecurityBlacklistEntry(id);
    if (error || !data) {
      Alert.alert('Hata', error ?? 'Kayıt bulunamadı');
      setLoading(false);
      return;
    }
    setRow(data);
    hydrateForm(data);
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

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

  const save = async () => {
    if (!id || !row || !canManage) return;
    if (!firstName.trim() || !lastName.trim() || !incidentDescription.trim()) {
      Alert.alert('Form', 'Ad, soyad ve olay açıklaması zorunludur.');
      return;
    }
    setSaving(true);
    try {
      const patch: Parameters<typeof updateSecurityBlacklistEntry>[1] = {
        firstName,
        lastName,
        incidentDescription,
        additionalNotes: additionalNotes || null,
        hotelNote: hotelNote || null,
        familyNote: familyNote || null,
        nationality: nationality || null,
        idDocumentRef: idDocumentRef || null,
        incidentDate: incidentDate.trim() || null,
      };
      if (photoUri && staff?.organization_id) {
        const uploaded = await uploadUriToPublicBucket({
          bucketId: SECURITY_BLACKLIST_MEDIA_BUCKET,
          uri: photoUri,
          kind: 'image',
          subfolder: staff.organization_id,
        });
        patch.photoUrl = uploaded.publicUrl;
        patch.photoStoragePath = uploaded.path;
      }
      const { data, error } = await updateSecurityBlacklistEntry(id, patch);
      if (error || !data) throw new Error(error ?? 'Güncellenemedi');
      setRow(data);
      hydrateForm(data);
      setEditing(false);
      Alert.alert('Kaydedildi', 'Kara liste kaydı güncellendi.');
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Güncellenemedi');
    }
    setSaving(false);
  };

  const onRemove = () => {
    if (!id || !staff?.id || !row || row.is_removed || !canManage) return;
    Alert.alert('Listeden kaldır', 'Bu kişi kara listeden kaldırılacak. Devam edilsin mi?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Kaldır',
        style: 'destructive',
        onPress: async () => {
          const { error } = await removeSecurityBlacklistEntry(id, staff.id, removalNote);
          if (error) Alert.alert('Hata', error);
          else await load();
        },
      },
    ]);
  };

  const onRestore = () => {
    if (!id || !row || !row.is_removed || !canManage) return;
    Alert.alert('Geri al', 'Kayıt tekrar aktif kara listeye alınsın mı?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Geri al',
        onPress: async () => {
          const { error } = await restoreSecurityBlacklistEntry(id);
          if (error) Alert.alert('Hata', error);
          else await load();
        },
      },
    ]);
  };

  if (loading || !row) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={blacklistTheme.accent} size="large" />
      </View>
    );
  }

  const displayPhoto = photoUri ?? row.photo_url;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={['#2A1B1B', '#1A2332']} style={styles.hero}>
          <BlacklistScrollTopBar fallback={listFallback} />
          <TouchableOpacity
            style={styles.avatarLarge}
            onPress={editing && canManage ? () => pickPhoto(false) : undefined}
            disabled={!editing || !canManage}
            activeOpacity={editing ? 0.85 : 1}
          >
            {displayPhoto ? (
              <CachedImage uri={displayPhoto} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <LinearGradient colors={['#7F1D1D', '#EF4444']} style={styles.avatarPh}>
                <Text style={styles.avatarLetter}>{row.first_name.charAt(0).toUpperCase()}</Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
          <Text style={styles.refCode}>{row.reference_code}</Text>
          <Text style={styles.fullName}>{securityBlacklistFullName(row)}</Text>
          {row.is_removed ? (
            <View style={styles.archivedPill}>
              <Text style={styles.archivedPillText}>Arşiv kaydı</Text>
            </View>
          ) : (
            <View style={styles.activePill}>
              <Ionicons name="warning" size={12} color="#FCA5A5" />
              <Text style={styles.activePillText}>Güvenlik uyarısı aktif</Text>
            </View>
          )}
          {canManage && !row.is_removed ? (
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => {
                if (editing) {
                  hydrateForm(row);
                  setEditing(false);
                } else {
                  setEditing(true);
                }
              }}
            >
              <Ionicons name={editing ? 'close' : 'create-outline'} size={18} color="#fff" />
              <Text style={styles.editBtnText}>{editing ? 'İptal' : 'Düzenle'}</Text>
            </TouchableOpacity>
          ) : null}
        </LinearGradient>

        {editing && canManage ? (
          <View style={styles.section}>
            <View style={styles.photoActions}>
              <TouchableOpacity style={styles.smallBtn} onPress={() => pickPhoto(true)}>
                <Text style={styles.smallBtnText}>Kamera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallBtn} onPress={() => pickPhoto(false)}>
                <Text style={styles.smallBtnText}>Galeri</Text>
              </TouchableOpacity>
            </View>
            <Field label="Ad" value={firstName} onChangeText={setFirstName} editing />
            <Field label="Soyad" value={lastName} onChangeText={setLastName} editing />
            <Field label="Uyruk" value={nationality} onChangeText={setNationality} editing />
            <Field label="Kimlik / pasaport" value={idDocumentRef} onChangeText={setIdDocumentRef} editing />
            <Field label="Ne yaptı?" value={incidentDescription} onChangeText={setIncidentDescription} editing multiline />
            <Field label="Olay tarihi" value={incidentDate} onChangeText={setIncidentDate} editing />
            <Field label="Otel notu" value={hotelNote} onChangeText={setHotelNote} editing multiline />
            <Field label="Aile notu" value={familyNote} onChangeText={setFamilyNote} editing multiline />
            <Field label="Genel ek notlar" value={additionalNotes} onChangeText={setAdditionalNotes} editing multiline />
            <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Kaydet</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.section}>
            <InfoRow icon="alert-circle-outline" label="Ne yaptı?" value={row.incident_description} highlight />
            <InfoRow icon="business-outline" label="Otel notu" value={row.hotel_note?.trim() || '—'} highlight={Boolean(row.hotel_note?.trim())} />
            <InfoRow icon="people-outline" label="Aile notu" value={row.family_note?.trim() || '—'} highlight={Boolean(row.family_note?.trim())} />
            <InfoRow icon="calendar-outline" label="Olay tarihi" value={row.incident_date ?? '—'} />
            <InfoRow icon="earth-outline" label="Uyruk" value={row.nationality ?? '—'} />
            <InfoRow icon="card-outline" label="Kimlik / pasaport" value={row.id_document_ref ?? '—'} />
            <InfoRow icon="document-text-outline" label="Genel ek notlar" value={row.additional_notes ?? '—'} />
            <InfoRow icon="person-outline" label="Ekleyen" value={row.added_by?.full_name ?? '—'} />
            <InfoRow icon="time-outline" label="Kayıt tarihi" value={formatDateTime(row.created_at)} />
            {row.is_removed ? (
              <>
                <InfoRow icon="archive-outline" label="Kaldırılma" value={formatDateTime(row.removed_at)} />
                <InfoRow icon="person-outline" label="Kaldıran" value={row.removed_by?.full_name ?? '—'} />
                <InfoRow icon="chatbox-outline" label="Kaldırma notu" value={row.removal_note ?? '—'} />
              </>
            ) : null}
          </View>
        )}

        {canManage && !row.is_removed && !editing ? (
          <View style={styles.removeBlock}>
            <Text style={styles.removeTitle}>Listeden kaldır</Text>
            <TextInput
              style={styles.input}
              value={removalNote}
              onChangeText={setRemovalNote}
              placeholder="Kaldırma gerekçesi (opsiyonel)"
              placeholderTextColor={blacklistTheme.textMuted}
            />
            <TouchableOpacity style={styles.removeBtn} onPress={onRemove}>
              <Ionicons name="ban-outline" size={18} color="#fff" />
              <Text style={styles.removeBtnText}>Kara listeden kaldır</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {canManage && row.is_removed && !editing ? (
          <TouchableOpacity style={styles.restoreBtn} onPress={onRestore}>
            <Ionicons name="refresh-outline" size={18} color="#FCA5A5" />
            <Text style={styles.restoreBtnText}>Tekrar aktif et</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  editing,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  editing?: boolean;
  multiline?: boolean;
}) {
  if (!editing) return <InfoRow label={label} value={value || '—'} />;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.textArea]}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'auto'}
        placeholderTextColor={blacklistTheme.textMuted}
      />
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  highlight,
}: {
  icon?: ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={[styles.infoRow, highlight && styles.infoRowHighlight]}>
      <View style={styles.infoLabelRow}>
        {icon ? <Ionicons name={icon} size={15} color={highlight ? '#FCA5A5' : blacklistTheme.textMuted} /> : null}
        <Text style={[styles.infoLabel, highlight && styles.infoLabelHighlight]}>{label}</Text>
      </View>
      <Text style={[styles.infoValue, highlight && styles.infoValueHighlight]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: blacklistTheme.bg },
  container: { flex: 1, backgroundColor: blacklistTheme.bg },
  content: { paddingBottom: 40 },
  hero: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 22,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  avatarLarge: { width: 108, height: 108, borderRadius: 32, overflow: 'hidden', marginBottom: 14 },
  avatarImg: { width: '100%', height: '100%' },
  avatarPh: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 40, fontWeight: '900', color: '#fff' },
  refCode: { fontSize: 12, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.8 },
  fullName: { fontSize: 26, fontWeight: '900', color: '#fff', marginTop: 6, textAlign: 'center' },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: blacklistTheme.accentSoft,
  },
  activePillText: { fontSize: 12, fontWeight: '800', color: '#FCA5A5' },
  archivedPill: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
  },
  archivedPillText: { fontSize: 12, fontWeight: '800', color: blacklistTheme.textMuted },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  editBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  section: {
    margin: 16,
    marginTop: 14,
    padding: 14,
    borderRadius: 20,
    backgroundColor: blacklistTheme.surface,
    borderWidth: 1,
    borderColor: blacklistTheme.border,
  },
  photoActions: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: blacklistTheme.surfaceElevated,
    borderWidth: 1,
    borderColor: blacklistTheme.border,
  },
  smallBtnText: { fontSize: 13, fontWeight: '700', color: '#FCA5A5' },
  field: { marginBottom: 10 },
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
  infoRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: blacklistTheme.border,
  },
  infoRowHighlight: {
    backgroundColor: blacklistTheme.accentSoft,
    marginHorizontal: -14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderBottomWidth: 0,
    marginBottom: 4,
  },
  infoLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  infoLabel: { fontSize: 12, fontWeight: '800', color: blacklistTheme.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  infoLabelHighlight: { color: '#FCA5A5' },
  infoValue: { fontSize: 15, color: blacklistTheme.text, lineHeight: 22 },
  infoValueHighlight: { fontSize: 16, fontWeight: '700' },
  saveBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: blacklistTheme.accentDeep,
    alignItems: 'center',
  },
  saveBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  removeBlock: {
    marginHorizontal: 16,
    marginTop: 4,
    padding: 14,
    borderRadius: 18,
    backgroundColor: blacklistTheme.surface,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    gap: 10,
  },
  removeTitle: { fontSize: 14, fontWeight: '800', color: '#FCA5A5' },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#475569',
  },
  removeBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  restoreBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: blacklistTheme.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.22)',
  },
  restoreBtnText: { fontSize: 15, fontWeight: '700', color: '#FCA5A5' },
});
