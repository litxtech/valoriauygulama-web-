import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Dimensions,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Video, ResizeMode } from 'expo-av';
import { CachedImage } from '@/components/CachedImage';
import { getFacilityJournalRecord, type FacilityJournalRecordRow } from '@/lib/facilityJournal';
import { theme } from '@/constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');

export default function CustomerFacilityJournalDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [record, setRecord] = useState<FacilityJournalRecordRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error: err } = await getFacilityJournalRecord(id);
    if (err || !data) {
      setError(err?.message ?? 'Kayıt bulunamadı veya erişim yok.');
      setRecord(null);
    } else {
      setError(null);
      setRecord(data as FacilityJournalRecordRow);
    }
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (!record) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? 'Kayıt yüklenemedi.'}</Text>
      </View>
    );
  }

  const media = [...(record.media ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <Text style={styles.ref}>{record.reference_code}</Text>
      <Text style={styles.title}>{record.title}</Text>
      <Text style={styles.meta}>
        {record.type?.name ?? '—'} · {record.record_date}
      </Text>

      {record.description ? <Text style={styles.body}>{record.description}</Text> : null}
      {record.location_detail ? (
        <Text style={styles.field}>
          <Text style={styles.fieldLabel}>Konum: </Text>
          {record.location_detail}
        </Text>
      ) : null}
      {record.counterparty_name ? (
        <Text style={styles.field}>
          <Text style={styles.fieldLabel}>Taraf: </Text>
          {record.counterparty_name}
        </Text>
      ) : null}

      <Text style={styles.sectionTitle}>Medya</Text>
      {media.length === 0 ? (
        <Text style={styles.hint}>Ek medya yok.</Text>
      ) : (
        media.map((m) => (
          <View key={m.id} style={styles.mediaBlock}>
            {m.media_type === 'video' ? (
              <Video
                source={{ uri: m.public_url }}
                style={styles.video}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
              />
            ) : (
              <TouchableOpacity onPress={() => Linking.openURL(m.public_url)}>
                <CachedImage uri={m.public_url} style={styles.image} contentFit="contain" />
              </TouchableOpacity>
            )}
            <Text style={styles.mediaLabel}>
              {m.label === 'before' ? 'Önce' : m.label === 'after' ? 'Sonra' : 'Genel'}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { textAlign: 'center', color: theme.colors.textMuted, fontSize: 15 },
  ref: { fontSize: 13, color: theme.colors.textMuted, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '700', color: theme.colors.text, marginTop: 4 },
  meta: { fontSize: 14, color: theme.colors.textMuted, marginTop: 6, marginBottom: 12 },
  body: { fontSize: 16, color: theme.colors.text, lineHeight: 24, marginBottom: 12 },
  field: { fontSize: 15, color: theme.colors.text, marginBottom: 6 },
  fieldLabel: { fontWeight: '600' },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginTop: 20, marginBottom: 8, color: theme.colors.text },
  hint: { fontSize: 13, color: theme.colors.textMuted },
  mediaBlock: { marginBottom: 16 },
  image: { width: SCREEN_W - 32, height: 220, borderRadius: 10, backgroundColor: '#e2e8f0' },
  video: { width: SCREEN_W - 32, height: 220, borderRadius: 10, backgroundColor: '#0f172a' },
  mediaLabel: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
});
