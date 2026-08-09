import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { CachedImage } from '@/components/CachedImage';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';

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
  const palette = usePersonelDesign();
  const { isNight } = usePremiumTheme();
  const hasMedia = mediaItems.length > 0 || !!imageUri;

  return (
    <View style={styles.section}>
      {!hasMedia ? (
        <View style={styles.emptyWrap}>
          <View
            style={[
              styles.dropZone,
              {
                borderColor: palette.cardBorder,
                backgroundColor: isNight ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.85)',
              },
            ]}
          >
            <LinearGradient
              colors={palette.gradientPrimary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.dropIconRing}
            >
              <Ionicons name="images-outline" size={22} color="#fff" />
            </LinearGradient>
            <Text style={[styles.dropTitle, { color: palette.text }]}>Fotoğraf veya video ekle</Text>
            <Text style={[styles.dropHint, { color: palette.muted }]}>
              Kameradan çek veya galeriden seç — en fazla 10 medya
            </Text>

            <View style={styles.pickRow}>
              <Pressable
                onPress={onCamera}
                disabled={uploading}
                style={({ pressed }) => [
                  styles.pickCard,
                  {
                    backgroundColor: isNight ? 'rgba(255,255,255,0.06)' : '#fff',
                    borderColor: palette.borderLight,
                    opacity: uploading ? 0.55 : pressed ? 0.92 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Kamera"
              >
                <LinearGradient
                  colors={['#F59E0B', '#D97706']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.pickIcon}
                >
                  <Ionicons name="camera" size={20} color="#fff" />
                </LinearGradient>
                <Text style={[styles.pickLabel, { color: palette.text }]}>Kamera</Text>
              </Pressable>

              <Pressable
                onPress={onGallery}
                disabled={uploading}
                style={({ pressed }) => [
                  styles.pickCard,
                  {
                    backgroundColor: isNight ? 'rgba(255,255,255,0.06)' : '#fff',
                    borderColor: palette.borderLight,
                    opacity: uploading ? 0.55 : pressed ? 0.92 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Galeri"
              >
                <LinearGradient
                  colors={palette.gradientPremium}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.pickIcon}
                >
                  <Ionicons name="images" size={20} color="#fff" />
                </LinearGradient>
                <Text style={[styles.pickLabel, { color: palette.text }]}>Galeri</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.toolbar}>
          <TouchableOpacity
            style={[styles.toolBtn, uploading && styles.toolBtnDisabled]}
            onPress={onCamera}
            disabled={uploading}
            activeOpacity={0.88}
            accessibilityLabel="Kamera"
          >
            <LinearGradient colors={['#F59E0B', '#D97706']} style={styles.toolBtnGrad}>
              <Ionicons name="camera" size={18} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolBtn, uploading && styles.toolBtnDisabled]}
            onPress={onGallery}
            disabled={uploading}
            activeOpacity={0.88}
            accessibilityLabel="Galeri"
          >
            <LinearGradient colors={palette.gradientPremium} style={styles.toolBtnGrad}>
              <Ionicons name="images" size={18} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
          <Text style={[styles.toolbarHint, { color: palette.muted }]} numberOfLines={1}>
            Medyayı değiştirmek için dokun
          </Text>
        </View>
      )}

      {mediaItems.length > 0 ? (
        <View style={styles.previewShell} collapsable={false}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.multiPreviewRow}>
            {mediaItems.map((m, idx) => (
              <View
                key={`${m.uri}-${idx}`}
                style={[styles.multiPreviewCard, { borderColor: palette.cardBorder }]}
                collapsable={false}
              >
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
                {m.type === 'video' ? (
                  <View style={styles.videoChip}>
                    <Ionicons name="play" size={10} color="#fff" />
                  </View>
                ) : null}
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={[styles.clearAllBtn, { backgroundColor: isNight ? 'rgba(255,255,255,0.1)' : '#0F172A' }]}
            onPress={onRemoveMedia}
            disabled={uploading}
            activeOpacity={0.85}
          >
            <Ionicons name="trash-outline" size={14} color="#fff" />
            <Text style={styles.clearAllText}>Tümünü kaldır ({mediaItems.length})</Text>
          </TouchableOpacity>
        </View>
      ) : imageUri ? (
        <View style={styles.previewShell} collapsable={false}>
          <View
            style={[
              styles.previewCard,
              {
                borderColor: palette.cardBorder,
                ...(Platform.OS === 'ios' ? palette.shadowCard : { elevation: 4 }),
              },
            ]}
            collapsable={false}
          >
            {mediaType === 'image' ? (
              <CachedImage key={imageUri} uri={imageUri} style={styles.previewImage} contentFit="cover" />
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
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.55)']}
              style={styles.previewFade}
              pointerEvents="none"
            />
            <View style={styles.typeBadge}>
              <Ionicons
                name={mediaType === 'video' ? 'videocam' : 'image'}
                size={13}
                color="#fff"
                style={styles.typeBadgeIcon}
              />
              <Text style={styles.typeBadgeText}>
                {mediaType === 'video' ? 'Video' : 'Fotoğraf'}
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
                <Ionicons name="close" size={18} color="#fff" />
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  emptyWrap: {
    marginBottom: 4,
  },
  dropZone: {
    borderRadius: 22,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    paddingHorizontal: 16,
    paddingVertical: 20,
    alignItems: 'center',
  },
  dropIconRing: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  dropTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  dropHint: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 8,
  },
  pickRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    width: '100%',
  },
  pickCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pickIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  toolBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  toolBtnGrad: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolBtnDisabled: {
    opacity: 0.55,
  },
  toolbarHint: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  previewShell: {
    marginTop: 2,
  },
  multiPreviewRow: { gap: 10, paddingRight: 8, paddingBottom: 2 },
  multiPreviewCard: {
    width: 104,
    height: 136,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    borderWidth: StyleSheet.hairlineWidth,
  },
  multiPreviewMedia: { width: '100%', height: '100%' },
  videoChip: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearAllBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  clearAllText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  previewCard: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewImage: {
    width: '100%',
    aspectRatio: 4 / 5,
    maxHeight: 320,
    backgroundColor: '#1e293b',
  },
  previewVideo: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 320,
    backgroundColor: '#000',
  },
  previewFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 72,
  },
  typeBadge: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  typeBadgeIcon: {
    marginRight: 5,
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  removeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  removeBtnInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
});
