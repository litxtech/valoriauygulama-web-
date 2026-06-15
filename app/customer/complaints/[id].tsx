import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { CachedImage } from '@/components/CachedImage';
import { GlassSurface } from '@/components/premium/GlassSurface';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
import { formatFeedRelativeTime } from '@/lib/feedRelativeTime';
import { useTranslation } from 'react-i18next';
import {
  complaintCategoryLabel,
  complaintStatusLabel,
  complaintTypeLabel,
  complaintsText,
  complaintsLocaleTag,
  guestComplaintTimelineManagerDesc,
} from '@/lib/complaintsI18n';
import type { PersonelDesignPalette } from '@/constants/personelDesignSystem';

type ComplaintDetailRow = {
  id: string;
  topic_type: 'complaint' | 'suggestion' | 'thanks';
  category: string;
  status: string;
  description: string;
  phone: string | null;
  room_number: string | null;
  image_url: string | null;
  admin_note: string | null;
  reviewed_by_staff_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  reviewed_by?: { id: string; full_name: string | null; profile_image: string | null } | null;
};

function statusGradient(status: string, isNight: boolean): [string, string] {
  if (status === 'resolved') return isNight ? ['#065F46', '#047857'] : ['#059669', '#34D399'];
  if (status === 'unresolved' || status === 'rejected') {
    return isNight ? ['#7F1D1D', '#991B1B'] : ['#DC2626', '#F87171'];
  }
  if (status === 'solution_in_progress') return isNight ? ['#4C1D95', '#6D28D9'] : ['#7C3AED', '#A78BFA'];
  if (status === 'taken_for_review' || status === 'reviewing') {
    return isNight ? ['#1E3A8A', '#2563EB'] : ['#2563EB', '#60A5FA'];
  }
  return isNight ? ['#78350F', '#B45309'] : ['#D97706', '#FBBF24'];
}

