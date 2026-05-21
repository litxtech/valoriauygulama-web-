import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Linking, TouchableOpacity } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';
import { CachedImage } from '@/components/CachedImage';
import { auditScoreColor, auditScoreLabel, fetchAuditSessionDetail } from '@/lib/audit';

export default function AuditSessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchAuditSessionDetail>> | null>(null);

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

  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <AdminCard>
        <Text style={styles.title}>{cat?.name ?? 'Denetim'}</Text>
        <Text style={[styles.score, { color: auditScoreColor(s.session_score) }]}>
          {auditScoreLabel(s.session_score)}
        </Text>
        <Text style={styles.muted}>
          {new Date(s.conducted_at).toLocaleString('tr-TR')}
          {' · '}
          {(s.auditor as { full_name?: string } | null)?.full_name ?? 'Denetçi'}
        </Text>
        {s.area_note ? <Text style={styles.note}>{s.area_note}</Text> : null}
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
          </AdminCard>
        );
      })}

      {detail.media.length > 0 ? (
        <>
          <Text style={styles.section}>Medya</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {detail.media.map((m) => (
              <TouchableOpacity key={m.id} onPress={() => Linking.openURL(m.url)}>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: adminTheme.colors.text },
  score: { fontSize: 32, fontWeight: '800', marginVertical: 8 },
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
  mediaThumb: { width: 120, height: 120, borderRadius: 10, marginRight: 10 },
  videoBox: { backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center' },
});
