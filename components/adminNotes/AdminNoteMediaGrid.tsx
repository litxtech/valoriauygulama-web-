import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import { notesTheme } from '@/constants/adminNotesTheme';
import type { AdminQuickNoteMediaRow } from '@/lib/adminQuickNotes';

type Props = {
  media: AdminQuickNoteMediaRow[];
  onOpen: (index: number) => void;
  embedded?: boolean;
};

export function AdminNoteMediaGrid({ media, onOpen, embedded }: Props) {
  if (!media.length) return null;

  return (
    <View style={[styles.wrap, embedded && styles.wrapEmbedded]}>
      <Text style={styles.title}>Ekler · {media.length}</Text>
      <View style={styles.grid}>
        {media.map((m, idx) => {
          const thumb = m.media_type === 'video' ? m.thumbnail_url ?? m.public_url : m.public_url;
          return (
            <Pressable key={m.id} style={styles.item} onPress={() => onOpen(idx)}>
              <CachedImage uri={thumb} style={styles.img} contentFit="cover" />
              {m.media_type === 'video' ? (
                <View style={styles.play}>
                  <Ionicons name="play" size={20} color="#fff" />
                </View>
              ) : (
                <View style={styles.zoom}>
                  <Ionicons name="expand-outline" size={14} color="#fff" />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  wrapEmbedded: { marginBottom: 0 },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: notesTheme.textMuted,
    marginBottom: 10,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: notesTheme.cardMuted,
    borderWidth: 1,
    borderColor: notesTheme.border,
  },
  img: { width: '100%', height: '100%' },
  play: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  zoom: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(28,25,23,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
