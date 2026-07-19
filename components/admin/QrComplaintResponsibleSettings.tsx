import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import { CachedImage } from '@/components/CachedImage';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { useAuthStore } from '@/stores/authStore';
import {
  DEFAULT_QR_COMPLAINT_META,
  fetchQrComplaintPublicMeta,
  fetchResponsibleStaffPreview,
  listAdminStaffForResponsiblePick,
  saveQrComplaintPublicMeta,
  type QrComplaintPublicMeta,
} from '@/lib/qrComplaintPublicMeta';

export function QrComplaintResponsibleSettings() {
  const authStaff = useAuthStore((s) => s.staff);
  const [meta, setMeta] = useState<QrComplaintPublicMeta>(DEFAULT_QR_COMPLAINT_META);
  const [previewName, setPreviewName] = useState('Soner');
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<{ id: string; full_name: string; profile_image: string | null }[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const refreshPreview = useCallback(async (m: QrComplaintPublicMeta) => {
    const prev = await fetchResponsibleStaffPreview(m.staff_id);
    setPreviewName(m.name_override?.trim() || prev?.full_name || 'Soner');
    setPreviewPhoto(m.photo_override || prev?.profile_image || null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [m, list] = await Promise.all([
      fetchQrComplaintPublicMeta(),
      listAdminStaffForResponsiblePick(),
    ]);
    setMeta(m);
    setStaffList(list);
    await refreshPreview(m);
    setLoading(false);
  }, [refreshPreview]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = (partial: Partial<QrComplaintPublicMeta>) => {
    setMeta((prev) => {
      const next = { ...prev, ...partial };
      void refreshPreview(next);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    const res = await saveQrComplaintPublicMeta(meta);
    setSaving(false);
    if (res.error) Alert.alert('Hata', res.error);
    else Alert.alert('Kaydedildi', 'QR şikayet sayfasındaki sorumlu kartı güncellendi.');
  };

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('İzin', 'Galeri izni gerekli.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    if (!authStaff?.id) {
      Alert.alert('Hata', 'Oturum bulunamadı.');
      return;
    }
    setUploadingPhoto(true);
    try {
      const uploaded = await uploadUriToPublicBucket({
        bucketId: 'profiles',
        uri: result.assets[0].uri,
        kind: 'image',
        subfolder: `qr-complaint-responsible/${authStaff.id}`,
      });
      if (!uploaded?.publicUrl) throw new Error('Yükleme başarısız');
      patch({ photo_override: uploaded.publicUrl });
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Fotoğraf yüklenemedi');
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={adminTheme.colors.accent} />
      </View>
    );
  }

  const selected = staffList.find((s) => s.id === meta.staff_id);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Sorumlu profili (QR sayfası)</Text>
      <Text style={styles.hint}>
        Misafir formunda görünen kart: Valoria Hotel & Bavulsuite sorumlusu. Varsayılan admin profili
        (Soner); buradan fotoğraf ve notları düzenleyebilirsiniz.
      </Text>

      <View style={styles.previewRow}>
        {previewPhoto ? (
          <CachedImage uri={previewPhoto} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={styles.avatarPh}>
            <Text style={styles.avatarLetter}>{previewName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.previewTitle}>{meta.title}</Text>
          <Text style={styles.previewName}>{previewName}</Text>
          <Text style={styles.previewBrands}>{meta.brands}</Text>
        </View>
      </View>

      <Text style={styles.label}>Personel profili</Text>
      <TouchableOpacity style={styles.pickBtn} onPress={() => setPickerOpen(true)} activeOpacity={0.85}>
        <Ionicons name="person-outline" size={18} color={adminTheme.colors.accent} />
        <Text style={styles.pickBtnText}>{selected?.full_name || previewName || 'Personel seç'}</Text>
        <Ionicons name="chevron-down" size={16} color={adminTheme.colors.textMuted} />
      </TouchableOpacity>

      <Text style={styles.label}>Görünen ad (isteğe bağlı override)</Text>
      <TextInput
        style={styles.input}
        value={meta.name_override ?? ''}
        onChangeText={(v) => patch({ name_override: v.trim() ? v : null })}
        placeholder="Boş bırakırsanız personel adı kullanılır"
        placeholderTextColor={adminTheme.colors.textMuted}
      />

      <Text style={styles.label}>Unvan</Text>
      <TextInput
        style={styles.input}
        value={meta.title}
        onChangeText={(v) => patch({ title: v })}
        placeholder="Valoria Hotel & Bavulsuite Sorumlusu"
        placeholderTextColor={adminTheme.colors.textMuted}
      />

      <Text style={styles.label}>Markalar</Text>
      <TextInput
        style={styles.input}
        value={meta.brands}
        onChangeText={(v) => patch({ brands: v })}
        placeholder="Valoria Hotel · Bavulsuite"
        placeholderTextColor={adminTheme.colors.textMuted}
      />

      <Text style={styles.label}>Not (misafire görünür)</Text>
      <TextInput
        style={[styles.input, styles.noteInput]}
        value={meta.note}
        onChangeText={(v) => patch({ note: v })}
        multiline
        placeholder="Anlık şikayet değerlendirilir…"
        placeholderTextColor={adminTheme.colors.textMuted}
      />

      <View style={styles.photoRow}>
        <TouchableOpacity style={styles.photoBtn} onPress={pickPhoto} disabled={uploadingPhoto}>
          {uploadingPhoto ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="camera-outline" size={18} color="#fff" />
              <Text style={styles.photoBtnText}>Profil fotoğrafı yükle</Text>
            </>
          )}
        </TouchableOpacity>
        {meta.photo_override ? (
          <TouchableOpacity onPress={() => patch({ photo_override: null })}>
            <Text style={styles.clearPhoto}>Fotoğrafı kaldır (personel fotoğraflarına dön)</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving} activeOpacity={0.88}>
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveBtnText}>Sorumlu kartını kaydet</Text>
        )}
      </TouchableOpacity>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={() => setPickerOpen(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Sorumlu personel</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              <TouchableOpacity
                style={styles.modalItem}
                onPress={() => {
                  patch({ staff_id: null });
                  setPickerOpen(false);
                }}
              >
                <Text style={styles.modalItemText}>Varsayılan (Soner / sole admin)</Text>
              </TouchableOpacity>
              {staffList.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={styles.modalItem}
                  onPress={() => {
                    patch({ staff_id: s.id });
                    setPickerOpen(false);
                  }}
                >
                  {s.profile_image ? (
                    <CachedImage uri={s.profile_image} style={styles.modalAvatar} contentFit="cover" />
                  ) : (
                    <View style={[styles.modalAvatar, styles.avatarPh]}>
                      <Text style={styles.avatarLetter}>{s.full_name.charAt(0)}</Text>
                    </View>
                  )}
                  <Text style={styles.modalItemText}>{s.full_name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  title: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text },
  hint: { fontSize: 12, color: adminTheme.colors.textMuted, lineHeight: 18, marginTop: 6, marginBottom: 12 },
  previewRow: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarPh: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { fontSize: 20, fontWeight: '700', color: adminTheme.colors.accent },
  previewTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: adminTheme.colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  previewName: { fontSize: 18, fontWeight: '800', color: adminTheme.colors.text, marginTop: 2 },
  previewBrands: { fontSize: 12, color: adminTheme.colors.textSecondary, marginTop: 2 },
  label: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textSecondary, marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: adminTheme.colors.text,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  noteInput: { minHeight: 72, textAlignVertical: 'top' },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  pickBtnText: { flex: 1, fontSize: 14, fontWeight: '600', color: adminTheme.colors.text },
  photoRow: { marginTop: 12, gap: 8 },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: adminTheme.colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
  },
  photoBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  clearPhoto: { fontSize: 12, color: adminTheme.colors.error, textAlign: 'center' },
  saveBtn: {
    marginTop: 14,
    backgroundColor: adminTheme.colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    maxHeight: '80%',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', marginBottom: 10, color: adminTheme.colors.text },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.border,
  },
  modalItemText: { flex: 1, fontSize: 14, fontWeight: '600', color: adminTheme.colors.text },
  modalAvatar: { width: 36, height: 36, borderRadius: 18 },
});
