import { memo, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import { notesTheme, NOTE_TAG_STRIP } from '@/constants/adminNotesTheme';
import { pds } from '@/constants/personelDesignSystem';
import {
  ADMIN_NOTE_TAG_LABELS,
  adminNoteDisplayTitle,
  adminNotePreview,
  quickNoteAuthorLabel,
  type AdminNoteTag,
  type AdminQuickNoteRow,
} from '@/lib/adminQuickNotes';

type Props = {
  note: AdminQuickNoteRow;
  onPress: (id: string) => void;
  showAuthor?: boolean;
};

const TAG_ICONS: Record<AdminNoteTag, keyof typeof Ionicons.glyphMap> = {
  general: 'document-text',
  room: 'bed',
  staff: 'people',
  guest: 'person',
  urgent: 'flash',
};

function formatRelativeTr(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'Az önce';
  if (min < 60) return `${min} dk`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} sa`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} gün`;
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

export const AdminNoteListCard = memo(function AdminNoteListCard({ note, onPress, showAuthor }: Props) {
  const media = note.media ?? [];
  const mediaCount = note.media_count ?? media.length;
  const thumb = media.find((m) => m.media_type === 'image') ?? media[0];
  const accent = NOTE_TAG_STRIP[note.tag] ?? notesTheme.accent;
  const hasTitle = Boolean(note.title?.trim());
  const when = useMemo(() => formatRelativeTr(note.created_at), [note.created_at]);
  const tagIcon = TAG_ICONS[note.tag] ?? 'document-text';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        note.is_pinned && styles.cardPinned,
        note.is_archived && styles.cardArchived,
        pressed && styles.cardPressed,
      ]}
      onPress={() => onPress(note.id)}
      accessibilityRole="button"
      accessibilityLabel={adminNoteDisplayTitle(note)}
    >
      {thumb ? (
        <View style={styles.thumbWrap}>
          <CachedImage
            uri={thumb.media_type === 'video' ? thumb.thumbnail_url ?? thumb.public_url : thumb.public_url}
            style={styles.thumb}
            contentFit="cover"
          />
          {thumb.media_type === 'video' ? (
            <View style={styles.thumbPlay}>
              <Ionicons name="play" size={12} color="#fff" />
            </View>
          ) : null}
        </View>
      ) : (
        <View style={[styles.iconBadge, { backgroundColor: `${accent}18` }]}>
          <Ionicons name={tagIcon} size={20} color={accent} />
        </View>
      )}

      <View style={styles.content}>
        <View style={styles.topRow}>
          <View style={[styles.tagPill, { backgroundColor: `${accent}14` }]}>
            <Text style={[styles.tagText, { color: accent }]}>{ADMIN_NOTE_TAG_LABELS[note.tag]}</Text>
          </View>
          <View style={styles.topRight}>
            {note.is_pinned ? <Ionicons name="pin" size={13} color={notesTheme.pinned} /> : null}
            <Text style={styles.when}>{when}</Text>
          </View>
        </View>

        {hasTitle ? (
          <>
            <Text style={styles.title} numberOfLines={1}>
              {adminNoteDisplayTitle(note)}
            </Text>
            <Text style={styles.preview} numberOfLines={2}>
              {adminNotePreview(note.body_text)}
            </Text>
          </>
        ) : (
          <Text style={styles.bodyOnly} numberOfLines={3}>
            {adminNotePreview(note.body_text, 140)}
          </Text>
        )}

        <View style={styles.footer}>
          <Text style={styles.number} numberOfLines={1}>
            {note.note_number}
          </Text>
          <View style={styles.footerMeta}>
            {showAuthor ? (
              <Text style={styles.author} numberOfLines={1}>
                {quickNoteAuthorLabel(note)}
              </Text>
            ) : null}
            {note.room_label ? (
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={12} color={pds.muted} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {note.room_label}
                </Text>
              </View>
            ) : null}
            {mediaCount > 0 ? (
              <View style={styles.metaItem}>
                <Ionicons name="images-outline" size={12} color={pds.muted} />
                <Text style={styles.metaText}>{mediaCount}</Text>
              </View>
            ) : null}
            <Ionicons name="chevron-forward" size={14} color={pds.muted} />
          </View>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: pds.cardBg,
    borderRadius: pds.cardRadius,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: pds.cardBorder,
    padding: 12,
    gap: 12,
    ...pds.shadowCard,
  },
  cardPinned: {
    borderColor: '#FCD34D',
    backgroundColor: '#FFFBEB',
  },
  cardArchived: { opacity: 0.78 },
  cardPressed: { opacity: 0.94, transform: [{ scale: 0.995 }] },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  thumbWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: pds.divider,
    alignSelf: 'flex-start',
  },
  thumb: { width: '100%', height: '100%' },
  thumbPlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  content: { flex: 1, minWidth: 0 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tagPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  tagText: { fontSize: 11, fontWeight: '700' },
  when: { fontSize: 11, color: pds.muted, fontWeight: '600' },
  title: { fontSize: 16, fontWeight: '700', color: pds.text, marginBottom: 3 },
  preview: { fontSize: 13, color: pds.subtext, lineHeight: 18 },
  bodyOnly: { fontSize: 15, fontWeight: '600', color: pds.text, lineHeight: 21 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 8,
  },
  number: {
    fontSize: 11,
    fontWeight: '700',
    color: pds.indigo,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  footerMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  author: { fontSize: 11, fontWeight: '700', color: pds.indigo, maxWidth: 90 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: 72 },
  metaText: { fontSize: 11, color: pds.muted, fontWeight: '600' },
});
