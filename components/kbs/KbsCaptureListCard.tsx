import { memo } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { capturedAtTs, displayCapturedName, type KbsCapturedDocumentRow } from '@/lib/kbsCaptureHistory';
import { enrichKbsParsedFromSources, isKbsTcOnlyCapture, kbsCaptureCardStatus } from '@/lib/kbsCaptureParsedFields';
import { isKbsReturningGuest } from '@/lib/kbsGuestDocumentIdentity';
import { KBS_GUEST_NOTE_TAG_META, type KbsGuestNoteSummary } from '@/lib/kbsGuestNotes';
import type { ParsedDocument } from '@/lib/scanner/types';
import { KbsDocumentThumb } from '@/components/kbs/KbsDocumentThumb';

export type KbsCaptureListCardProps = {
  item: KbsCapturedDocumentRow;
  parsed?: ParsedDocument | null;
  canSeeImages: boolean;
  canDelete?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  onDelete?: () => void;
  onThumbPress?: (rowId: string) => void;
  inGroup?: boolean;
  groupPosition?: 'first' | 'middle' | 'last' | 'only';
  isNew?: boolean;
  showCapturedBy?: boolean;
  showHotel?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  activelyReading?: boolean;
  noteSummary?: KbsGuestNoteSummary | null;
  /** Pasaport keşfeti — uyruk ve belge no öne çıkar */
  variant?: 'default' | 'passport';
  nationalityLabel?: string | null;
  formatTime?: (ts: string) => string;
};

function defaultFormatTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Bugün ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Dün ${time}`;
  const date =
    d.getFullYear() === now.getFullYear()
      ? d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
      : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${date} ${time}`;
}

