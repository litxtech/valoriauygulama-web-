import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { notesTheme } from '@/constants/adminNotesTheme';
import { pds } from '@/constants/personelDesignSystem';
import {
  ADMIN_NOTE_TAG_LABELS,
  quickNoteAuthorLabel,
  type AdminQuickNoteRow,
} from '@/lib/adminQuickNotes';
import { AdminNoteMediaGrid } from '@/components/adminNotes/AdminNoteMediaGrid';

type Props = {
  note: AdminQuickNoteRow;
  canEdit: boolean;
  /** Kendi notunda yazar satırını gizle */
  viewerStaffId?: string | null;
  onEdit: () => void;
  onShare: () => void;
  onOpenMedia: (index: number) => void;
  onPin: () => void;
  onArchive: () => void;
  onDelete: () => void;
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type ToolBtn = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  variant?: 'default' | 'active' | 'danger';
};

function ToolButton({ btn }: { btn: ToolBtn }) {
  const isActive = btn.variant === 'active';
  const isDanger = btn.variant === 'danger';
  return (
    <Pressable
      style={({ pressed }) => [styles.toolBtn, pressed && { opacity: 0.85 }]}
      onPress={btn.onPress}
      accessibilityLabel={btn.label}
    >
      <View
        style={[
          styles.toolIcon,
          isActive && styles.toolIconActive,
          isDanger && styles.toolIconDanger,
        ]}
      >
        <Ionicons
          name={btn.icon}
          size={20}
          color={isDanger ? notesTheme.danger : isActive ? notesTheme.accentDark : notesTheme.textSecondary}
        />
      </View>
      <Text
        style={[styles.toolLabel, isDanger && styles.toolLabelDanger, isActive && styles.toolLabelActive]}
        numberOfLines={1}
      >
        {btn.label}
      </Text>
    </Pressable>
  );
}

