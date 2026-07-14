import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Image,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import {
  getSecurityCameraRecording,
  deleteSecurityCameraRecording,
  type SecurityCameraRecordingRow,
  type SecurityCameraRecordingMediaRow,
} from '@/lib/securityCameraRecordings';

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export default function SecurityRecordingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const isAdmin = staff?.role === 'admin';

  const [record, setRecord] = useState<SecurityCameraRecordingRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error } = await getSecurityCameraRecording(id);
    if (!error && data) {
      const row = data as Record<string, unknown>;
      const creatorRaw = row.creator as { full_name: string | null } | { full_name: string | null }[] | null;
      const creator = Array.isArray(creatorRaw) ? creatorRaw[0] ?? null : creatorRaw ?? null;
      setRecord({ ...(row as unknown as SecurityCameraRecordingRow), creator });
    } else if (!error) {
      setRecord(null);
    }
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const canManage = isAdmin || (!!record && record.created_by_staff_id === staff?.id);

  const openMedia = async (m: SecurityCameraRecordingMediaRow) => {
    try {
      await Linking.openURL(m.public_url);
    } catch {
      Alert.alert('Hata', 'Medya açılamadı.');
    }
  };

  const onDelete = () => {
    if (!record || busy) return;
    Alert.alert('Kaydı sil', 'Bu kamera kaydı silinsin mi?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const { error } = await deleteSecurityCameraRecording(record.id);
            if (error) throw error;
            router.replace('/staff/security-recordings' as never);
          } catch (e) {
            Alert.alert('Hata', (e as Error)?.message ?? 'Silinemedi');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (!record) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Kayıt bulunamadı.</Text>
      </View>
    );
  }

  const media = [...(record.media ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.recordNo}>{record.record_no ?? ''}</Text>
      <Text style={styles.title}>{record.title}</Text>

      <View style={styles.metaCard}>
        <Text style={styles.metaLine}>Kamera: {record.camera_label || '—'}</Text>
        <Text style={styles.metaLine}>Konum: {record.location_label || '—'}</Text>
        <Text style={styles.metaLine}>Kayıt zamanı: {formatDateTime(record.recorded_at)}</Text>
        <Text style={styles.metaLine}>Yükleyen: {record.creator?.full_name || '—'}</Text>
        <Text style={styles.metaLine}>Yükleme: {formatDateTime(record.created_at)}</Text>
      </View>

      {record.note ? (
        <View style={styles.noteCard}>
          <Text style={styles.noteLabel}>Not</Text>
          <Text style={styles.noteText}>{record.note}</Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Medya</Text>
      <View style={styles.mediaGrid}>
        {media.map((m) => (
          <TouchableOpacity key={m.id} style={styles.mediaItem} onPress={() => void openMedia(m)}>
            <Image source={{ uri: m.thumbnail_url || m.public_url }} style={styles.mediaThumb} />
            {m.media_type === 'video' ? (
              <View style={styles.playOverlay}>
                <Ionicons name="play-circle" size={36} color="#fff" />
              </View>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>

      {canManage ? (
        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.deleteText}>Kaydı sil</Text>}
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
  muted: { color: '#64748b' },
  recordNo: { fontSize: 13, fontWeight: '700', color: '#0f766e', marginBottom: 4 },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a', marginBottom: 14 },
  metaCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  metaLine: { fontSize: 14, color: '#475569' },
  noteCard: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  noteLabel: { fontWeight: '700', color: '#334155', marginBottom: 6 },
  noteText: { fontSize: 15, color: '#0f172a', lineHeight: 22 },
  sectionTitle: { marginTop: 20, marginBottom: 10, fontWeight: '800', color: '#0f172a', fontSize: 16 },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  mediaItem: {
    width: '47%',
    aspectRatio: 16 / 10,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#e2e8f0',
  },
  mediaThumb: { width: '100%', height: '100%' },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  deleteBtn: {
    marginTop: 28,
    backgroundColor: '#dc2626',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  deleteText: { color: '#fff', fontWeight: '800' },
});