function CaptureListCardInner({
  item,
  parsed: parsedProp,
  canSeeImages,
  canDelete = false,
  onPress,
  onLongPress,
  onDelete,
  onThumbPress,
  inGroup,
  groupPosition = 'only',
  isNew = false,
  showCapturedBy = true,
  showHotel = false,
  selectionMode = false,
  selected = false,
  activelyReading = false,
  noteSummary = null,
  variant = 'default',
  nationalityLabel = null,
  formatTime = defaultFormatTime,
}: KbsCaptureListCardProps) {
  const parsed =
    parsedProp ??
  (item.parsed_payload && typeof item.parsed_payload === 'object'
    ? (enrichKbsParsedFromSources(item.parsed_payload) as ParsedDocument)
    : null);

  const cardStatus = kbsCaptureCardStatus(parsed, {
    ocrStatus: item.ocr_status,
    activelyReading,
  });

  const statusTone = cardStatus?.tone ?? 'muted';
  const statusStyle =
    statusTone === 'ok'
      ? styles.statusOk
      : statusTone === 'warn'
        ? styles.statusWarn
        : statusTone === 'progress'
          ? styles.statusBusy
          : styles.statusMuted;

  const isFirst = groupPosition === 'first' || groupPosition === 'only';
  const isLast = groupPosition === 'last' || groupPosition === 'only';
  const staffName = item.captured_by_staff_name?.trim() || null;
  const hotelName = item.hotel_name?.trim() || null;
  const showHotelBadge = showHotel && !!hotelName;
  const showStaffBadge = showCapturedBy && !!(staffName || item.scanned_by_user_id);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        inGroup && styles.cardInGroup,
        inGroup && isFirst && styles.cardInGroupFirst,
        inGroup && isLast && styles.cardInGroupLast,
        selectionMode && selected && (inGroup ? styles.cardInGroupSelected : styles.cardSelected),
        pressed && !selectionMode && styles.cardPressed,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      {selectionMode ? (
        <View style={[styles.check, selected && styles.checkOn]}>
          {selected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
        </View>
      ) : null}

      {canSeeImages || isKbsTcOnlyCapture(parsed) ? (
        <KbsDocumentThumb
          uri={canSeeImages ? item.front_image_url : null}
          fallbackLabel={displayCapturedName(item)}
          tcOnly={isKbsTcOnlyCapture(parsed)}
          tcLabel={parsed?.documentNumber ?? 'T.C.'}
          onPress={onThumbPress ? () => onThumbPress(item.id) : undefined}
        />
      ) : (
        <KbsDocumentThumb fallbackLabel={displayCapturedName(item)} />
      )}

      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={styles.name} numberOfLines={2}>
            {displayCapturedName(item)}
          </Text>
          {!selectionMode ? (
            <Ionicons name="chevron-forward" size={18} color="#cbd5e1" style={styles.chevron} />
          ) : null}
        </View>

        <View style={styles.chipRow}>
          {cardStatus ? (
            <View style={[styles.statusChip, statusStyle]}>
              <Text style={styles.statusChipText}>{cardStatus.label}</Text>
            </View>
          ) : null}
          {isNew ? (
            <View style={styles.newChip}>
              <Text style={styles.newChipText}>Yeni</Text>
            </View>
          ) : null}
          {isKbsReturningGuest(parsed) ? (
            <View style={styles.returningChip}>
              <Ionicons name="checkmark-circle" size={11} color="#059669" />
              <Text style={styles.returningChipText}>Tekrar</Text>
            </View>
          ) : null}
          {noteSummary ? (
            <View
              style={[
                styles.noteChip,
                noteSummary.hasAttention
                  ? styles.noteChipWarn
                  : noteSummary.latestTag === 'good' || noteSummary.latestTag === 'vip'
                    ? styles.noteChipGood
                    : null,
              ]}
            >
              <Text style={styles.noteChipText}>
                {KBS_GUEST_NOTE_TAG_META[noteSummary.latestTag].label}
              </Text>
            </View>
          ) : null}
        </View>

        {variant === 'passport' && parsed?.documentNumber ? (
          <Text style={styles.docNo} numberOfLines={1}>
            {parsed.documentNumber}
            {nationalityLabel ? ` · ${nationalityLabel}` : ''}
          </Text>
        ) : null}

        {(showHotelBadge || showStaffBadge) ? (
          <View style={styles.contextRow}>
            {showHotelBadge ? (
              <View style={styles.hotelBadge}>
                <Ionicons name="business" size={12} color="#5eead4" />
                <Text style={styles.hotelBadgeText} numberOfLines={1}>
                  {hotelName}
                </Text>
              </View>
            ) : null}
            {showStaffBadge ? (
              <View style={styles.staffBadge}>
                <Ionicons name="person" size={12} color="#93c5fd" />
                <Text style={styles.staffBadgeText} numberOfLines={1}>
                  {staffName ?? 'Personel'}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.footerRow}>
          {!inGroup ? (
            <View style={styles.footerPill}>
              <Ionicons name="bed-outline" size={12} color="#64748b" />
              <Text style={styles.footerText}>Oda {item.room_number ?? '—'}</Text>
            </View>
          ) : null}
          <View style={styles.footerPill}>
            <Ionicons name="time-outline" size={12} color="#64748b" />
            <Text style={styles.footerText}>{formatTime(capturedAtTs(item))}</Text>
          </View>
        </View>
      </View>

      {canDelete && !selectionMode && onDelete ? (
        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} hitSlop={10}>
          <Ionicons name="trash-outline" size={17} color="#dc2626" />
        </TouchableOpacity>
      ) : null}
    </Pressable>
  );
}

export const KbsCaptureListCard = memo(CaptureListCardInner);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e8edf2',
    padding: 12,
    marginBottom: 10,
    marginHorizontal: 12,
    ...theme.shadows.sm,
  },
  cardPressed: { opacity: 0.94, transform: [{ scale: 0.995 }] },
  cardInGroup: {
    marginBottom: 0,
    marginHorizontal: 0,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingRight: 12,
    shadowOpacity: 0,
    elevation: 0,
  },
  cardInGroupFirst: { paddingTop: 10 },
  cardInGroupLast: { paddingBottom: 12 },
  cardInGroupSelected: { backgroundColor: '#fffbeb' },
  cardSelected: { borderColor: theme.colors.primary, backgroundColor: '#fffbeb' },
  check: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 36,
  },
  checkOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  body: { flex: 1, minWidth: 0, gap: 6 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
    lineHeight: 20,
  },
  chevron: { marginTop: 2, flexShrink: 0 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
  },
  statusOk: { backgroundColor: '#ecfdf5' },
  statusWarn: { backgroundColor: '#fff7ed' },
  statusBusy: { backgroundColor: '#eff6ff' },
  statusMuted: { backgroundColor: '#f1f5f9' },
  statusChipText: { fontSize: 10, fontWeight: '800', color: '#334155' },
  newChip: {
    backgroundColor: '#ccfbf1',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
  },
  newChipText: { fontSize: 10, fontWeight: '800', color: '#0d9488' },
  returningChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  returningChipText: { fontSize: 10, fontWeight: '800', color: '#059669' },
  noteChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
  },
  noteChipWarn: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fcd34d' },
  noteChipGood: { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0' },
  noteChipText: { fontSize: 10, fontWeight: '800', color: '#475569' },
  docNo: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text,
    letterSpacing: 0.3,
    fontVariant: ['tabular-nums'],
  },
  contextRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  hotelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    backgroundColor: '#042f2e',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.25)',
  },
  hotelBadgeText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '800',
    color: '#99f6e4',
  },
  staffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    backgroundColor: '#172554',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(147,197,253,0.25)',
  },
  staffBadgeText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#bfdbfe',
  },
  footerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  footerPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerText: { fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 4,
  },
});
