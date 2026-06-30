import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import type { PersonelDesignPalette } from '@/constants/personelDesignSystem';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
import { GlassSurface } from '@/components/premium/GlassSurface';
import { PressableScale } from '@/components/premium/PressableScale';
import { getOrCreateGuestForCurrentSession, getSessionOrRefreshOnce } from '@/lib/getOrCreateGuestForCaller';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from 'react-i18next';
import { formatFeedRelativeTime } from '@/lib/feedRelativeTime';
import {
  complaintsText,
  complaintStatusLabel,
  complaintTypeLabel,
  complaintCategoryLabel,
  complaintsLocaleTag,
} from '@/lib/complaintsI18n';
import { runAfterUiReady } from '@/lib/runAfterUiReady';

type ComplaintRow = {
  id: string;
  topic_type: 'complaint' | 'suggestion' | 'thanks';
  category: string;
  status: string;
  created_at: string;
  description: string;
};

type TopicVisual = {
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  gradient: [string, string];
};

type StatusVisual = {
  bg: string;
  text: string;
  dot: string;
};

function topicVisual(type: string): TopicVisual {
  if (type === 'suggestion') {
    return { icon: 'bulb-outline', accent: '#8B5CF6', gradient: ['#7C3AED', '#A78BFA'] };
  }
  if (type === 'thanks') {
    return { icon: 'heart-outline', accent: '#10B981', gradient: ['#059669', '#34D399'] };
  }
  return { icon: 'alert-circle-outline', accent: '#EF4444', gradient: ['#DC2626', '#F87171'] };
}

function statusVisual(status: string, isNight: boolean): StatusVisual {
  const map: Record<string, StatusVisual> = {
    pending: {
      bg: isNight ? 'rgba(245,158,11,0.16)' : '#FEF3C7',
      text: isNight ? '#FBBF24' : '#B45309',
      dot: '#F59E0B',
    },
    reviewing: {
      bg: isNight ? 'rgba(59,130,246,0.16)' : '#DBEAFE',
      text: isNight ? '#60A5FA' : '#1D4ED8',
      dot: '#3B82F6',
    },
    taken_for_review: {
      bg: isNight ? 'rgba(59,130,246,0.16)' : '#DBEAFE',
      text: isNight ? '#60A5FA' : '#1D4ED8',
      dot: '#2563EB',
    },
    solution_in_progress: {
      bg: isNight ? 'rgba(124,92,255,0.18)' : '#EDE9FE',
      text: isNight ? '#A78BFA' : '#6D28D9',
      dot: '#7C3AED',
    },
    resolved: {
      bg: isNight ? 'rgba(34,197,94,0.16)' : '#D1FAE5',
      text: isNight ? '#4ADE80' : '#047857',
      dot: '#10B981',
    },
    unresolved: {
      bg: isNight ? 'rgba(239,68,68,0.16)' : '#FEE2E2',
      text: isNight ? '#F87171' : '#B91C1C',
      dot: '#EF4444',
    },
    rejected: {
      bg: isNight ? 'rgba(156,163,175,0.16)' : '#F3F4F6',
      text: isNight ? '#9CA3AF' : '#4B5563',
      dot: '#6B7280',
    },
  };
  return map[status] ?? map.pending;
}

function isActiveStatus(status: string): boolean {
  return ['pending', 'reviewing', 'taken_for_review', 'solution_in_progress'].includes(status);
}

