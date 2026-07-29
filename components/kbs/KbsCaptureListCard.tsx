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

const DOC_TYPE_LABEL: Record<string, string> = {
  passport: 'Pasaport',
  id_card: 'Kimlik',
  residence_permit: 'İkamet',
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
  const statusTextStyle =
    statusTone === 'ok'
      ? styles.statusTextOk
      : statusTone === 'warn'
        ? styles.statusTextWarn
        : statusTone === 'progress'
          ? styles.statusTextBusy
          : styles.statusTextMuted;

  const isFirst = groupPosition === 'first' || groupPosition === 'only';
  const isLast = groupPosition === 'last' || groupPosition === 'only';
  const staffName = item.captured_by_staff_name?.trim() || null;
  const hotelName = item.hotel_name?.trim() || null;
  const showHotelBadge = showHotel && !!hotelName;
  const showStaffBadge = showCapturedBy && !!(staffName || item.scanned_by_user_id);
  const docType = parsed?.documentType ? DOC_TYPE_LABEL[parsed.documentType] ?? null : null;
  const docNo = parsed?.documentNumber?.trim() || null;
  const nat =
    nationalityLabel?.trim() ||
    parsed?.nationalityCode?.trim() ||
    null;
  const showDocLine = !!docNo || !!nat || variant === 'passport';

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
          <View style={styles.titleBlock}>
            <Text style={styles.name} numberOfLines={1}>
              {displayCapturedName(item)}
            </Text>
            <View style={styles.primaryMeta}>
              {!inGroup ? (
                <Text style={styles.roomText}>Oda {item.room_number ?? '—'}</Text>
              ) : null}
              {!inGroup && docType ? <Text style={styles.metaDot}>·</Text> : null}
              {docType ? <Text style={styles.metaSoft}>{docType}</Text> : null}
            </View>
          </View>
          <View style={styles.statusCol}>
            {cardStatus ? (
              <View style={[styles.statusChip, statusStyle]}>
                <Text style={[styles.statusChipText, statusTextStyle]}>{cardStatus.label}</Text>
              </View>
            ) : null}
            {isNew ? (
              <View style={styles.newChip}>
                <Text style={styles.newChipText}>Yeni</Text>
              </View>
            ) : null}
          </View>
        </View>

        {showDocLine ? (
          <View style={styles.idRow}>
            {docNo ? (
              <View style={styles.docNoWrap}>
                <Text style={styles.docNo} numberOfLines={1}>
                  {docNo}
                </Text>
              </View>
            ) : null}
            {nat ? (
              <View style={styles.natWrap}>
                <Text style={styles.natChip} numberOfLines={1}>
                  {nat}
                </Text>
              </View>
            ) : null}
            {isKbsReturningGuest(parsed) ? (
              <View style={styles.returningChip}>
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
                <Text style={styles.noteChipText} numberOfLines={1}>
                  {KBS_GUEST_NOTE_TAG_META[noteSummary.latestTag].label}
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.chipRow}>
            {isKbsReturningGuest(parsed) ? (
              <View style={styles.returningChip}>
                <Text style={styles.returningChipText}>Tekrar konuk</Text>
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
        )}

        <View style={styles.footerRow}>
          {(showHotelBadge || showStaffBadge) ? (
            <Text style={styles.footerContext} numberOfLines={1}>
              {[showHotelBadge ? hotelName : null, showStaffBadge ? staffName ?? 'Personel' : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
          <Text style={styles.footerTime}>{formatTime(capturedAtTs(item))}</Text>
        </View>
      </View>

      {canDelete && !selectionMode && onDelete ? (
        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} hitSlop={10}>
          <Ionicons name="trash-outline" size={17} color="#dc2626" />
        </TouchableOpacity>
      ) : !selectionMode ? (
        <Ionicons name="chevron-forward" size={16} color="#cbd5e1" style={styles.chevron} />
      ) : null}
    </Pressable>
  );
}

export const KbsCaptureListCard = memo(CaptureListCardInner);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e6ebf1',
    padding: 12,
    marginBottom: 8,
    marginHorizontal: 12,
  },
  cardPressed: { opacity: 0.94, backgroundColor: '#f8fafc' },
  cardInGroup: {
    marginBottom: 0,
    marginHorizontal: 0,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingRight: 8,
  },
  cardInGroupFirst: { paddingTop: 8 },
  cardInGroupLast: { paddingBottom: 10 },
  cardInGroupSelected: { backgroundColor: '#fffbeb' },
  cardSelected: { borderColor: theme.colors.primary, backgroundColor: '#fffbeb' },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 40,
  },
  checkOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  body: { flex: 1, minWidth: 0, gap: 6 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titleBlock: { flex: 1, minWidth: 0, gap: 3 },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
    letterSpacing: -0.2,
  },
  primaryMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  roomText: { fontSize: 12.5, fontWeight: '700', color: '#1d4ed8' },
  metaDot: { fontSize: 12, color: '#94a3b8' },
  metaSoft: { fontSize: 12.5, fontWeight: '600', color: '#64748b' },
  statusCol: { alignItems: 'flex-end', gap: 4, flexShrink: 0 },
  chevron: { marginTop: 42, flexShrink: 0 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusOk: { backgroundColor: '#ecfdf5' },
  statusWarn: { backgroundColor: '#fff7ed' },
  statusBusy: { backgroundColor: '#eff6ff' },
  statusMuted: { backgroundColor: '#f1f5f9' },
  statusChipText: { fontSize: 10, fontWeight: '700' },
  statusTextOk: { color: '#047857' },
  statusTextWarn: { color: '#c2410c' },
  statusTextBusy: { color: '#1d4ed8' },
  statusTextMuted: { color: '#64748b' },
  newChip: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  newChipText: { fontSize: 9, fontWeight: '800', color: '#059669', letterSpacing: 0.3 },
  returningChip: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  returningChipText: { fontSize: 10, fontWeight: '700', color: '#059669' },
  noteChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  noteChipWarn: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fcd34d' },
  noteChipGood: { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0' },
  noteChipText: { fontSize: 10, fontWeight: '700', color: '#475569' },
  idRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  docNoWrap: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    maxWidth: '100%',
  },
  docNo: {
    fontSize: 12.5,
    fontWeight: '700',
    color: theme.colors.text,
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
  },
  natWrap: {
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  natChip: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  footerContext: {
    flex: 1,
    fontSize: 11,
    fontWeight: '500',
    color: '#94a3b8',
  },
  footerTime: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    fontVariant: ['tabular-nums'],
  },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 36,
  },
});
