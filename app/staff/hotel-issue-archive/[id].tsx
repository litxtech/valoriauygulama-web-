import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Dimensions,
  Linking,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { PressableScale } from '@/components/premium/PressableScale';
import { useAuthStore } from '@/stores/authStore';
import {
  getHotelIssueArchive,
  deleteHotelIssueArchive,
  hotelIssueArchiveCategoryIcon,
  hotelIssueArchiveCategoryLabel,
  hotelIssueArchiveCategoryMeta,
  type HotelIssueArchiveRow,
  type HotelIssueArchiveMediaRow,
} from '@/lib/hotelIssueArchive';

const SCREEN_W = Dimensions.get('window').width;
const ACCENT = '#7c3aed';

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function personInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function InfoTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  accent?: string;
}) {
  const tint = accent ?? ACCENT;
  return (
    <View style={styles.infoTile}>
      <View style={[styles.infoIcon, { backgroundColor: `${tint}14` }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export default function HotelIssueArchiveDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const staff = useAuthStore((s) => s.staff);
  const isAdmin = staff?.role === 'admin';

  const [record, setRecord] = useState<HotelIssueArchiveRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const load = useCallback(async (pull = false) => {
    if (!id) return;
    if (pull) setRefreshing(true);
    else setLoading(true);
    const { data, error } = await getHotelIssueArchive(id);
    if (!error && data) {
      const row = data as Record<string, unknown>;
      const creatorRaw = row.creator as { full_name: string | null } | { full_name: string | null }[] | null;
      const creator = Array.isArray(creatorRaw) ? creatorRaw[0] ?? null : creatorRaw ?? null;
      setRecord({ ...(row as unknown as HotelIssueArchiveRow), creator });
    } else if (!error) {
      setRecord(null);
    }
    setLoading(false);
    setRefreshing(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const confirmDelete = () => {
    if (!record || !isAdmin) return;
    Alert.alert('Kaydı sil', 'Bu kayıt kalıcı olarak silinsin mi? Yalnızca yöneticiler silebilir.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const { error } = await deleteHotelIssueArchive(record.id);
          setBusy(false);
          if (error) {
            Alert.alert('Hata', error.message ?? 'Silinemedi');
            return;
          }
          Alert.alert('Silindi', 'Kayıt silindi.', [{ text: 'Tamam', onPress: () => router.back() }]);
        },
      },
    ]);
  };

  if (loading && !record) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={ACCENT} size="large" />
        <Text style={styles.loadingText}>Kayıt yükleniyor…</Text>
      </View>
    );
  }

  if (!record) {
    return (
      <View style={styles.center}>
        <Ionicons name="document-outline" size={40} color={theme.colors.textMuted} />
        <Text style={styles.missing}>Kayıt bulunamadı</Text>
      </View>
    );
  }

  const catMeta = hotelIssueArchiveCategoryMeta(record.category);
  const creatorName = record.creator?.full_name ?? 'Personel';
  const media = [...(record.media ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const locationPart = record.room_number
    ? `Oda ${record.room_number}`
    : record.location_label?.trim() || 'Konum belirtilmedi';
  const viewerMedia = viewerIndex != null ? media[viewerIndex] : null;

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={ACCENT} />}
      >
        <LinearGradient
          colors={[catMeta.color, '#312e81', '#1e1b4b']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroTop}>
            <View style={styles.heroCatBadge}>
              <Ionicons name={hotelIssueArchiveCategoryIcon(record.category) as never} size={14} color="#fff" />
              <Text style={styles.heroCatText}>{hotelIssueArchiveCategoryLabel(record.category)}</Text>
            </View>
            {record.record_no ? <Text style={styles.heroNo}>{record.record_no}</Text> : null}
          </View>
          <Text style={styles.heroLocation}>{locationPart}</Text>
          <View style={styles.heroCreator}>
            <View style={styles.heroAvatar}>
              <Text style={styles.heroAvatarText}>{personInitials(creatorName)}</Text>
            </View>
            <View>
              <Text style={styles.heroCreatorName}>{creatorName}</Text>
              <Text style={styles.heroDate}>{formatDateTime(record.created_at)}</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.noteCard}>
          <Text style={styles.noteLabel}>Not</Text>
          <Text style={styles.note}>{record.note}</Text>
        </View>

        {media.length > 0 ? (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Medya</Text>
              <View style={styles.mediaCountBadge}>
                <Text style={styles.mediaCountText}>{media.length}</Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaRow}>
              {media.map((m, idx) => (
                <PressableScale key={m.id} style={styles.mediaTile} onPress={() => setViewerIndex(idx)}>
                  <Image source={{ uri: m.thumbnail_url ?? m.public_url }} style={styles.mediaImg} />
                  {m.media_type === 'video' ? (
                    <View style={styles.playOverlay}>
                      <View style={styles.playBtn}>
                        <Ionicons name="play" size={20} color="#fff" />
                      </View>
                    </View>
                  ) : null}
                </PressableScale>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.infoGrid}>
          <InfoTile icon="person-outline" label="Kaydeden" value={creatorName} accent={catMeta.color} />
          <InfoTile icon="time-outline" label="Tarih" value={formatDateTime(record.created_at)} accent={catMeta.color} />
          {record.location_label ? (
            <InfoTile icon="location-outline" label="Alan" value={record.location_label} accent={catMeta.color} />
          ) : null}
          {record.room_number ? (
            <InfoTile icon="bed-outline" label="Oda" value={record.room_number} accent={catMeta.color} />
          ) : null}
        </View>

        {isAdmin ? (
          <PressableScale style={[styles.deleteBtn, busy && styles.deleteBtnDisabled]} onPress={confirmDelete} disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={18} color="#fff" />
                <Text style={styles.deleteBtnText}>Kaydı sil</Text>
              </>
            )}
          </PressableScale>
        ) : null}
      </ScrollView>

      <Modal visible={viewerIndex != null} animationType="fade" transparent onRequestClose={() => setViewerIndex(null)}>
        <View style={[styles.viewerRoot, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.viewerTop}>
            <PressableScale onPress={() => setViewerIndex(null)} style={styles.viewerClose}>
              <Ionicons name="close" size={22} color="#fff" />
            </PressableScale>
            {viewerIndex != null ? (
              <Text style={styles.viewerCounter}>
                {viewerIndex + 1} / {media.length}
              </Text>
            ) : null}
            {viewerMedia ? (
              <PressableScale
                onPress={() => void Linking.openURL(viewerMedia.public_url)}
                style={styles.viewerOpen}
              >
                <Ionicons name="open-outline" size={20} color="#fff" />
              </PressableScale>
            ) : (
              <View style={{ width: 40 }} />
            )}
          </View>
          {viewerMedia ? (
            <Image source={{ uri: viewerMedia.public_url }} style={styles.viewerImg} resizeMode="contain" />
          ) : null}
          {media.length > 1 ? (
            <View style={styles.viewerNav}>
              <PressableScale
                style={styles.viewerNavBtn}
                disabled={viewerIndex === 0}
                onPress={() => setViewerIndex((i) => (i != null && i > 0 ? i - 1 : i))}
              >
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </PressableScale>
              <PressableScale
                style={styles.viewerNavBtn}
                disabled={viewerIndex === media.length - 1}
                onPress={() => setViewerIndex((i) => (i != null && i < media.length - 1 ? i + 1 : i))}
              >
                <Ionicons name="chevron-forward" size={24} color="#fff" />
              </PressableScale>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundSecondary,
    gap: 10,
  },
  loadingText: { color: theme.colors.textMuted, fontSize: 14 },
  missing: { color: theme.colors.textMuted, fontSize: 16, fontWeight: '600' },
  scroll: { paddingBottom: 40, backgroundColor: theme.colors.backgroundSecondary },
  hero: {
    padding: 20,
    paddingTop: 18,
    marginBottom: 12,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  heroCatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  heroCatText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  heroNo: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600' },
  heroLocation: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  heroCreator: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  heroAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  heroCreatorName: { color: '#fff', fontWeight: '700', fontSize: 15 },
  heroDate: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  noteCard: {
    marginHorizontal: 16,
    backgroundColor: theme.colors.background,
    borderRadius: 18,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  noteLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  note: { marginTop: 8, fontSize: 16, lineHeight: 25, color: theme.colors.text },
  card: {
    marginHorizontal: 16,
    backgroundColor: theme.colors.background,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  mediaCountBadge: {
    backgroundColor: `${ACCENT}18`,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  mediaCountText: { fontSize: 12, fontWeight: '800', color: ACCENT },
  mediaRow: { gap: 10 },
  mediaTile: {
    width: SCREEN_W * 0.55,
    height: SCREEN_W * 0.55,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: theme.colors.backgroundSecondary,
  },
  mediaImg: { width: '100%', height: '100%' },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.2)',
  },
  playBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  infoTile: {
    width: '48%',
    flexGrow: 1,
    minWidth: '46%',
    backgroundColor: theme.colors.background,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  infoLabel: { fontSize: 11, fontWeight: '600', color: theme.colors.textMuted },
  infoValue: { marginTop: 2, fontSize: 14, fontWeight: '700', color: theme.colors.text, lineHeight: 19 },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 4,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#dc2626',
  },
  deleteBtnDisabled: { opacity: 0.6 },
  deleteBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  viewerRoot: { flex: 1, backgroundColor: 'rgba(15,23,42,0.96)' },
  viewerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  viewerClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerOpen: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerCounter: { color: '#fff', fontWeight: '700', fontSize: 14 },
  viewerImg: { flex: 1, width: '100%' },
  viewerNav: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingVertical: 16,
  },
  viewerNavBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
