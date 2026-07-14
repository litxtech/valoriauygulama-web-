import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { listCamerasForStaff, listCameraLogs } from '@/lib/cameras';
import { CameraStreamView } from '@/components/CameraStreamView';
import type { Camera, CameraLog } from '@/lib/cameras';
import { format, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';
import { useCachedList } from '@/hooks/useCachedList';

const COLS = 2;
const GAP = 12;
const PAD = 16;

function CameraCard({
  camera,
  onPress,
  cardWidth,
}: {
  camera: Camera;
  onPress: () => void;
  cardWidth: number;
}) {
  return (
    <TouchableOpacity
      style={[styles.card, { width: cardWidth }]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={styles.previewWrap}>
        <CameraStreamView camera={camera} useSubstream style={styles.preview} />
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>CANLI</Text>
        </View>
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={1}>{camera.name}</Text>
        {camera.location ? (
          <Text style={styles.cardLocation} numberOfLines={1}>{camera.location}</Text>
        ) : null}
      </View>
      <View style={styles.cardAction}>
        <Ionicons name="expand-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.cardActionText}>Büyüt</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function StaffCamerasScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { staff } = useAuthStore();
  const [myLogs, setMyLogs] = useState<CameraLog[]>([]);
  const cacheKey = staff?.id ? `staff-cameras:${staff.id}` : 'staff-cameras:none';

  const fetchItems = useCallback(async () => {
    if (!staff?.id) return [];
    return listCamerasForStaff(staff.id);
  }, [staff?.id]);

  const { items: cameras, refreshing, refresh } = useCachedList<Camera>({
    cacheKey,
    enabled: !!staff?.id,
    fetchItems,
  });

  useEffect(() => {
    if (!staff?.id) return;
    void listCameraLogs({ staffId: staff.id, limit: 10 }).then(setMyLogs);
  }, [staff?.id, cameras.length]);

  const cardWidth = (width - PAD * 2 - GAP) / COLS;

  const formatDuration = (sec: number | null) => {
    if (sec == null) return '';
    if (sec < 60) return `${sec} sn`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (s) return `${m} dk ${s} sn`;
    return `${m} dk`;
  };

  const ACTION_LABELS: Record<string, string> = {
    izleme_basladi: 'izledim',
    izleme_bitirdi: 'izledim',
    kayit_baslatti: 'Kayıt başlattım',
    kayit_durdurdu: 'Kayıt durdurdum',
    fotograf_cekti: 'Fotoğraf çektim',
    kayit_indirdi: 'Kayıt indirdim',
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={cameras}
        keyExtractor={(c) => c.id}
        numColumns={COLS}
        columnWrapperStyle={[styles.row, { gap: GAP }]}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} />
        }
        ListHeaderComponent={
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.uploadRecordingBtn}
              onPress={() => router.push('/staff/security-recordings/new' as never)}
              activeOpacity={0.9}
            >
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
              <Text style={styles.uploadRecordingBtnText}>Önemli kayıt yükle</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.archiveLink}
              onPress={() => router.push('/staff/security-recordings' as never)}
              activeOpacity={0.85}
            >
              <Text style={styles.archiveLinkText}>Yüklenen kayıtlar</Text>
              <Ionicons name="chevron-forward" size={16} color="#0f766e" />
            </TouchableOpacity>
            {cameras.length > 0 ? <Text style={styles.sectionTitle}>Yetkili kameralar</Text> : null}
          </View>
        }
        renderItem={({ item }) => (
          <CameraCard
            camera={item}
            onPress={() => router.push(`/staff/cameras/view/${item.id}`)}
            cardWidth={cardWidth}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="videocam-outline" size={56} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>Yetkili kamera yok</Text>
            <Text style={styles.emptySub}>
              Size atanmış kamera bulunmuyor. Admin ile iletişime geçin.
            </Text>
          </View>
        }
        ListFooterComponent={
          myLogs.length > 0 ? (
            <View style={styles.logsSection}>
              <Text style={styles.sectionTitle}>Son işlemlerim</Text>
              {myLogs.slice(0, 5).map((log) => (
                <View key={log.id} style={styles.logItem}>
                  <Text style={styles.logTime}>
                    {format(parseISO(log.created_at), 'HH:mm', { locale: tr })}
                  </Text>
                  <Text style={styles.logBody}>
                    {log.camera_name} — {ACTION_LABELS[log.action] ?? log.action}
                    {log.duration_seconds != null && log.action === 'izleme_bitirdi' && (
                      <> {formatDuration(log.duration_seconds)}</>
                    )}
                  </Text>
                </View>
              ))}
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  content: {
    padding: PAD,
    paddingBottom: 48,
  },
  row: { marginBottom: GAP },
  headerActions: { marginBottom: 4 },
  uploadRecordingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0f766e',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  uploadRecordingBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  archiveLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 12,
  },
  archiveLinkText: { color: '#0f766e', fontWeight: '700', fontSize: 13 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 12,
    marginTop: 4,
  },
  card: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  previewWrap: {
    height: 100,
    backgroundColor: '#0a0a0a',
    position: 'relative',
  },
  preview: { flex: 1 },
  liveBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444',
  },
  liveText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  cardInfo: {
    padding: 10,
  },
  cardName: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
  cardLocation: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  cardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  cardActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: 16,
  },
  emptySub: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  logsSection: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  logTime: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primary,
    minWidth: 40,
  },
  logBody: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
});
