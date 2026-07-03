import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import {
  completeSmartOpsTask,
  fetchSmartOpsTaskDetail,
  SMART_OPS_STATUS_LABELS,
  type SmartOpsChecklistItem,
} from '@/lib/smartOps';
import { uploadSmartOpsTaskPhoto } from '@/lib/smartOpsPhoto';
import { useCachedFocusLoad } from '@/hooks/useCachedFocusLoad';

type SmartOpsDetailCache = {
  title: string;
  body: string;
  status: string;
  requirePhoto: string;
  checklist: SmartOpsChecklistItem[];
  existingPhoto: string | null;
  prefilledNote: string;
};

export default function StaffSmartOpsTaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState('');
  const [requirePhoto, setRequirePhoto] = useState('optional');
  const [checklist, setChecklist] = useState<SmartOpsChecklistItem[]>([]);
  const [note, setNote] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [existingPhoto, setExistingPhoto] = useState<string | null>(null);

  const fetchData = useCallback(async (): Promise<SmartOpsDetailCache | null> => {
    if (!id) return null;
    try {
      const { task, checklist: items } = await fetchSmartOpsTaskDetail(id);
      if (!task) {
        Alert.alert('Hata', 'Görev bulunamadı');
        router.back();
        return null;
      }
      return {
        title: task.title,
        body: task.body,
        status: task.status,
        requirePhoto: task.require_photo,
        checklist: items,
        existingPhoto: task.photo_url,
        prefilledNote: ['completed', 'partial', 'issue_reported'].includes(task.status)
          ? (task.note ?? task.issue_text ?? '')
          : '',
      };
    } catch (e) {
      Alert.alert('Hata', (e as Error).message);
      return null;
    }
  }, [id, router]);

  const { data: cached, reload, showContent } = useCachedFocusLoad({
    cacheKey: id ? `smart-ops-detail:${id}` : 'smart-ops-detail:none',
    enabled: !!id,
    fetchData,
  });

  useEffect(() => {
    if (!cached) return;
    setTitle(cached.title);
    setBody(cached.body);
    setStatus(cached.status);
    setRequirePhoto(cached.requirePhoto);
    setChecklist(cached.checklist);
    setExistingPhoto(cached.existingPhoto);
    setNote(cached.prefilledNote);
  }, [cached]);

  const load = reload;

  const toggleCheck = (itemId: string, checked: boolean) => {
    setChecklist((prev) => prev.map((c) => (c.id === itemId ? { ...c, checked } : c)));
  };

  const pickPhoto = async () => {
    const ok = await ensureCameraPermission({
      title: 'Kamera',
      message: 'Görev teyidi için fotoğraf çekin.',
      settingsMessage: 'Ayarlardan kamera izni verin.',
    });
    if (!ok) return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const submit = async (completionType: 'completed' | 'partial' | 'issue_reported') => {
    if (!id || !staff?.id || !staff.organization_id) return;
    if (completionType === 'completed' && requirePhoto === 'required' && !photoUri && !existingPhoto) {
      Alert.alert('Fotoğraf gerekli', 'Bu görev için fotoğraf yüklemeniz zorunlu.');
      return;
    }
    const requiredUnchecked = checklist.filter((c) => c.is_required && !c.checked);
    if (completionType === 'completed' && requiredUnchecked.length > 0) {
      Alert.alert('Checklist', 'Zorunlu maddelerin tamamını işaretleyin veya “Eksik” seçin.');
      return;
    }

    setSaving(true);
    try {
      let photoUrl = existingPhoto;
      if (photoUri) {
        photoUrl = await uploadSmartOpsTaskPhoto({
          organizationId: staff.organization_id,
          staffId: staff.id,
          taskId: id,
          uri: photoUri,
        });
      }
      const res = await completeSmartOpsTask({
        taskId: id,
        completionType,
        note: note.trim() || undefined,
        photoUrl: photoUrl ?? undefined,
        checklistUpdates: checklist.map((c) => ({ id: c.id, checked: c.checked, note: c.note ?? undefined })),
      });
      if (res.error) {
        Alert.alert('Hata', res.error);
      } else {
        Alert.alert(
          'Kaydedildi',
          res.points != null ? `Puan: ${res.points > 0 ? '+' : ''}${res.points}` : 'Görev kaydedildi.',
          [{ text: 'Tamam', onPress: () => router.replace('/staff/operations') }]
        );
      }
    } catch (e) {
      Alert.alert('Hata', (e as Error).message);
    }
    setSaving(false);
  };

  if (!showContent && !title) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const readonly = ['completed', 'partial', 'issue_reported', 'cancelled'].includes(status);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.status}>{SMART_OPS_STATUS_LABELS[status] ?? status}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}

      {checklist.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Checklist</Text>
          {checklist.map((c) => (
            <View key={c.id} style={styles.checkRow}>
              <Switch value={c.checked} onValueChange={(v) => toggleCheck(c.id, v)} disabled={readonly || saving} />
              <Text style={styles.checkLabel}>
                {c.label}
                {c.is_required ? ' *' : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {!readonly ? (
        <>
          <Text style={styles.sectionTitle}>Not</Text>
          <TextInput
            style={styles.input}
            value={note}
            onChangeText={setNote}
            placeholder="İsteğe bağlı açıklama"
            multiline
          />

          <Text style={styles.sectionTitle}>Fotoğraf {requirePhoto === 'required' ? '(zorunlu)' : ''}</Text>
          {existingPhoto && !photoUri ? <CachedImage uri={existingPhoto} style={styles.preview} /> : null}
          {photoUri ? <CachedImage uri={photoUri} style={styles.preview} /> : null}
          <TouchableOpacity style={styles.photoBtn} onPress={pickPhoto} disabled={saving}>
            <Ionicons name="camera-outline" size={22} color={theme.colors.primary} />
            <Text style={styles.photoBtnText}>Fotoğraf çek</Text>
          </TouchableOpacity>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnDone]}
              onPress={() => submit('completed')}
              disabled={saving}
            >
              <Text style={styles.btnDoneText}>{saving ? '…' : 'Yapıldı'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPartial]}
              onPress={() => submit('partial')}
              disabled={saving}
            >
              <Text style={styles.btnPartialText}>Eksik</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnIssue]}
              onPress={() => submit('issue_reported')}
              disabled={saving}
            >
              <Text style={styles.btnIssueText}>Sorun var</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <Text style={styles.readonlyNote}>Bu görev kapatılmış.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: '#1a202c' },
  status: { fontSize: 13, color: '#718096', marginTop: 4, marginBottom: 12 },
  body: { fontSize: 15, color: '#4a5568', lineHeight: 22, marginBottom: 16 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#2d3748', marginBottom: 8, marginTop: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  checkLabel: { flex: 1, fontSize: 15, color: '#2d3748' },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 15,
  },
  preview: { width: '100%', height: 180, borderRadius: 12, marginBottom: 10, backgroundColor: '#edf2f7' },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#ebf8ff',
    alignSelf: 'flex-start',
  },
  photoBtnText: { fontWeight: '600', color: theme.colors.primary },
  actions: { marginTop: 24, gap: 10 },
  btn: { paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  btnDone: { backgroundColor: '#38a169' },
  btnDoneText: { color: '#fff', fontWeight: '800', fontSize: 17 },
  btnPartial: { backgroundColor: '#fefcbf', borderWidth: 1, borderColor: '#ecc94b' },
  btnPartialText: { color: '#744210', fontWeight: '700', fontSize: 16 },
  btnIssue: { backgroundColor: '#fff5f5', borderWidth: 1, borderColor: '#fc8181' },
  btnIssueText: { color: '#c53030', fontWeight: '700', fontSize: 16 },
  readonlyNote: { color: '#718096', marginTop: 16, fontSize: 14 },
});
