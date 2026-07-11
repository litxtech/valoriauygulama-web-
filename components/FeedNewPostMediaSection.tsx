import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';

type Props = {
  imageUri: string | null;
  mediaType: 'image' | 'video';
  mediaItems?: { uri: string; type: 'image' | 'video' }[];
  uploading: boolean;
  onCamera: () => void;
  onGallery: () => void;
  onRemoveMedia: () => void;
};

export function FeedNewPostMediaSection({
  imageUri,
  mediaType,
  mediaItems = [],
  uploading,
  onCamera,
  onGallery,
  onRemoveMedia,
}: Props) {
  return (
    <View style={styles.section}>
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnCamera, uploading && styles.actionBtnDisabled]}
          onPress={onCamera}
          disabled={uploading}
          activeOpacity={0.88}
          accessibilityLabel="Kamera"
        >
          <Ionicons name="camera" size={22} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnGallery, uploading && styles.actionBtnDisabled]}
          onPress={onGallery}
          disabled={uploading}
          activeOpacity={0.88}
          accessibilityLabel="Galeri"
        >
          <Ionicons name="images" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {mediaItems.length > 0 ? (
        <View style={styles.previewShell} collapsable={false}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.multiPreviewRow}>
            {mediaItems.map((m, idx) => (
              <View key={`${m.uri}-${idx}`} style={styles.multiPreviewCard} collapsable={false}>
                {m.type === 'video' ? (
                  <Video
                    key={m.uri}
                    source={{ uri: m.uri }}
                    style={styles.multiPreviewMedia}
                    resizeMode={ResizeMode.COVER}
                    shouldPlay={false}
                    isLooping={false}
                  />
                ) : (
                  <CachedImage key={m.uri} uri={m.uri} style={styles.multiPreviewMedia} contentFit="cover" />
                )}
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.clearAllBtn} onPress={onRemoveMedia} disabled={uploading} activeOpacity={0.85}>
            <Text style={styles.clearAllText}>Tümünü kaldır ({mediaItems.length})</Text>
          </TouchableOpacity>
        </View>
      ) : imageUri ? (
        <View style={styles.previewShell} collapsable={false}>
          <View style={styles.previewCard} collapsable={false}>
            {mediaType === 'image' ? (
              <CachedImage
                key={imageUri}
                uri={imageUri}
                style={styles.previewImage}
                contentFit="cover"
              />
            ) : (
              <Video
                key={imageUri}
                source={{ uri: imageUri }}
                style={styles.previewVideo}
                resizeMode={ResizeMode.COVER}
                useNativeControls
                isLooping
                shouldPlay={false}
              />
            )}
            <View style={styles.typeBadge}>
              <Ionicons
                name={mediaType === 'video' ? 'videocam' : 'image'}
                size={14}
                color="#fff"
                style={styles.typeBadgeIcon}
              />
              <Text style={styles.typeBadgeText}>
                {mediaType === 'video' ? 'Video önizleme' : 'Fotoğraf önizleme'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={onRemoveMedia}
              disabled={uploading}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Medyayı kaldır"
            >
              <View style={styles.removeBtnInner}>
                <Ionicons name="close" size={20} color="#fff" />
              </View>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 4,
  },
  previewShell: {
    marginTop: 16,
  },
  multiPreviewRow: { gap: 8, paddingRight: 14 },
  multiPreviewCard: {
    width: 96,
    height: 126,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
  },
  multiPreviewMedia: { width: '100%', height: '100%' },
  clearAllBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#111827',
  },
  clearAllText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  previewCard: {
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    ...(Platform.OS === 'ios' ? theme.shadows.md : { elevation: 4 }),
  },
  previewImage: {
    width: '100%',
    aspectRatio: 4 / 5,
    backgroundColor: '#1e293b',
  },
  previewVideo: {
    width: '100%',
    aspectRatio: 9 / 16,
    backgroundColor: '#000',
  },
  typeBadge: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
  },
  typeBadgeIcon: {
    marginRight: 6,
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  removeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  removeBtnInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
    marginBottom: 6,
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  actionBtnCamera: {
    backgroundColor: '#0284c7',
  },
  actionBtnGallery: {
    backgroundColor: '#7c3aed',
  },
  actionBtnDisabled: {
    opacity: 0.55,
  },
});
