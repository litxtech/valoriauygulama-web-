import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { MAX_COMPLETION_PROOF_PHOTOS } from '@/lib/staffAssignmentComplete';
import { copyAndroidContentUriToCacheForPreview } from '@/lib/uploadMedia';
import { useTranslation } from 'react-i18next';

type Props = {
  visible: boolean;
  taskTitle: string;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (payload: { note?: string; proofUris: string[] }) => void;
};

export function TaskCompletionSheet({ visible, taskTitle, saving, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) {
      setNote('');
      setPhotos([]);
    }
  }, [visible]);

  const reset = () => {
    setNote('');
    setPhotos([]);
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const addPhoto = async (uri: string) => {
    let resolved = uri;
    try {
      resolved = await copyAndroidContentUriToCacheForPreview(uri, 'image');
    } catch {
      /* orijinal */
    }
    setPhotos((prev) => (prev.length >= MAX_COMPLETION_PROOF_PHOTOS ? prev : [...prev, resolved]));
  };

  const pickCamera = async () => {
    if (photos.length >= MAX_COMPLETION_PROOF_PHOTOS) {
      Alert.alert(
        t('taskSheetPhotoLimitTitle'),
        t('taskSheetPhotoLimitBody', { count: MAX_COMPLETION_PROOF_PHOTOS })
      );
      return;
    }
    const ok = await ensureCameraPermission({
      title: t('taskSheetCameraPermTitle'),
      message: t('taskSheetCameraPermMsg'),
      settingsMessage: t('taskSheetCameraPermSettings'),
    });
    if (!ok) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]?.uri) await addPhoto(result.assets[0].uri);
  };

  const pickGallery = async () => {
    if (photos.length >= MAX_COMPLETION_PROOF_PHOTOS) {
      Alert.alert(
        t('taskSheetPhotoLimitTitle'),
        t('taskSheetPhotoLimitBody', { count: MAX_COMPLETION_PROOF_PHOTOS })
      );
      return;
    }
    const ok = await ensureMediaLibraryPermission({
      title: t('taskSheetGalleryPermTitle'),
      message: t('taskSheetGalleryPermMsg'),
      settingsMessage: t('taskSheetGalleryPermSettings'),
    });
    if (!ok) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: MAX_COMPLETION_PROOF_PHOTOS - photos.length,
    });
    if (result.canceled || !result.assets?.length) return;
    for (const asset of result.assets) {
      if (photos.length >= MAX_COMPLETION_PROOF_PHOTOS) break;
      if (asset.uri) await addPhoto(asset.uri);
    }
  };

  const handleSubmit = () => {
    onSubmit({ note: note.trim() || undefined, proofUris: photos });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('taskSheetTitle')}</Text>
          <TouchableOpacity onPress={close} hitSlop={12} disabled={saving}>
            <Ionicons name="close" size={26} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.taskName} numberOfLines={3}>
            {taskTitle}
          </Text>
          <Text style={styles.hint}>{t('taskSheetHint')}</Text>

          <Text style={styles.label}>{t('taskSheetProofLabel')}</Text>
          <View style={styles.photoActions}>
            <TouchableOpacity style={styles.photoBtn} onPress={pickCamera} disabled={saving}>
              <Ionicons name="camera-outline" size={22} color={theme.colors.primary} />
              <Text style={styles.photoBtnText}>{t('taskSheetCapture')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoBtn} onPress={pickGallery} disabled={saving}>
              <Ionicons name="images-outline" size={22} color={theme.colors.primary} />
              <Text style={styles.photoBtnText}>{t('taskSheetGallery')}</Text>
            </TouchableOpacity>
          </View>

          {photos.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
              {photos.map((uri, idx) => (
                <View key={`${uri}-${idx}`} style={styles.thumbWrap}>
                  <CachedImage uri={uri} style={styles.thumb} contentFit="cover" />
                  <TouchableOpacity
                    style={styles.thumbRemove}
                    onPress={() => setPhotos((p) => p.filter((_, i) => i !== idx))}
                    disabled={saving}
                  >
                    <Ionicons name="close-circle" size={22} color={theme.colors.error} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.photoEmpty}>{t('taskSheetPhotoEmpty')}</Text>
          )}

          <Text style={styles.label}>{t('taskSheetNoteLabel')}</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t('taskSheetNotePlaceholder')}
            style={[styles.input, styles.textarea]}
            multiline
            maxLength={500}
            editable={!saving}
          />
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelBtn} onPress={close} disabled={saving}>
            <Text style={styles.cancelBtnText}>{t('cancelAction')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-done" size={20} color="#fff" />
                <Text style={styles.submitBtnText}>{t('staffTasks_completeBtn')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  scroll: { padding: theme.spacing.lg, paddingBottom: 24 },
  taskName: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  hint: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 20, marginBottom: 16 },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
    marginTop: 8,
  },
  photoActions: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  photoBtnText: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
  photoRow: { marginBottom: 8 },
  thumbWrap: { marginRight: 10, position: 'relative' },
  thumb: { width: 88, height: 88, borderRadius: theme.radius.md },
  thumbRemove: { position: 'absolute', top: -6, right: -6 },
  photoEmpty: { fontSize: 12, color: theme.colors.textMuted, fontStyle: 'italic', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  textarea: { minHeight: 88, textAlignVertical: 'top' },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: theme.colors.textSecondary },
  submitBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.success,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
  },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '800', flexShrink: 1 },
});
