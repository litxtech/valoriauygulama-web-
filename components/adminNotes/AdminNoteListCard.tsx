import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import { notesTheme, NOTE_TAG_STRIP } from '@/constants/adminNotesTheme';
import {
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
  const media = note.media ?? [];
  const thumb = media.find((m) => m.media_type === 'image') ?? media[0];
  const stripColor = NOTE_TAG_STRIP[note.tag] ?? notesTheme.accent;
  const when = new Date(note.created_at).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        note.is_pinned && styles.cardPinned,
        note.is_archived && styles.cardArchived,
        pressed && styles.cardPressed,
      ]}
      onPress={() => onPress(note.id)}
    >
      <View style={[styles.strip, { backgroundColor: stripColor }]} />

      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.number}>{note.note_number}</Text>
          <View style={styles.badges}>
            {note.is_pinned ? (
              <View style={styles.pinBadge}>
                <Ionicons name="pin" size={10} color={notesTheme.pinned} />
              </View>
            ) : null}
            <View style={styles.tagPill}>
              <Text style={styles.tagText}>{ADMIN_NOTE_TAG_LABELS[note.tag]}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.title} numberOfLines={1}>
          {adminNoteDisplayTitle(note)}
        </Text>
        <Text style={styles.preview} numberOfLines={2}>
          {adminNotePreview(note.body_text)}
        </Text>

        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            {showAuthor ? <Text style={styles.author}>{quickNoteAuthorLabel(note)}</Text> : null}
            <Text style={styles.when}>{when}</Text>
          </View>
          <View style={styles.meta}>
            {note.room_label ? (
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={12} color={notesTheme.textMuted} />
                <Text style={styles.metaText}>{note.room_label}</Text>
              </View>
            ) : null}
            {media.length > 0 ? (
              <View style={styles.metaItem}>
                <Ionicons name="images-outline" size={12} color={notesTheme.textMuted} />
                <Text style={styles.metaText}>{media.length}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {thumb ? (
        <View style={styles.thumbCol}>
          <CachedImage
            uri={thumb.media_type === 'video' ? thumb.thumbnail_url ?? thumb.public_url : thumb.public_url}
            style={styles.thumb}
          />
          {thumb.media_type === 'video' ? (
            <View style={styles.thumbPlay}>
              <Ionicons name="play" size={14} color="#fff" />
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: notesTheme.card,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: notesTheme.border,
    overflow: 'hidden',
    minHeight: 108,
  },
  cardPinned: {
    borderColor: '#FCD34D',
    backgroundColor: notesTheme.pinnedSoft,
  },
  cardArchived: { opacity: 0.72 },
  cardPressed: { opacity: 0.92 },
  strip: { width: 4 },
  content: { flex: 1, padding: 14, paddingRight: 8, minWidth: 0 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  number: {
    fontSize: 11,
    fontWeight: '700',
    color: notesTheme.accentDark,
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
  },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pinBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: notesTheme.cardMuted,
    borderWidth: 1,
    borderColor: notesTheme.border,
  },
  tagText: { fontSize: 10, fontWeight: '700', color: notesTheme.textSecondary },
  title: { fontSize: 15, fontWeight: '700', color: notesTheme.text, marginBottom: 4 },
  preview: { fontSize: 13, color: notesTheme.textMuted, lineHeight: 18 },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 8,
  },
  footerLeft: { flex: 1, gap: 2 },
  author: { fontSize: 11, fontWeight: '700', color: notesTheme.accentDark },
  when: { fontSize: 11, color: notesTheme.textSoft, fontWeight: '500' },
  meta: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: notesTheme.textMuted, fontWeight: '600' },
  thumbCol: {
    width: 72,
    alignSelf: 'stretch',
    backgroundColor: notesTheme.cardMuted,
    borderLeftWidth: 1,
    borderLeftColor: notesTheme.border,
  },
  thumb: { width: '100%', height: '100%' },
  thumbPlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
});
