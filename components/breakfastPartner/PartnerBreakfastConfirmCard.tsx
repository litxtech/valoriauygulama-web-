import { memo, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import { BreakfastPhotoLightbox } from '@/components/BreakfastPhotoLightbox';
import {
  formatPartnerDateTurkish,
  formatPartnerTime,
  PARTNER_BREAKFAST_CONFIRM_STATUS_LABELS,
  resolvePartnerBreakfastConfirmStatus,
  type PartnerBreakfastConfirmation,
} from '@/lib/breakfastPartner';
import { partnerRadii, partnerTheme } from '@/lib/breakfastPartnerTheme';

type Props = {
  item: PartnerBreakfastConfirmation;
  partnerGuestCount?: number | null;
  compact?: boolean;
};

const STATUS_STYLE = {
  pending: { bg: 'rgba(245, 158, 11, 0.14)', color: '#f59e0b', icon: 'time-outline' as const },
  approved: { bg: partnerTheme.successSoft, color: partnerTheme.success, icon: 'checkmark-circle' as const },
  rejected: { bg: partnerTheme.dangerSoft, color: partnerTheme.danger, icon: 'close-circle' as const },
};

function TimelineRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <View style={styles.timelineRow}>
      <Ionicons name={icon} size={14} color={partnerTheme.mutedSoft} />
      <Text style={styles.timelineLabel}>{label}</Text>
      <Text style={styles.timelineValue}>{value}</Text>
    </View>
  );
}

export const PartnerBreakfastConfirmCard = memo(function PartnerBreakfastConfirmCard({
  item,
  partnerGuestCount = null,
  compact = false,
}: Props) {
  const status = resolvePartnerBreakfastConfirmStatus(item);
  const statusUi = STATUS_STYLE[status];
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);

  const dateLabel = formatPartnerDateTurkish(item.record_date, { weekday: true });
  const uploader = (item.staff_name ?? 'Mutfak').trim() || 'Mutfak';
  const approver = (item.approver_name ?? 'Yetkili').trim() || 'Yetkili';

  const compareHint = useMemo(() => {
    if (partnerGuestCount == null) return null;
    if (status !== 'approved') return null;
    if (partnerGuestCount === item.guest_count) return 'Sizin kaydınızla aynı kişi sayısı';
    return `Sizin kaydınız: ${partnerGuestCount} kişi · teyit: ${item.guest_count} kişi`;
  }, [partnerGuestCount, item.guest_count, status]);

  const thumbSize = compact ? 56 : 68;

  return (
    <>
      <View style={[styles.card, compact && styles.cardCompact]}>
        <View style={styles.cardHead}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.date}>{dateLabel}</Text>
            <Text style={styles.meta}>Teyit tarihi · {item.record_date}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: statusUi.bg }]}>
            <Ionicons name={statusUi.icon} size={13} color={statusUi.color} />
            <Text style={[styles.statusText, { color: statusUi.color }]}>
              {PARTNER_BREAKFAST_CONFIRM_STATUS_LABELS[status]}
            </Text>
          </View>
        </View>

        <View style={styles.timeline}>
          <TimelineRow icon="people-outline" label="Kişi sayısı" value={`${item.guest_count} kişi`} />
          <TimelineRow
            icon="cloud-upload-outline"
            label="Yüklendi"
            value={`${formatPartnerTime(item.submitted_at) || '—'} · ${uploader}`}
          />
          {status === 'approved' && item.approved_at ? (
            <TimelineRow icon="shield-checkmark-outline" label="Onaylandı" value={`${formatPartnerTime(item.approved_at)} · ${approver}`} />
          ) : null}
          {status === 'rejected' && item.rejected_at ? (
            <TimelineRow icon="ban-outline" label="Reddedildi" value={formatPartnerTime(item.rejected_at)} />
          ) : null}
        </View>

        {item.note?.trim() ? <Text style={styles.note}>{item.note.trim()}</Text> : null}
        {item.rejection_reason?.trim() && status === 'rejected' ? (
          <Text style={styles.rejectReason}>{item.rejection_reason.trim()}</Text>
        ) : null}

        {compareHint ? (
          <View style={styles.compareBox}>
            <Ionicons name="git-compare-outline" size={14} color={partnerTheme.accent} />
            <Text style={styles.compareText}>{compareHint}</Text>
          </View>
        ) : null}

        {item.photo_urls.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
            {item.photo_urls.map((uri, idx) => (
              <TouchableOpacity key={`${item.id}-${idx}`} activeOpacity={0.88} onPress={() => setLightbox({ urls: item.photo_urls, index: idx })}>
                <CachedImage uri={uri} style={[styles.thumb, { width: thumbSize, height: thumbSize }]} contentFit="cover" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.noPhoto}>
            <Ionicons name="image-outline" size={16} color={partnerTheme.mutedSoft} />
            <Text style={styles.noPhotoText}>Fotoğraf yok</Text>
          </View>
        )}
      </View>

      <BreakfastPhotoLightbox
        visible={!!lightbox}
        urls={lightbox?.urls ?? []}
        initialIndex={lightbox?.index ?? 0}
        onClose={() => setLightbox(null)}
      />
    </>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: partnerTheme.card,
    borderRadius: partnerRadii.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
    marginBottom: 10,
  },
  cardCompact: { marginBottom: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  date: { color: partnerTheme.text, fontWeight: '800', fontSize: 16, lineHeight: 22 },
  meta: { color: partnerTheme.mutedSoft, fontSize: 11, marginTop: 2, fontWeight: '600' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: partnerRadii.pill,
  },
  statusText: { fontSize: 11, fontWeight: '800' },
  timeline: { gap: 6, marginBottom: 8 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  timelineLabel: { color: partnerTheme.mutedSoft, fontSize: 12, fontWeight: '700', minWidth: 72 },
  timelineValue: { color: partnerTheme.muted, fontSize: 12, fontWeight: '600', flex: 1 },
  note: { color: partnerTheme.muted, fontSize: 13, lineHeight: 19, marginBottom: 8 },
  rejectReason: {
    color: partnerTheme.danger,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
    fontWeight: '600',
  },
  compareBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: partnerTheme.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 8,
  },
  compareText: { color: partnerTheme.accent, fontSize: 12, fontWeight: '700', flex: 1 },
  thumbRow: { gap: 8, paddingTop: 2 },
  thumb: { borderRadius: 12, backgroundColor: partnerTheme.cardElevated },
  noPhoto: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  noPhotoText: { color: partnerTheme.mutedSoft, fontSize: 12, fontWeight: '600' },
});