export default function CustomerComplaintDetailScreen() {
  useTranslation();
  const params = useLocalSearchParams<{ id?: string }>();
  const complaintId = String(params.id ?? '');
  const palette = usePersonelDesign();
  const { isNight, colors: premium } = usePremiumTheme();
  const styles = useMemo(() => createDetailStyles(palette, isNight), [palette, isNight]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [row, setRow] = useState<ComplaintDetailRow | null>(null);

  const load = useCallback(async () => {
    const guest = await getOrCreateGuestForCurrentSession();
    if (!guest?.guest_id || !complaintId) {
      setRow(null);
      return;
    }
    const { data } = await supabase
      .from('guest_complaints')
      .select(
        'id, topic_type, category, status, description, phone, room_number, image_url, admin_note, reviewed_by_staff_id, reviewed_at, created_at, updated_at, reviewed_by:reviewed_by_staff_id(id, full_name, profile_image)'
      )
      .eq('id', complaintId)
      .eq('guest_id', guest.guest_id)
      .maybeSingle();
    setRow((data as ComplaintDetailRow | null) ?? null);
  }, [complaintId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!complaintId) return;
    const channel = supabase
      .channel(`guest-complaint-${complaintId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'guest_complaints', filter: `id=eq.${complaintId}` },
        () => {
          load().catch(() => {});
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [complaintId, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const loc = complaintsLocaleTag();
  const managerName = (row?.reviewed_by?.full_name ?? '').trim() || complaintsText('defaultManagerName');

  const timeline = useMemo(() => {
    if (!row) return [];
    const out: { id: string; icon: keyof typeof Ionicons.glyphMap; title: string; desc: string; at: string }[] = [];
    out.push({
      id: 'created',
      icon: 'paper-plane-outline',
      title: complaintsText('timelineReceivedTitle'),
      desc: complaintsText('timelineReceivedDesc'),
      at: row.created_at,
    });
    out.push({
      id: 'status',
      icon: 'pulse-outline',
      title: complaintStatusLabel(row.status),
      desc: complaintsText('timelineStatusDesc'),
      at: row.updated_at,
    });
    if (row.reviewed_at) {
      out.push({
        id: 'reviewed',
        icon: 'shield-checkmark-outline',
        title: complaintsText('timelineManagerReviewingTitle'),
        desc: guestComplaintTimelineManagerDesc(managerName),
        at: row.reviewed_at,
      });
    }
    if (row.admin_note?.trim()) {
      out.push({
        id: 'note',
        icon: 'chatbox-ellipses-outline',
        title: complaintsText('timelineAdminNoteTitle'),
        desc: row.admin_note.trim(),
        at: row.updated_at,
      });
    }
    return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [row, managerName]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={premium.accent ?? '#7C5CFF'} />
      </View>
    );
  }

  if (!row) {
    return (
      <View style={styles.centered}>
        <GlassSurface style={styles.notFoundCard} borderRadius={20}>
          <Ionicons name="document-text-outline" size={36} color={palette.muted} />
          <Text style={styles.emptyText}>{complaintsText('detailNotFound')}</Text>
        </GlassSurface>
      </View>
    );
  }

  const headerGradient = statusGradient(row.status, isNight);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={premium.accent ?? '#7C5CFF'}
        />
      }
    >
      <LinearGradient colors={headerGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>{complaintTypeLabel(row.topic_type)}</Text>
          </View>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{complaintStatusLabel(row.status)}</Text>
          </View>
        </View>
        <Text style={styles.heroCategory}>{complaintCategoryLabel(row.category)}</Text>
        <Text style={styles.heroDesc}>{row.description}</Text>
        <View style={styles.heroMeta}>
          <Ionicons name="calendar-outline" size={14} color="rgba(255,255,255,0.85)" />
          <Text style={styles.heroMetaText}>
            {complaintsText('createdAtLabel')}: {new Date(row.created_at).toLocaleString(loc)}
          </Text>
        </View>
        {row.room_number ? (
          <View style={styles.heroChipRow}>
            <View style={styles.heroChip}>
              <Ionicons name="bed-outline" size={13} color="#fff" />
              <Text style={styles.heroChipText}>{row.room_number}</Text>
            </View>
          </View>
        ) : null}
      </LinearGradient>

      {row.image_url ? (
        <GlassSurface style={styles.imageCard} borderRadius={18}>
          <CachedImage uri={row.image_url} style={styles.image} contentFit="cover" />
        </GlassSurface>
      ) : null}

      {row.admin_note?.trim() ? (
        <GlassSurface style={styles.noteCard} borderRadius={18} strong>
          <View style={styles.noteHead}>
            <LinearGradient colors={['#7C5CFF', '#B86EFF']} style={styles.noteIcon}>
              <Ionicons name="chatbubble-ellipses" size={16} color="#fff" />
            </LinearGradient>
            <Text style={styles.noteTitle}>{complaintsText('timelineAdminNoteTitle')}</Text>
          </View>
          <Text style={styles.noteBody}>{row.admin_note.trim()}</Text>
        </GlassSurface>
      ) : null}

      <GlassSurface style={styles.managerCard} borderRadius={18}>
        {row.reviewed_by?.profile_image ? (
          <CachedImage uri={row.reviewed_by.profile_image} style={styles.avatar} contentFit="cover" />
        ) : (
          <LinearGradient colors={['#6366F1', '#8B5CF6']} style={styles.avatarFallback}>
            <Text style={styles.avatarText}>{managerName.charAt(0).toUpperCase()}</Text>
          </LinearGradient>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.managerTitle}>{complaintsText('timelineManagerReviewingTitle')}</Text>
          <Text style={styles.managerName}>{managerName}</Text>
        </View>
        <Ionicons name="shield-checkmark" size={22} color={isNight ? '#A78BFA' : '#6366F1'} />
      </GlassSurface>

      <Text style={styles.sectionTitle}>{complaintsText('flowSectionTitle')}</Text>
      <GlassSurface style={styles.timeline} borderRadius={18}>
        {timeline.map((item, index) => (
          <View key={item.id} style={styles.timelineRow}>
            <View style={styles.timelineRail}>
              <View style={styles.timelineIconWrap}>
                <Ionicons name={item.icon} size={15} color={isNight ? '#C4B5FD' : '#6366F1'} />
              </View>
              {index < timeline.length - 1 ? <View style={styles.timelineLine} /> : null}
            </View>
            <View style={[styles.timelineContent, index < timeline.length - 1 && styles.timelineContentSpaced]}>
              <Text style={styles.timelineTitle}>{item.title}</Text>
              <Text style={styles.timelineDesc}>{item.desc}</Text>
              <Text style={styles.timelineAt}>
                {formatFeedRelativeTime(item.at)} · {new Date(item.at).toLocaleString(loc)}
              </Text>
            </View>
          </View>
        ))}
      </GlassSurface>
    </ScrollView>
  );
}

function createDetailStyles(p: PersonelDesignPalette, isNight: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: p.pageBg },
    content: { padding: 14, paddingBottom: 36 },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.pageBg,
      padding: 24,
    },
    notFoundCard: { padding: 28, alignItems: 'center', gap: 12, width: '100%' },
    emptyText: { color: p.subtext, fontSize: 14, textAlign: 'center' },
    hero: {
      borderRadius: 22,
      padding: 18,
      overflow: 'hidden',
    },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    heroBadge: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.2)',
    },
    heroBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
    livePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: 'rgba(0,0,0,0.15)',
      flexShrink: 1,
    },
    liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
    liveText: { color: '#fff', fontSize: 11, fontWeight: '700', flexShrink: 1 },
    heroCategory: { marginTop: 14, fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.88)' },
    heroDesc: { marginTop: 8, fontSize: 16, fontWeight: '600', color: '#fff', lineHeight: 24 },
    heroMeta: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
    heroMetaText: { fontSize: 12, color: 'rgba(255,255,255,0.85)' },
    heroChipRow: { marginTop: 12, flexDirection: 'row', gap: 8 },
    heroChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.16)',
    },
    heroChipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    imageCard: { marginTop: 12, overflow: 'hidden' },
    image: { width: '100%', height: 200 },
    noteCard: { marginTop: 12, padding: 14 },
    noteHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    noteIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    noteTitle: { fontSize: 14, fontWeight: '800', color: p.text },
    noteBody: { marginTop: 10, fontSize: 14, color: p.text, lineHeight: 22 },
    managerCard: {
      marginTop: 12,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    avatar: { width: 48, height: 48, borderRadius: 16 },
    avatarFallback: {
      width: 48,
      height: 48,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { fontSize: 18, fontWeight: '800', color: '#fff' },
    managerTitle: { fontSize: 12, fontWeight: '600', color: p.muted },
    managerName: { marginTop: 2, fontSize: 16, fontWeight: '800', color: p.text },
    sectionTitle: { marginTop: 18, marginBottom: 10, marginLeft: 4, fontSize: 16, fontWeight: '800', color: p.text },
    timeline: { paddingVertical: 8, paddingHorizontal: 4 },
    timelineRow: { flexDirection: 'row', paddingHorizontal: 10 },
    timelineRail: { width: 32, alignItems: 'center' },
    timelineIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isNight ? 'rgba(124,92,255,0.18)' : 'rgba(99,102,241,0.12)',
    },
    timelineLine: {
      flex: 1,
      width: 2,
      minHeight: 24,
      backgroundColor: isNight ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
      marginVertical: 4,
    },
    timelineContent: { flex: 1, paddingBottom: 4 },
    timelineContentSpaced: { paddingBottom: 16 },
    timelineTitle: { fontSize: 13, fontWeight: '800', color: p.text },
    timelineDesc: { marginTop: 3, fontSize: 13, color: p.subtext, lineHeight: 19 },
    timelineAt: { marginTop: 5, fontSize: 11, color: p.muted },
  });
}
