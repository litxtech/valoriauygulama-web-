import { memo } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { PressableScale } from '@/components/premium/PressableScale';
import {
  hotelIssueArchiveCategoryIcon,
  hotelIssueArchiveCategoryMeta,
  type HotelIssueArchiveRow,
} from '@/lib/hotelIssueArchive';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Az önce';
    if (mins < 60) return `${mins} dk önce`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} sa önce`;
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function firstThumb(row: HotelIssueArchiveRow): string | null {
  const media = row.media ?? [];
  if (!media.length) return null;
  const sorted = [...media].sort((a, b) => a.sort_order - b.sort_order);
  return sorted[0].thumbnail_url ?? sorted[0].public_url;
}

function mediaCount(row: HotelIssueArchiveRow): number {
  return row.media?.length ?? 0;
}

type Props = {
  item: HotelIssueArchiveRow;
  onPress: () => void;
};

export const HotelIssueArchiveRecordCard = memo(function HotelIssueArchiveRecordCard({ item, onPress }: Props) {
  const meta = hotelIssueArchiveCategoryMeta(item.category);
  const thumb = firstThumb(item);
  const count = mediaCount(item);
  const creatorRaw = item.creator as { full_name: string | null } | { full_name: string | null }[] | null;
  const creator = Array.isArray(creatorRaw) ? creatorRaw[0] ?? null : creatorRaw ?? null;
  const creatorName = creator?.full_name ?? 'Personel';
  const location = item.room_number ? `Oda ${item.room_number}` : item.location_label || 'Konum belirtilmedi';

  return (
    <PressableScale style={styles.wrap} onPress={onPress}>
      <View style={styles.card}>
        <View style={[styles.accent, { backgroundColor: meta.color }]} />
        <View style={styles.body}>
          <View style={styles.topRow}>
            <View style={[styles.catBadge, { backgroundColor: `${meta.color}16` }]}>
              <Ionicons name={hotelIssueArchiveCategoryIcon(item.category) as never} size={12} color={meta.color} />
              <Text style={[styles.catText, { color: meta.color }]}>{meta.label.split(' / ')[0]}</Text>
            </View>
            <Text style={styles.time}>{formatRelative(item.created_at)}</Text>
          </View>

          <Text style={styles.location} numberOfLines={1}>
            {location}
          </Text>
          <Text style={styles.note} numberOfLines={2}>
            {item.note}
          </Text>

          <View style={styles.footer}>
            <View style={styles.creatorRow}>
              <View style={[styles.avatar, { backgroundColor: `${meta.color}22` }]}>
                <Text style={[styles.avatarText, { color: meta.color }]}>{initials(creatorName)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.creatorName} numberOfLines={1}>
                  {creatorName}
                </Text>
                {item.record_no ? <Text style={styles.recordNo}>{item.record_no}</Text> : null}
              </View>
            </View>

            {thumb ? (
              <View style={styles.thumbWrap}>
                <Image source={{ uri: thumb }} style={styles.thumb} />
                {count > 1 ? (
                  <View style={styles.thumbBadge}>
                    <Ionicons name="images" size={10} color="#fff" />
                    <Text style={styles.thumbBadgeText}>{count}</Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={[styles.thumbEmpty, { backgroundColor: `${meta.color}10` }]}>
                <Ionicons name="document-text-outline" size={18} color={meta.color} />
              </View>
            )}
          </View>
        </View>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  wrap: { marginBottom: 10 },
  card: {
    flexDirection: 'row',
    backgroundColor: theme.colors.background,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  accent: { width: 4 },
  body: { flex: 1, padding: 14, paddingLeft: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  catBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  catText: { fontSize: 11, fontWeight: '700' },
  time: { fontSize: 11, color: theme.colors.textMuted, fontWeight: '500' },
  location: { marginTop: 8, fontSize: 16, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.2 },
  note: { marginTop: 4, fontSize: 14, lineHeight: 20, color: theme.colors.textSecondary },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 10 },
  creatorRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 11, fontWeight: '800' },
  creatorName: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  recordNo: { fontSize: 10, color: theme.colors.textMuted, marginTop: 1, fontWeight: '500' },
  thumbWrap: { width: 52, height: 52, borderRadius: 12, overflow: 'hidden' },
  thumb: { width: '100%', height: '100%' },
  thumbBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(15,23,42,0.72)',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  thumbBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  thumbEmpty: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
