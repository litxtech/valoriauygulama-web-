import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import { StaffAnnouncementActionPanel } from '@/components/staff/StaffAnnouncementActionPanel';
import { parseAnnouncementMediaPayload, type AnnouncementMediaPayload } from '@/lib/announcementMedia';

type Props = {
  media: AnnouncementMediaPayload | null | undefined;
  legacyImageUrl?: string | null;
  legacyActionUrl?: string | null;
  legacyActionText?: string | null;
  onOpenScreen?: (href: string) => void;
};

export function AnnouncementRichViewer({
  media: mediaProp,
  legacyImageUrl,
  legacyActionUrl,
  legacyActionText,
  onOpenScreen,
}: Props) {
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const media = useMemo(() => {
    const parsed = parseAnnouncementMediaPayload(mediaProp);
    if (parsed) return parsed;
    const images = legacyImageUrl?.trim() ? [legacyImageUrl.trim()] : [];
    const actionUrl = legacyActionUrl?.trim() || '';
    const isExternal = actionUrl.startsWith('http://') || actionUrl.startsWith('https://');
    return parseAnnouncementMediaPayload({
      images: images.length ? images : undefined,
      websiteUrl: isExternal ? actionUrl : undefined,
      websiteLabel: isExternal ? legacyActionText ?? undefined : undefined,
      openScreen: !isExternal && actionUrl ? actionUrl : undefined,
      actionLabel: !isExternal ? legacyActionText ?? undefined : undefined,
    });
  }, [mediaProp, legacyImageUrl, legacyActionUrl, legacyActionText]);

  if (!media) return null;

  const openWebsite = () => {
    const url = media.websiteUrl?.trim();
    if (!url) return;
    if (Platform.OS === 'web') window.open(url, '_blank');
    else void Linking.openURL(url);
  };

  return (
    <View style={styles.wrap}>
      {media.images?.length ? (
        <View style={styles.imagesBlock}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageRow}>
            {media.images.map((uri) => (
              <TouchableOpacity key={uri} activeOpacity={0.9} onPress={() => setPreviewUri(uri)}>
                <CachedImage uri={uri} style={styles.imageTile} contentFit="cover" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {media.videoUrl ? (
        <StaffAnnouncementActionPanel
          videoUrl={media.videoUrl}
          videoTitle={media.videoTitle}
          openScreen={media.openScreen}
          actionLabel={media.actionLabel}
          onOpenScreen={onOpenScreen}
          compact
        />
      ) : null}

      {media.websiteUrl ? (
        <TouchableOpacity style={styles.websiteBtn} onPress={openWebsite} activeOpacity={0.88}>
          <Ionicons name="globe-outline" size={18} color="#0d9488" />
          <Text style={styles.websiteBtnText}>{media.websiteLabel?.trim() || 'Web sitesini aç'}</Text>
        </TouchableOpacity>
      ) : null}

      {media.openScreen && onOpenScreen && !media.videoUrl ? (
        <TouchableOpacity
          style={styles.moduleBtn}
          onPress={() => onOpenScreen(media.openScreen!)}
          activeOpacity={0.88}
        >
          <Ionicons name="open-outline" size={18} color="#fff" />
          <Text style={styles.moduleBtnText}>{media.actionLabel?.trim() || 'Modülü aç'}</Text>
        </TouchableOpacity>
      ) : null}

      <Modal visible={!!previewUri} transparent animationType="fade" onRequestClose={() => setPreviewUri(null)}>
        <Pressable style={styles.previewBackdrop} onPress={() => setPreviewUri(null)}>
          {previewUri ? (
            <CachedImage uri={previewUri} style={styles.previewImage} contentFit="contain" />
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14, gap: 10 },
  imagesBlock: { gap: 6 },
  imageRow: { gap: 10 },
  imageTile: {
    width: 140,
    height: 100,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
  },
  websiteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#99f6e4',
    backgroundColor: '#f0fdfa',
  },
  websiteBtnText: { color: '#0f766e', fontWeight: '700', fontSize: 14 },
  moduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#2563eb',
  },
  moduleBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  previewImage: { width: '100%', height: '80%' },
});
