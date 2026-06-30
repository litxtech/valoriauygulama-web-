import { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CachedImage } from '@/components/CachedImage';
import { blacklistTheme } from '@/lib/securityBlacklistTheme';
import {
  securityBlacklistFullName,
  securityBlacklistHasFamilyNote,
  securityBlacklistHasHotelNote,
  type SecurityBlacklistRow,
} from '@/lib/securityBlacklist';

type Props = {
  item: SecurityBlacklistRow;
  onPress: () => void;
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

export const BlacklistEntryCard = memo(function BlacklistEntryCard({ item, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.88} onPress={onPress}>
      <LinearGradient
        colors={item.is_removed ? ['#1F2937', '#111827'] : ['#2A1B1B', '#1A2332']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardGradient}
      >
        <View style={styles.avatarWrap}>
          {item.photo_url ? (
            <CachedImage uri={item.photo_url} style={styles.avatar} contentFit="cover" />
          ) : (
            <LinearGradient colors={['#7F1D1D', '#DC2626']} style={styles.avatarPh}>
              <Text style={styles.avatarLetter}>{item.first_name.charAt(0).toUpperCase()}</Text>
            </LinearGradient>
          )}
          {!item.is_removed ? (
            <View style={styles.alertDot}>
              <Ionicons name="warning" size={10} color="#fff" />
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          <View style={styles.topRow}>
            <Text style={styles.refCode}>{item.reference_code}</Text>
            {item.is_removed ? (
              <View style={styles.removedPill}>
                <Text style={styles.removedPillText}>Arşiv</Text>
              </View>
            ) : (
              <View style={styles.activePill}>
                <Text style={styles.activePillText}>Aktif</Text>
              </View>
            )}
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {securityBlacklistFullName(item)}
          </Text>
          <Text style={styles.incident} numberOfLines={2}>
            {item.incident_description}
          </Text>
          <View style={styles.scopeRow}>
            {securityBlacklistHasHotelNote(item) ? (
              <View style={styles.scopePillHotel}>
                <Ionicons name="business-outline" size={11} color="#93C5FD" />
                <Text style={styles.scopePillTextHotel}>Otel</Text>
              </View>
            ) : null}
            {securityBlacklistHasFamilyNote(item) ? (
              <View style={styles.scopePillFamily}>
                <Ionicons name="people-outline" size={11} color="#F9A8D4" />
                <Text style={styles.scopePillTextFamily}>Aile</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.metaRow}>
            {item.nationality ? (
              <View style={styles.metaChip}>
                <Ionicons name="earth-outline" size={12} color={blacklistTheme.textMuted} />
                <Text style={styles.metaText}>{item.nationality}</Text>
              </View>
            ) : null}
            <View style={styles.metaChip}>
              <Ionicons name="calendar-outline" size={12} color={blacklistTheme.textMuted} />
              <Text style={styles.metaText}>{formatDate(item.incident_date ?? item.created_at)}</Text>
            </View>
          </View>
        </View>

        <Ionicons name="chevron-forward" size={18} color={blacklistTheme.textMuted} />
      </LinearGradient>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: blacklistTheme.border,
  },
  cardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  avatarWrap: { position: 'relative' },
  avatar: { width: 58, height: 58, borderRadius: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,0.12)' },
  avatarPh: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { fontSize: 22, fontWeight: '900', color: '#fff' },
  alertDot: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: blacklistTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#1A2332',
  },
  body: { flex: 1, gap: 4 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  refCode: { fontSize: 11, fontWeight: '800', color: blacklistTheme.textMuted, letterSpacing: 0.6 },
  activePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: blacklistTheme.accentSoft,
  },
  activePillText: { fontSize: 10, fontWeight: '800', color: '#FCA5A5', textTransform: 'uppercase' },
  removedPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
  },
  removedPillText: { fontSize: 10, fontWeight: '800', color: blacklistTheme.textMuted, textTransform: 'uppercase' },
  name: { fontSize: 17, fontWeight: '900', color: blacklistTheme.text },
  incident: { fontSize: 13, color: blacklistTheme.textSecondary, lineHeight: 18 },
  scopeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  scopePillHotel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(59, 130, 246, 0.14)',
  },
  scopePillTextHotel: { fontSize: 10, fontWeight: '800', color: '#93C5FD' },
  scopePillFamily: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(236, 72, 153, 0.14)',
  },
  scopePillTextFamily: { fontSize: 10, fontWeight: '800', color: '#F9A8D4' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, color: blacklistTheme.textMuted, fontWeight: '600' },
});
