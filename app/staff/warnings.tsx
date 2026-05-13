import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { CachedImage } from '@/components/CachedImage';
import {
  type StaffPersonnelWarningSeverity,
  SEVERITY_LABEL_TR,
  notificationTitleForSeverity,
} from '@/lib/staffPersonnelWarnings';

const SCREEN_W = Dimensions.get('window').width;

type Row = {
  id: string;
  severity: StaffPersonnelWarningSeverity;
  subject_line: string | null;
  body: string;
  created_at: string;
  acknowledged_at: string | null;
  acknowledgement_note: string | null;
  image_urls: unknown;
};

function imageList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
}

export default function StaffPersonnelWarningsScreen() {
  const { staff } = useAuthStore();
  const focusRaw = useLocalSearchParams<{ focus?: string | string[] }>().focus;
  const focus = Array.isArray(focusRaw) ? focusRaw[0] : focusRaw;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!staff?.id) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('staff_personnel_warnings')
      .select('id, severity, subject_line, body, created_at, acknowledged_at, acknowledgement_note, image_urls')
      .eq('subject_staff_id', staff.id)
      .order('created_at', { ascending: false })
      .limit(80);
    if (error) {
      setRows([]);
    } else {
      setRows(((data ?? []) as unknown) as Row[]);
    }
    setLoading(false);
  }, [staff?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const severityStyle = (s: StaffPersonnelWarningSeverity) => {
    switch (s) {
      case 'reminder':
        return { bg: '#fffbeb', border: '#f59e0b', accent: '#d97706', fg: '#78350f', chip: '#fef3c7' };
      case 'verbal':
        return { bg: '#fff7ed', border: '#fb923c', accent: '#ea580c', fg: '#7c2d12', chip: '#ffedd5' };
      case 'written':
        return { bg: '#fef2f2', border: '#f87171', accent: '#dc2626', fg: '#7f1d1d', chip: '#fee2e2' };
      case 'severe':
        return { bg: '#fef2f2', border: '#ef4444', accent: '#b91c1c', fg: '#450a0a', chip: '#fecaca' };
      case 'final':
        return { bg: '#18181b', border: '#f87171', accent: '#fecaca', fg: '#fef2f2', chip: '#27272a' };
      default:
        return { bg: '#f4f4f5', border: '#a1a1aa', accent: '#52525b', fg: '#18181b', chip: '#e4e4e7' };
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <Text style={styles.title}>Resmi uyarılarım</Text>
      <Text style={styles.sub}>
        Yönetimin gönderdiği uyarıların tamamı burada saklanır. Sözlü ve üzeri seviyede okunmamış uyarılar girişte tam
        ekran gösterilir; okuduğunuzda yöneticiye bildirim gider.
      </Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} size="large" color="#991b1b" />
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>Kayıtlı uyarı yok.</Text>
      ) : (
        rows.map((r) => {
          const st = severityStyle(r.severity);
          const highlight = !!focus && r.id === focus;
          const imgs = imageList(r.image_urls);
          const hasVisual = imgs.length > 0;

          return (
            <View
              key={r.id}
              style={[
                styles.card,
                { backgroundColor: st.bg, borderColor: st.border },
                highlight && styles.cardHighlight,
              ]}
            >
              <View style={[styles.cardAccent, { backgroundColor: st.accent }]} />
              <View style={styles.cardInner}>
                {hasVisual ? (
                  <View style={styles.visualCol}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      nestedScrollEnabled
                      style={styles.thumbStrip}
                    >
                      {imgs.map((uri) => (
                        <TouchableOpacity key={uri} activeOpacity={0.9} style={styles.thumbWrap}>
                          <CachedImage uri={uri} style={styles.thumb} contentFit="cover" />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    <View style={[styles.visualBadge, { backgroundColor: st.chip }]}>
                      <Ionicons name="images-outline" size={14} color={st.fg} />
                      <Text style={[styles.visualBadgeText, { color: st.fg }]}>{imgs.length} görsel</Text>
                    </View>
                  </View>
                ) : null}

                <View style={[styles.textCol, !hasVisual && styles.textColFull]}>
                  <View style={styles.cardHead}>
                    <Text style={[styles.cardTitle, { color: st.fg }]} numberOfLines={3}>
                      {r.subject_line?.trim() || notificationTitleForSeverity(r.severity)}
                    </Text>
                    <View style={[styles.miniBadge, { borderColor: st.border, backgroundColor: st.chip }]}>
                      <Text style={[styles.miniBadgeText, { color: st.fg }]}>{SEVERITY_LABEL_TR[r.severity]}</Text>
                    </View>
                  </View>
                  <Text style={[styles.cardMeta, { color: st.fg }]}>
                    {new Date(r.created_at).toLocaleString('tr-TR')}
                    {r.acknowledged_at
                      ? ` · Okundu: ${new Date(r.acknowledged_at).toLocaleString('tr-TR')}`
                      : ' · Okuma bekliyor'}
                  </Text>
                  <Text style={[styles.cardBody, { color: st.fg }]}>{r.body.trim()}</Text>
                  {r.acknowledgement_note?.trim() ? (
                    <View style={[styles.noteBox, { borderColor: st.border, backgroundColor: st.chip }]}>
                      <Text style={[styles.noteLabel, { color: st.accent }]}>Sizin notunuz</Text>
                      <Text style={[styles.noteText, { color: st.fg }]}>{r.acknowledgement_note.trim()}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a', marginBottom: 8, letterSpacing: -0.3 },
  sub: { fontSize: 14, color: '#64748b', lineHeight: 21, marginBottom: 18 },
  empty: { marginTop: 12, fontSize: 15, color: '#64748b' },
  card: {
    borderRadius: 18,
    borderWidth: 1.5,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  cardHighlight: {
    shadowColor: '#dc2626',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 8,
  },
  cardAccent: { height: 4, width: '100%' },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'stretch',
    padding: 14,
    gap: 14,
  },
  visualCol: {
    width: Math.min(148, SCREEN_W * 0.36),
    borderRadius: 14,
    overflow: 'hidden',
  },
  thumbStrip: { maxHeight: 200 },
  thumbWrap: {
    width: Math.min(148, SCREEN_W * 0.36),
    height: 200,
    borderRadius: 14,
    overflow: 'hidden',
    marginRight: 8,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  thumb: { width: '100%', height: '100%' },
  visualBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 8,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  visualBadgeText: { fontSize: 11, fontWeight: '700' },
  textCol: { flex: 1, minWidth: 0 },
  textColFull: { width: '100%' },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
  cardTitle: { flex: 1, fontSize: 17, fontWeight: '800', lineHeight: 22 },
  miniBadge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  miniBadgeText: { fontSize: 11, fontWeight: '800' },
  cardMeta: { fontSize: 12, marginBottom: 10, opacity: 0.92 },
  cardBody: { fontSize: 15, lineHeight: 24, fontWeight: '600' },
  noteBox: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  noteLabel: { fontSize: 11, fontWeight: '800', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 },
  noteText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
});
