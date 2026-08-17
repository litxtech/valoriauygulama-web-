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
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
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

function Field({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHead}>
        <Ionicons name={icon} size={16} color={theme.colors.primary} />
        <Text style={styles.fieldLabel}>{label}</Text>
      </View>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

export default function HotelIssueArchiveDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const isAdmin = staff?.role === 'admin';

  const [record, setRecord] = useState<HotelIssueArchiveRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
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

  const openMedia = (m: HotelIssueArchiveMediaRow) => {
    void Linking.openURL(m.public_url);
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

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={[styles.heroBadge, { backgroundColor: `${catMeta.color}14` }]}>
        <Ionicons name={hotelIssueArchiveCategoryIcon(record.category) as never} size={28} color={catMeta.color} />
        <View style={styles.heroBadgeText}>
          <Text style={[styles.heroCat, { color: catMeta.color }]}>{hotelIssueArchiveCategoryLabel(record.category)}</Text>
          <Text style={styles.heroLocation}>{locationPart}</Text>
        </View>
        {record.record_no ? <Text style={styles.heroNo}>{record.record_no}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.note}>{record.note}</Text>
      </View>

      {media.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Fotoğraf / video ({media.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {media.map((m) => (
              <TouchableOpacity key={m.id} style={styles.mediaTile} onPress={() => openMedia(m)} activeOpacity={0.85}>
                <Image source={{ uri: m.thumbnail_url ?? m.public_url }} style={styles.mediaImg} />
                {m.media_type === 'video' ? (
                  <View style={styles.playDot} pointerEvents="none">
                    <Ionicons name="play" size={18} color="#fff" />
                  </View>
                ) : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.card}>
        <Field icon="person-outline" label="Kaydeden" value={creatorName} />
        <Field icon="time-outline" label="Tarih / saat" value={formatDateTime(record.created_at)} />
        {record.location_label ? (
          <Field icon="location-outline" label="Alan" value={record.location_label} />
        ) : null}
        {record.room_number ? <Field icon="bed-outline" label="Oda" value={record.room_number} /> : null}
      </View>

      {isAdmin ? (
        <TouchableOpacity
          style={[styles.deleteBtn, busy && styles.deleteBtnDisabled]}
          onPress={confirmDelete}
          disabled={busy}
          activeOpacity={0.85}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="trash-outline" size={20} color="#fff" />
              <Text style={styles.deleteBtnText}>Kaydı sil (yönetici)</Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.backgroundSecondary },
  missing: { color: theme.colors.textMuted, fontSize: 16 },
  scroll: { padding: 16, paddingBottom: 40, backgroundColor: theme.colors.backgroundSecondary },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  heroBadgeText: { flex: 1 },
  heroCat: { fontSize: 14, fontWeight: '700' },
  heroLocation: { marginTop: 2, fontSize: 18, fontWeight: '800', color: theme.colors.text },
  heroNo: { fontSize: 12, color: theme.colors.textMuted, fontWeight: '600' },
  card: {
    backgroundColor: theme.colors.background,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text, marginBottom: 12 },
  note: { fontSize: 16, lineHeight: 24, color: theme.colors.text },
  field: { marginBottom: 14 },
  fieldHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted },
  fieldValue: { fontSize: 15, color: theme.colors.text, lineHeight: 22 },
  mediaTile: {
    width: SCREEN_W * 0.42,
    height: SCREEN_W * 0.42,
    marginRight: 10,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: theme.colors.backgroundSecondary,
  },
  mediaImg: { width: '100%', height: '100%' },
  playDot: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.25)',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#dc2626',
  },
  deleteBtnDisabled: { opacity: 0.6 },
  deleteBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
