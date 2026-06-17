import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import type { AdminQuickNoteMediaRow } from '@/lib/adminQuickNotes';

type Props = {
  media: AdminQuickNoteMediaRow[];
  onOpen: (index: number) => void;
};

export function AdminNoteMediaGrid({ media, onOpen }: Props) {
  if (!media.length) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Ekler ({media.length})</Text>
      <View style={styles.grid}>
        {media.map((m, idx) => {
          const thumb = m.media_type === 'video' ? m.thumbnail_url ?? m.public_url : m.public_url;
          return (
            <Pressable key={m.id} style={styles.item} onPress={() => onOpen(idx)}>
              <CachedImage uri={thumb} style={styles.img} contentFit="cover" />
              {m.media_type === 'video' ? (
                <View style={styles.play}>
                  <Ionicons name="play" size={18} color="#fff" />
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
  wrap: { marginBottom: 20 },
  title: { fontSize: 13, fontWeight: '800', color: '#64748B', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  item: {
    width: '47%',
    aspectRatio: 1,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#1E293B',
  },
  img: { width: '100%', height: '100%' },
  play: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  zoom: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