export function AdminNoteDetailCard({
  note,
  canEdit,
  viewerStaffId,
  onEdit,
  onShare,
  onOpenMedia,
  onPin,
  onArchive,
  onDelete,
}: Props) {
  const insets = useSafeAreaInsets();
  const when = formatWhen(note.created_at);
  const updatedWhen =
    note.updated_at && note.updated_at !== note.created_at ? formatWhen(note.updated_at) : null;
  const media = [...(note.media ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const showAuthor = !viewerStaffId || note.created_by_staff_id !== viewerStaffId;

  const tools: ToolBtn[] = [
    ...(canEdit
      ? [{ key: 'edit', icon: 'create-outline' as const, label: 'Düzenle', onPress: onEdit }]
      : []),
    { key: 'share', icon: 'share-outline', label: 'Paylaş', onPress: onShare },
    {
      key: 'pin',
      icon: note.is_pinned ? 'pin' : 'pin-outline',
      label: note.is_pinned ? 'Sabitli' : 'Sabit',
      onPress: onPin,
      variant: note.is_pinned ? 'active' : 'default',
    },
    {
      key: 'archive',
      icon: note.is_archived ? 'archive' : 'archive-outline',
      label: note.is_archived ? 'Geri al' : 'Arşiv',
      onPress: onArchive,
      variant: note.is_archived ? 'active' : 'default',
    },
    ...(canEdit
      ? [{ key: 'delete', icon: 'trash-outline' as const, label: 'Sil', onPress: onDelete, variant: 'danger' as const }]
      : []),
  ];

  return (
    <View style={styles.wrap}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.paper}>
        <View style={styles.paperHeader}>
          <View style={styles.numberBlock}>
            <Text style={styles.numberLabel}>NOT</Text>
            <Text style={styles.number}>{note.note_number.replace(/^NOT-/, '')}</Text>
          </View>
          <View style={styles.headerBadges}>
            <View style={styles.tagBadge}>
              <Text style={styles.tagBadgeText}>{ADMIN_NOTE_TAG_LABELS[note.tag]}</Text>
            </View>
            {note.is_pinned ? (
              <View style={[styles.statusDot, styles.statusPinned]}>
                <Ionicons name="pin" size={12} color={notesTheme.pinned} />
              </View>
            ) : null}
            {note.is_archived ? (
              <View style={[styles.statusDot, styles.statusArchived]}>
                <Ionicons name="archive" size={12} color={notesTheme.textMuted} />
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.divider} />

        {note.title?.trim() ? <Text style={styles.title}>{note.title.trim()}</Text> : null}

        <View style={styles.metaGrid}>
          {showAuthor ? (
            <View style={styles.metaCell}>
              <Ionicons name="person-outline" size={14} color={notesTheme.accent} />
              <Text style={styles.metaValue} numberOfLines={1}>
                {quickNoteAuthorLabel(note)}
              </Text>
            </View>
          ) : null}
          <View style={styles.metaCell}>
            <Ionicons name="time-outline" size={14} color={notesTheme.accent} />
            <Text style={styles.metaValue}>{when}</Text>
          </View>
          {note.room_label ? (
            <View style={styles.metaCell}>
              <Ionicons name="location-outline" size={14} color={notesTheme.accent} />
              <Text style={styles.metaValue}>{note.room_label}</Text>
            </View>
          ) : null}
          {updatedWhen ? (
            <View style={styles.metaCell}>
              <Ionicons name="pencil-outline" size={14} color={notesTheme.textMuted} />
              <Text style={[styles.metaValue, styles.metaMuted]}>{updatedWhen}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.bodyBlock}>
          <Text style={styles.body}>{note.body_text?.trim() ? note.body_text : '—'}</Text>
        </View>

        {media.length > 0 ? (
          <View style={styles.mediaBlock}>
            <AdminNoteMediaGrid media={media} onOpen={onOpenMedia} embedded />
          </View>
        ) : null}
        </View>
      </ScrollView>

      <View style={[styles.toolbar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.toolbarInner}>
          {tools.map((btn) => (
            <ToolButton key={btn.key} btn={btn} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 8 },
  paper: {
    backgroundColor: notesTheme.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: notesTheme.border,
    overflow: 'hidden',
  },
  paperHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 18,
    paddingBottom: 14,
    backgroundColor: notesTheme.accentGhost,
  },
  numberBlock: { gap: 2 },
  numberLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: notesTheme.accent,
    letterSpacing: 1.2,
  },
  number: {
    fontSize: 22,
    fontWeight: '800',
    color: notesTheme.text,
    fontVariant: ['tabular-nums'],
  },
  headerBadges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tagBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: notesTheme.card,
    borderWidth: 1,
    borderColor: notesTheme.border,
  },
  tagBadgeText: { fontSize: 11, fontWeight: '700', color: notesTheme.textSecondary },
  statusDot: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: notesTheme.card,
    borderWidth: 1,
    borderColor: notesTheme.border,
  },
  statusPinned: { backgroundColor: notesTheme.pinnedSoft, borderColor: '#FDE68A' },
  statusArchived: {},
  divider: { height: 1, backgroundColor: notesTheme.border },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: notesTheme.text,
    lineHeight: 28,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 2,
  },
  metaGrid: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  metaCell: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaValue: { flex: 1, fontSize: 13, color: notesTheme.textSecondary, fontWeight: '500' },
  metaMuted: { color: notesTheme.textSoft, fontSize: 12 },
  bodyBlock: {
    marginHorizontal: 18,
    marginTop: 12,
    marginBottom: 18,
    paddingVertical: 4,
    paddingLeft: 14,
    borderLeftWidth: 3,
    borderLeftColor: notesTheme.accent,
  },
  body: { fontSize: 16, color: notesTheme.text, lineHeight: 26 },
  mediaBlock: { paddingHorizontal: 18, paddingBottom: 18 },
  toolbar: {
    paddingTop: 8,
    paddingHorizontal: 16,
    backgroundColor: pds.pageBg,
    borderTopWidth: 1,
    borderTopColor: pds.cardBorder,
  },
  toolbarInner: {
    flexDirection: 'row',
    backgroundColor: notesTheme.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: notesTheme.border,
    paddingVertical: 8,
    paddingHorizontal: 4,
    shadowColor: notesTheme.shadow,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
  },
  toolBtn: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 2 },
  toolIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: notesTheme.cardMuted,
  },
  toolIconActive: { backgroundColor: notesTheme.accentSoft },
  toolIconDanger: { backgroundColor: notesTheme.dangerSoft },
  toolLabel: { fontSize: 10, fontWeight: '700', color: notesTheme.textMuted, textAlign: 'center' },
  toolLabelActive: { color: notesTheme.accentDark },
  toolLabelDanger: { color: notesTheme.danger },
});