export default function CustomerComplaintsTab() {
  useTranslation();
  const loc = complaintsLocaleTag();
  const router = useRouter();
  const palette = usePersonelDesign();
  const { isNight, colors: premium } = usePremiumTheme();
  const staffCheckComplete = useAuthStore((s) => s.staffCheckComplete);
  const styles = useMemo(() => createComplaintsStyles(palette, isNight), [palette, isNight]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [list, setList] = useState<ComplaintRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!staffCheckComplete) return;
    setLoadError(null);
    const session = await getSessionOrRefreshOnce();
    const guest = await getOrCreateGuestForCurrentSession();
    if (!guest?.guest_id) {
      // Misafir kimliği bir an için çözülemediyse (yavaş RPC / odak yenilemesi) mevcut
      // listeyi SİLME; aksi halde liste kaybolur sonra geri gelir.
      return;
    }
    const guestIds = new Set<string>([guest.guest_id]);
    if (session?.user?.id) {
      const { data: linkedGuests } = await supabase
        .from('guests')
        .select('id')
        .eq('auth_user_id', session.user.id);
      for (const row of linkedGuests ?? []) {
        if (row?.id) guestIds.add(row.id);
      }
    }
    const { data, error } = await supabase
      .from('guest_complaints')
      .select('id, topic_type, category, status, created_at, description')
      .in('guest_id', [...guestIds])
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) {
      // Geçici sorgu hatasında mevcut listeyi koru (boş ekran flaşını önle).
      setLoadError(error.message);
      return;
    }
    setList((data as ComplaintRow[]) ?? []);
  }, [staffCheckComplete]);

  useEffect(() => {
    if (!staffCheckComplete) return;
    load().finally(() => setLoading(false));
  }, [load, staffCheckComplete]);

  useFocusEffect(
    useCallback(() => {
      if (!staffCheckComplete) return;
      const task = runAfterUiReady(() => void load(), { androidOnly: false });
      return () => task.cancel();
    }, [load, staffCheckComplete])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const activeCount = useMemo(
    () => list.filter((item) => isActiveStatus(item.status)).length,
    [list]
  );

  const heroGradient = isNight
    ? (['#312E81', '#4C1D95', '#1E1B4B'] as [string, string, string])
    : (['#6366F1', '#8B5CF6', '#A855F7'] as [string, string, string]);

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
      <LinearGradient colors={heroGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroGlow} pointerEvents="none" />
        <View style={styles.heroIconWrap}>
          <Ionicons name="shield-checkmark" size={28} color="#fff" />
        </View>
        <Text style={styles.heroTitle}>{complaintsText('complaintsSystem')}</Text>
        <Text style={styles.heroText}>{complaintsText('complaintSystemDesc')}</Text>
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{list.length}</Text>
            <Text style={styles.heroStatLabel}>{complaintsText('myRecentReports')}</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{activeCount}</Text>
            <Text style={styles.heroStatLabel}>{complaintsText('complaintsTab')}</Text>
          </View>
        </View>
      </LinearGradient>

      <PressableScale style={styles.ctaWrap} onPress={() => router.push('/customer/complaints/new')}>
        <LinearGradient
          colors={isNight ? ['#7C5CFF', '#B86EFF'] : ['#EF4444', '#F97316']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.cta}
        >
          <View style={styles.ctaIcon}>
            <Ionicons name="add" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.ctaText}>{complaintsText('newReport')}</Text>
            <Text style={styles.ctaSub}>{complaintsText('sentToAdmin')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.85)" />
        </LinearGradient>
      </PressableScale>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{complaintsText('myRecentReports')}</Text>
        {list.length > 0 ? (
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{complaintsText('flowSectionTitle')}</Text>
          </View>
        ) : null}
      </View>

      {loading && list.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={premium.accent ?? '#7C5CFF'} />
        </View>
      ) : list.length === 0 ? (
        <GlassSurface style={styles.emptyCard} borderRadius={20}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="chatbubbles-outline" size={32} color={palette.muted} />
          </View>
          <Text style={styles.emptyTitle}>
            {loadError ? complaintsText('error') : complaintsText('noReports')}
          </Text>
          <Text style={styles.emptyText}>
            {loadError ?? complaintsText('complaintSystemDesc')}
          </Text>
        </GlassSurface>
      ) : (
        list.map((item) => {
          const topic = topicVisual(item.topic_type);
          const status = statusVisual(item.status, isNight);
          const active = isActiveStatus(item.status);
          return (
            <PressableScale
              key={item.id}
              onPress={() => router.push(`/customer/complaints/${item.id}`)}
              style={styles.cardWrap}
            >
              <GlassSurface style={styles.card} borderRadius={18}>
                <View style={[styles.cardAccent, { backgroundColor: status.dot }]} />
                <View style={styles.cardBody}>
                  <View style={styles.cardTop}>
                    <LinearGradient colors={topic.gradient} style={styles.typeIcon}>
                      <Ionicons name={topic.icon} size={18} color="#fff" />
                    </LinearGradient>
                    <View style={styles.cardHeadText}>
                      <Text style={styles.type}>{complaintTypeLabel(item.topic_type)}</Text>
                      <Text style={styles.category}>{complaintCategoryLabel(item.category)}</Text>
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
                      {active ? <View style={[styles.statusDot, { backgroundColor: status.dot }]} /> : null}
                      <Text style={[styles.statusText, { color: status.text }]} numberOfLines={1}>
                        {complaintStatusLabel(item.status)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.desc} numberOfLines={2}>
                    {item.description}
                  </Text>
                  <View style={styles.cardFooter}>
                    <View style={styles.dateRow}>
                      <Ionicons name="time-outline" size={13} color={palette.muted} />
                      <Text style={styles.date}>{formatFeedRelativeTime(item.created_at)}</Text>
                      <Text style={styles.dateSep}>·</Text>
                      <Text style={styles.dateFull}>
                        {new Date(item.created_at).toLocaleDateString(loc)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={palette.muted} />
                  </View>
                </View>
              </GlassSurface>
            </PressableScale>
          );
        })
      )}
    </ScrollView>
  );
}

