import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { KITCHEN_PROOFS_BUCKET } from '@/lib/kitchenOps/constants';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';

type Props = {
  photos: string[];
  onChange: (urls: string[]) => void;
  subfolder?: string;
  label?: string;
  hint?: string;
  onPreview?: (uri: string) => void;
};

export function KitchenMultiPhotoPicker({
  photos,
  onChange,
  subfolder = 'handover',
  label = 'Fotoğraflar',
  hint = 'Her malzeme için istediğiniz kadar fotoğraf ekleyebilirsiniz.',
  onPreview,
}: Props) {
  const uploadOne = async (uri: string) => {
    const { publicUrl } = await uploadUriToPublicBucket({
      bucketId: KITCHEN_PROOFS_BUCKET,
      uri,
      subfolder,
    });
    onChange([...photos, publicUrl]);
  };

  const pick = async (fromCamera: boolean) => {
    const granted = fromCamera
      ? await ensureCameraPermission({
          title: 'Kamera',
          message: 'Fotoğraf çekmek için kamera izni gerekiyor.',
          settingsMessage: 'Ayarlardan kamera izni verin.',
        })
      : await ensureMediaLibraryPermission({
          title: 'Galeri',
          message: 'Fotoğraf seçmek için galeri izni gerekiyor.',
          settingsMessage: 'Ayarlardan galeri iznini açın.',
        });
    if (!granted) return;

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.65 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.65, allowsMultipleSelection: true });

    if (result.canceled) return;
    try {
      for (const asset of result.assets) {
        if (asset.uri) await uploadOne(asset.uri);
      }
    } catch (e) {
      Alert.alert('Hata', (e as Error).message);
    }
  };

  const choose = () => {
    Alert.alert('Fotoğraf ekle', undefined, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Kamera', onPress: () => pick(true) },
      { text: 'Galeri', onPress: () => pick(false) },
    ]);
  };

  const remove = (url: string) => onChange(photos.filter((p) => p !== url));

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {photos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
          {photos.map((uri) => (
            <View key={uri} style={styles.thumbWrap}>
              <TouchableOpacity activeOpacity={0.9} onPress={() => onPreview?.(uri)}>
                <CachedImage uri={uri} style={styles.thumb} contentFit="cover" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.remove} onPress={() => remove(uri)}>
                <Text style={styles.removeText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      ) : null}
      <TouchableOpacity style={styles.addBtn} onPress={choose} activeOpacity={0.85}>
        <Ionicons name="camera-outline" size={20} color="#0d9488" />
        <Text style={styles.addText}>Fotoğraf ekle</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  label: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },
  hint: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2, marginBottom: 6 },
  thumbRow: { gap: 8, paddingVertical: 6 },
  thumbWrap: { position: 'relative' },
  thumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: theme.colors.borderLight },
  remove: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderStyle: 'dashed',
    backgroundColor: '#f0fdfa',
  },
  addText: { fontSize: 13, fontWeight: '700', color: '#0f766e' },
});
