import { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { FacilityJournalMediaPreview } from '@/components/facilityJournal/FacilityJournalMediaPreview';
import type { FacilityJournalRecordRow } from '@/lib/facilityJournal';
import { facilityJournalListMediaSummary } from '@/lib/facilityJournalListUi';
import { theme } from '@/constants/theme';

type Props = {
  item: FacilityJournalRecordRow;
  onPress: (id: string) => void;
};

function typeIconName(icon: string | null | undefined): keyof typeof Ionicons.glyphMap {
  const allowed = new Set([
    'construct-outline',
    'clipboard-outline',
    'briefcase-outline',
    'swap-horizontal-outline',
    'document-text-outline',
    'images-outline',
    'videocam-outline',
  ]);
  if (icon && allowed.has(icon)) return icon as keyof typeof Ionicons.glyphMap;
  return 'folder-open-outline';
}

export const FacilityJournalListCard = memo(function FacilityJournalListCard({ item, onPress }: Props) {
  const media = item.media ?? [];
  const cover = media[0];
  const { total, imageCount, videoCount, hasMedia } = facilityJournalListMediaSummary(media);
  const extras = media.slice(1, 4);
  const typeName = item.type?.name ?? 'Kayıt';
  const typeIcon = typeIconName(item.type?.icon);
  const showHeroPreview = cover && (cover.media_type === 'image' || cover.public_url);

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.9} onPress={() => onPress(item.id)}>
      <View style={styles.mediaWrap}>
        {showHeroPreview ? (
          <FacilityJournalMediaPreview
            media={cover}
            style={styles.heroImage}
            recyclingKey={`fj-hero-${item.id}`}
            allowVideoFrameFallback
          />
        ) : (
          <View style={styles.heroPlaceholder}>
            <Ionicons name="images-outline" size={40} color={theme.colors.textMuted} />
            <Text style={styles.placeholderText}>{hasMedia ? 'Medya' : 'Medya yok'}</Text>
          </View>
        )}

        <LinearGradient
          colors={['transparent', 'rgba(15,23,42,0.55)']}
          style={styles.mediaGradient}
          pointerEvents="none"
        />

        {cover?.media_type === 'video' ? (
          <View style={styles.playBadge} pointerEvents="none">
            <Ionicons name="play" size={20} color="#fff" />
          </View>
        ) : null}

        {total > 0 ? (
          <View style={styles.mediaBadges} pointerEvents="none">
            {imageCount > 0 ? (
              <View style={styles.statPill}>
                <Ionicons name="image-outline" size={12} color="#fff" />
                {imageCount > 1 ? <Text style={styles.statPillText}>{imageCount}</Text> : null}
              </View>
            ) : null}
            {videoCount > 0 ? (
              <View style={styles.statPill}>
                <Ionicons name="videocam-outline" size={12} color="#fff" />
                {videoCount > 1 ? <Text style={styles.statPillText}>{videoCount}</Text> : null}
              </View>
            ) : null}
          </View>
        ) : null}

        {extras.length > 0 ? (
          <View style={styles.thumbStrip} pointerEvents="none">
            {extras.map((m) => (
              <View key={`${m.record_id}-${m.sort_order}`} style={styles.thumbCell}>
                <FacilityJournalMediaPreview
                  media={m}
                  style={styles.thumbImg}
                  recyclingKey={`fj-thumb-${item.id}-${m.sort_order}`}
                  allowVideoFrameFallback={m.media_type === 'video'}
                />
                {m.media_type === 'video' ? (
                  <View style={styles.thumbPlay}>
                    <Ionicons name="play" size={8} color="#fff" />
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.typeChip}>
            <Ionicons name={typeIcon} size={14} color={theme.colors.primary} />
            <Text style={styles.typeChipText} numberOfLines={1}>
              {typeName}
            </Text>
          </View>
          <Text style={styles.date}>{item.record_date}</Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.footerRow}>
          <Text style={styles.ref}>{item.reference_code}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </View>
      </View>
    </TouchableOpacity>
  );
});

const HERO_HEIGHT = 168;

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  mediaWrap: {
    height: HERO_HEIGHT,
    backgroundColor: '#e2e8f0',
    position: 'relative',
  },
  heroImage: { width: '100%', height: '100%' },
  heroPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f1f5f9',
  },
  placeholderText: { fontSize: 12, color: theme.colors.textMuted, fontWeight: '500' },
  mediaGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 72,
  },
  playBadge: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -26,
    marginTop: -26,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  mediaBadges: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    gap: 6,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(15,23,42,0.5)',
  },
  statPillText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  thumbStrip: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    flexDirection: 'row',
    gap: 6,
  },
  thumbCell: {
    width: 44,
    height: 44,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: '#cbd5e1',
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbPlay: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(15,23,42,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: 14, gap: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '68%',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#ecfdf5',
  },
  typeChipText: { fontSize: 12, fontWeight: '700', color: theme.colors.primary, flexShrink: 1 },
  date: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted },
  title: { fontSize: 17, fontWeight: '700', color: theme.colors.text, lineHeight: 22 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ref: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted, letterSpacing: 0.3 },
});
