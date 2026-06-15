import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';
import { CachedImage } from '@/components/CachedImage';
import { auditScoreColor, auditScoreLabel, fetchAuditSessionDetail } from '@/lib/audit';
import { AuditMediaPreviewModal } from '@/components/AuditMediaPreviewModal';

function auditScoreTone(score: number | null | undefined): string {
  const s = score ?? 0;
  if (s >= 85) return 'Mükemmel';
  if (s >= 70) return 'Dikkatli';
  return 'Kritik';
}

export default function AuditSessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchAuditSessionDetail>> | null>(null);
  const [previewMedia, setPreviewMedia] = useState<{ type: 'image' | 'video'; url: string } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const d = await fetchAuditSessionDetail(id);
    setDetail(d);
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading || !detail?.session) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={adminTheme.colors.accent} />
      </View>
    );
  }

  const s = detail.session;
  const cat = s.category as { name?: string } | null;
  const auditorName = (s.auditor as { full_name?: string } | null)?.full_name ?? 'Denetçi';
  const mediaByItemId = new Map<string, typeof detail.media>();
  const sessionMedia = detail.media.filter((m) => !m.session_item_id);
  const criticalPenaltyCount = detail.items.filter(
    (it) => !!it.criterion?.is_critical && it.points_awarded < it.max_points
  ).length;
  const lostTotal = detail.items.reduce((sum, it) => sum + Math.max(0, it.max_points - it.points_awarded), 0);
  const scoreTone = auditScoreTone(s.session_score);
  for (const m of detail.media) {
    if (!m.session_item_id) continue;
    const list = mediaByItemId.get(m.session_item_id) ?? [];
    list.push(m);
    mediaByItemId.set(m.session_item_id, list);
  }

  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <AdminCard style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View style={styles.shield}>
            <Ionicons name="shield-checkmark" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{cat?.name ?? 'Denetim'}</Text>
            <Text style={styles.muted}>
              {new Date(s.conducted_at).toLocaleString('tr-TR')}
              {' · '}
              {auditorName}
            </Text>
          </View>
          <View style={[styles.scorePill, { borderColor: auditScoreColor(s.session_score) + '66' }]}>
            <Text style={[styles.scorePillValue, { color: auditScoreColor(s.session_score) }]}>
              {auditScoreLabel(s.session_score)}
            </Text>
            <Text style={styles.scorePillSub}>{scoreTone}</Text>
          </View>
        </View>
        <View style={styles.metricRow}>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Kayıp puan</Text>
            <Text style={styles.metricValue}>{lostTotal}</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Kritik ihlal</Text>
            <Text style={[styles.metricValue, { color: criticalPenaltyCount > 0 ? adminTheme.colors.error : adminTheme.colors.success }]}>
              {criticalPenaltyCount}
            </Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Kanıt</Text>
            <Text style={styles.metricValue}>{detail.media.length}</Text>
          </View>
        </View>
        {s.area_note ? <Text style={styles.note}>{s.area_note}</Text> : null}
      </AdminCard>

      <AdminCard>
        <Text style={styles.title}>{cat?.name ?? 'Denetim'}</Text>
        <Text style={styles.muted}>Denetimi yapan: {auditorName}</Text>
      </AdminCard>

      <Text style={styles.section}>Personel</Text>
      {detail.staff.map((st) => (
        <AdminCard key={st.staff_id} style={styles.row}>
          <Text style={styles.rowTitle}>{st.full_name ?? '—'}</Text>
          <Text style={styles.muted}>{st.role === 'responsible' ? 'Sorumlu' : 'Yardımcı'}</Text>
        </AdminCard>
      ))}

      <Text style={styles.section}>Kriterler</Text>
      {detail.items.map((it) => {
        const lost = it.max_points - it.points_awarded;
        const itemMedia = mediaByItemId.get(it.id) ?? [];
        return (
          <AdminCard key={it.id} style={styles.row}>
            <Text style={styles.rowTitle}>{it.criterion?.title ?? 'Kriter'}</Text>
            <Text
              style={{
                fontWeight: '700',
                color: lost > 0 ? adminTheme.colors.error : adminTheme.colors.success,
              }}
            >
              {it.points_awarded}/{it.max_points}
              {lost > 0 ? ` (−${lost})` : ''}
            </Text>
            {it.comment ? <Text style={styles.muted}>{it.comment}</Text> : null}
            {itemMedia.length > 0 ? (
              <View style={styles.itemMediaBlock}>
                <Text style={styles.itemMediaLabel}>Kanıt</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {itemMedia.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      onPress={() => setPreviewMedia({ type: m.media_type === 'video' ? 'video' : 'image', url: m.url })}
                    >
                      {m.media_type === 'image' ? (
                        <CachedImage uri={m.url} style={styles.mediaThumb} />
                      ) : (
                        <View style={[styles.mediaThumb, styles.videoBox]}>
                          <Ionicons name="play-circle" size={32} color="#fff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </AdminCard>
        );
      })}

      {sessionMedia.length > 0 ? (
        <>
          <Text style={styles.section}>Genel medya</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {sessionMedia.map((m) => (
              <TouchableOpacity
                key={m.id}
                onPress={() => setPreviewMedia({ type: m.media_type === 'video' ? 'video' : 'image', url: m.url })}
              >
                {m.media_type === 'image' ? (
                  <CachedImage uri={m.url} style={styles.mediaThumb} />
                ) : (
                  <View style={[styles.mediaThumb, styles.videoBox]}>
                    <Ionicons name="play-circle" size={36} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      ) : null}

      <AuditMediaPreviewModal visible={!!previewMedia} media={previewMedia} onClose={() => setPreviewMedia(null)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: adminTheme.colors.text },
  heroCard: { marginBottom: 10 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shield: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: adminTheme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scorePill: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'flex-end',
    backgroundColor: adminTheme.colors.surfaceTertiary,
  },
  scorePillValue: { fontSize: 16, fontWeight: '800' },
  scorePillSub: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 1 },
  metricRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  metricBox: {
    flex: 1,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.borderLight,
  },
  metricLabel: { fontSize: 11, color: adminTheme.colors.textMuted, textTransform: 'uppercase', fontWeight: '700' },
  metricValue: { fontSize: 17, fontWeight: '800', color: adminTheme.colors.text, marginTop: 4 },
  muted: { fontSize: 14, color: adminTheme.colors.textMuted },
  note: { marginTop: 12, fontSize: 14, color: adminTheme.colors.text, lineHeight: 20 },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: adminTheme.colors.textSecondary,
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  row: { marginBottom: 8 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  itemMediaBlock: { marginTop: 10 },
  itemMediaLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: adminTheme.colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  mediaThumb: { width: 96, height: 96, borderRadius: 10, marginRight: 10 },
  videoBox: { backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center' },
});