function createComplaintsStyles(p: PersonelDesignPalette, isNight: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: p.pageBg },
    content: { paddingBottom: 36 },
    hero: {
      marginHorizontal: 14,
      marginTop: 8,
      borderRadius: 24,
      padding: 20,
      overflow: 'hidden',
    },
    heroGlow: {
      position: 'absolute',
      top: -40,
      right: -20,
      width: 140,
      height: 140,
      borderRadius: 70,
      backgroundColor: 'rgba(255,255,255,0.12)',
    },
    heroIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    heroTitle: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
    heroText: { marginTop: 8, fontSize: 14, color: 'rgba(255,255,255,0.88)', lineHeight: 21 },
    heroStats: {
      marginTop: 18,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    heroStat: { flex: 1, alignItems: 'center' },
    heroStatValue: { fontSize: 22, fontWeight: '800', color: '#fff' },
    heroStatLabel: {
      marginTop: 2,
      fontSize: 11,
      fontWeight: '600',
      color: 'rgba(255,255,255,0.78)',
      textAlign: 'center',
    },
    heroStatDivider: {
      width: 1,
      height: 32,
      backgroundColor: 'rgba(255,255,255,0.2)',
    },
    ctaWrap: { marginHorizontal: 14, marginTop: 14 },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 18,
    },
    ctaIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    ctaSub: { marginTop: 2, color: 'rgba(255,255,255,0.82)', fontSize: 11, lineHeight: 15 },
    sectionHead: {
      marginTop: 22,
      marginBottom: 10,
      marginHorizontal: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitle: { fontSize: 17, fontWeight: '800', color: p.text, letterSpacing: -0.2 },
    livePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: isNight ? 'rgba(124,92,255,0.16)' : 'rgba(99,102,241,0.1)',
    },
    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: isNight ? '#A78BFA' : '#6366F1',
    },
    liveText: {
      fontSize: 10,
      fontWeight: '700',
      color: isNight ? '#C4B5FD' : '#4F46E5',
      maxWidth: 120,
    },
    loadingWrap: { paddingVertical: 40, alignItems: 'center' },
    emptyCard: { marginHorizontal: 14, padding: 28, alignItems: 'center' },
    emptyIconWrap: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor: isNight ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    emptyTitle: { fontSize: 16, fontWeight: '800', color: p.text, textAlign: 'center' },
    emptyText: {
      marginTop: 8,
      fontSize: 13,
      color: p.subtext,
      textAlign: 'center',
      lineHeight: 20,
    },
    cardWrap: { marginHorizontal: 14, marginBottom: 12 },
    card: { overflow: 'hidden' },
    cardAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
    cardBody: { padding: 14, paddingLeft: 16 },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    typeIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardHeadText: { flex: 1, minWidth: 0, paddingTop: 2 },
    type: { fontSize: 14, fontWeight: '800', color: p.text },
    category: { marginTop: 2, fontSize: 11, fontWeight: '600', color: p.muted },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      maxWidth: '42%',
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 999,
    },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusText: { fontSize: 10, fontWeight: '800', flexShrink: 1 },
    desc: { marginTop: 12, fontSize: 14, color: p.subtext, lineHeight: 21 },
    cardFooter: {
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
    date: { fontSize: 11, fontWeight: '600', color: p.muted },
    dateSep: { fontSize: 11, color: p.muted },
    dateFull: { fontSize: 11, color: p.muted },
  });
}
