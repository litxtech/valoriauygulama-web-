import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import {
  ADMIN_NOTE_TAG_COLORS,
  ADMIN_NOTE_TAG_LABELS,
  adminNoteDisplayTitle,
  adminNotePreview,
  quickNoteAuthorLabel,
  type AdminQuickNoteRow,
} from '@/lib/adminQuickNotes';

type Props = {
  note: AdminQuickNoteRow;
  onPress: (id: string) => void;
  showAuthor?: boolean;
};

export function AdminNoteListCard({ note, onPress, showAuthor }: Props) {
  const tagStyle = ADMIN_NOTE_TAG_COLORS[note.tag] ?? ADMIN_NOTE_TAG_COLORS.general;
  const media = note.media ?? [];
  const thumb = media.find((m) => m.media_type === 'image') ?? media[0];
  const when = new Date(note.created_at).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Pressable style={[styles.card, note.is_pinned && styles.cardPinned]} onPress={() => onPress(note.id)}>
      <View style={styles.top}>
        <View style={styles.numWrap}>
          <Text style={styles.num}>{note.note_number}</Text>
          {note.is_pinned ? <Ionicons name="pin" size={12} color="#6366F1" /> : null}
        </View>
        <View style={[styles.tag, { backgroundColor: tagStyle.bg }]}>
          <Text style={[styles.tagText, { color: tagStyle.text }]}>{ADMIN_NOTE_TAG_LABELS[note.tag]}</Text>
        </View>
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {adminNoteDisplayTitle(note)}
      </Text>
      <Text style={styles.preview} numberOfLines={2}>
        {adminNotePreview(note.body_text)}
      </Text>
      {showAuthor ? (
        <Text style={styles.author}>{quickNoteAuthorLabel(note)}</Text>
      ) : null}
      <View style={styles.footer}>
        <Text style={styles.when}>{when}</Text>
        <View style={styles.meta}>
          {note.room_label ? (
            <View style={styles.metaChip}>
              <Ionicons name="bed-outline" size={11} color="#64748B" />
              <Text style={styles.metaText}>{note.room_label}</Text>
            </View>
          ) : null}
          {media.length > 0 ? (
            <View style={styles.metaChip}>
              <Ionicons name="attach-outline" size={11} color="#64748B" />
              <Text style={styles.metaText}>{media.length}</Text>
            </View>
          ) : null}
        </View>
      </View>
      {thumb ? (
        <View style={styles.thumbWrap}>
          <CachedImage
            uri={thumb.media_type === 'video' ? thumb.thumbnail_url ?? thumb.public_url : thumb.public_url}
            style={styles.thumb}
          />
          {thumb.media_type === 'video' ? (
            <View style={styles.thumbPlay}>
              <Ionicons name="play" size={12} color="#fff" />
            </View>
          ) : null}
          {media.length > 1 ? (
            <View style={styles.thumbCount}>
              <Text style={styles.thumbCountText}>+{media.length - 1}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.12)',
    shadowColor: '#312e81',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
    overflow: 'hidden',
  },
  cardPinned: { borderColor: '#A5B4FC', backgroundColor: '#FAFAFF' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  numWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  num: { fontSize: 11, fontWeight: '900', color: '#6366F1', letterSpacing: 0.3 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  tagText: { fontSize: 10, fontWeight: '800' },
  title: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  preview: { fontSize: 13, color: '#64748B', lineHeight: 18 },
  author: { fontSize: 11, fontWeight: '700', color: '#6366F1', marginTop: 4 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  when: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  meta: { flexDirection: 'row', gap: 8 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: '#64748B', fontWeight: '700' },
  thumbWrap: {
    position: 'absolute',
    right: 12,
    top: 42,
    width: 52,
    height: 52,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
  },
  thumb: { width: '100%', height: '100%' },
  thumbPlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  thumbCount: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  thumbCountText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
