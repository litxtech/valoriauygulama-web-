import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { CachedImage } from '@/components/CachedImage';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import { AdminOrganizationPicker } from '@/components/admin';
import {
  fetchAdminQrComplaints,
  type AdminQrComplaintRow,
} from '@/lib/qrComplaintsAdmin';
import {
  complaintsText,
  complaintCategoryLabel,
  complaintStatusLabel,
  complaintTypeLabel,
  complaintsLocaleTag,
} from '@/lib/complaintsI18n';
import { useCachedList } from '@/hooks/useCachedList';
import { useRouter } from 'expo-router';
import { QrComplaintResponsibleSettings } from '@/components/admin/QrComplaintResponsibleSettings';

type Status =
  | 'pending'
  | 'taken_for_review'
  | 'solution_in_progress'
  | 'resolved'
  | 'unresolved'
  | 'rejected';

export default function AdminQrComplaintsIndex() {
  const router = useRouter();
  const loc = complaintsLocaleTag();
  const staff = useAuthStore((s) => s.staff);
  const { orgScoped, canUseAll } = useAdminOrganizationQueryScope();
  const [filter, setFilter] = useState<'all' | Status>('pending');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [noteById, setNoteById] = useState<Record<string, string>>({});

  const cacheKey = useMemo(
    () => `admin-qr-complaints:${filter}:${orgScoped ?? 'all'}`,
    [filter, orgScoped]
  );

  const fetchItems = useCallback(async () => {
    const { rows, error } = await fetchAdminQrComplaints({
      statusFilter: filter,
      orgScoped,
    });
    if (error) {
      Alert.alert(complaintsText('error'), error);
      throw new Error(error);
    }
    const initialNotes: Record<string, string> = {};
    rows.forEach((row) => {
      initialNotes[row.id] = row.admin_note ?? '';
    });
    setNoteById(initialNotes);
    return rows as (AdminQrComplaintRow & { status: Status })[];
  }, [filter, orgScoped]);

  const { items: list, loading, refreshing, refresh, load } = useCachedList({
    cacheKey,
    fetchItems,
  });

  const updateStatus = async (item: AdminQrComplaintRow, status: Status) => {
    if (!staff?.id) return;
    setUpdatingId(item.id);
    const note = (noteById[item.id] ?? '').trim();
    const { error } = await supabase
      .from('qr_complaints')
      .update({
        status,
        admin_note: note || null,
        reviewed_by_staff_id: staff.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', item.id);
    setUpdatingId(null);
    if (error) {
      Alert.alert(complaintsText('error'), error.message);
      return;
    }
    await load();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={adminTheme.colors.accent} />
      }
    >
      <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={staff?.organization_id} />

      <TouchableOpacity style={styles.qrBanner} onPress={() => router.push('/admin/qr-designs')} activeOpacity={0.88}>
        <Ionicons name="qr-code-outline" size={22} color={adminTheme.colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.qrBannerTitle}>QR kodu yazdır / kopyala</Text>
          <Text style={styles.qrBannerSub}>QR Merkezi → Şikayet Hattı</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.textMuted} />
      </TouchableOpacity>

      <View style={styles.banner}>
        <Ionicons name="globe-outline" size={20} color={adminTheme.colors.accent} />
        <Text style={styles.bannerText}>
          Giriş gerekmez. Misafir ad, telefon, oda ve açıklama yazar; DeepSeek ile metin düzenleyebilir.
          Yeni kayıtta admin hesabına push gider.
        </Text>
      </View>

      <QrComplaintResponsibleSettings />

      <View style={styles.filterRow}>
        {(
          ['pending', 'taken_for_review', 'solution_in_progress', 'resolved', 'unresolved', 'all'] as const
        ).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {f === 'all' ? complaintsText('all') : complaintStatusLabel(f)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && list.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={adminTheme.colors.accent} />
        </View>
      ) : list.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Henüz QR şikayet kaydı yok</Text>
        </View>
      ) : (
        list.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.header}>
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="qr-code" size={18} color={adminTheme.colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.contact_name || 'Anonim misafir'}</Text>
                <Text style={styles.meta}>
                  {complaintTypeLabel(item.topic_type)} · {complaintCategoryLabel(item.category)}
                </Text>
              </View>
              <View style={[styles.statusPill, styles[`status_${item.status}` as keyof typeof styles] as object]}>
                <Text style={styles.statusText}>{complaintStatusLabel(item.status)}</Text>
              </View>
            </View>

            <Text style={styles.description}>{item.description}</Text>
            <Text style={styles.metaRow}>
              {item.phone ? `Tel: ${item.phone}` : 'Tel: —'} ·{' '}
              {item.room_number ? `Oda: ${item.room_number}` : 'Oda: —'}
            </Text>
            <Text style={styles.date}>{new Date(item.created_at).toLocaleString(loc)}</Text>

            {item.media_urls?.length ? (
              <View style={styles.mediaGrid}>
                {item.media_urls.map((m, i) =>
                  m.type === 'video' ? (
                    <TouchableOpacity
                      key={`${item.id}-v-${i}`}
                      style={styles.mediaCell}
                      onPress={() => Linking.openURL(m.url)}
                      activeOpacity={0.9}
                    >
                      <Video
                        source={{ uri: m.url }}
                        style={styles.mediaFill}
                        resizeMode={ResizeMode.COVER}
                        useNativeControls={false}
                        shouldPlay={false}
                        isMuted
                      />
                      <View style={styles.videoBadge}>
                        <Ionicons name="play" size={14} color="#fff" />
                        <Text style={styles.videoBadgeText}>Video</Text>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <CachedImage
                      key={`${item.id}-i-${i}`}
                      uri={m.url}
                      style={styles.mediaCell}
                      contentFit="cover"
                    />
                  )
                )}
              </View>
            ) : null}

            <TextInput
              style={styles.noteInput}
              value={noteById[item.id] ?? ''}
              onChangeText={(v) => setNoteById((prev) => ({ ...prev, [item.id]: v }))}
              placeholder="Yönetici notu"
              placeholderTextColor={adminTheme.colors.textMuted}
            />

            <View style={styles.actions}>
              {(['taken_for_review', 'solution_in_progress', 'resolved', 'unresolved'] as const).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.actionBtn, item.status === s && styles.actionBtnActive]}
                  disabled={updatingId === item.id}
                  onPress={() => updateStatus(item, s)}
                >
                  <Text style={[styles.actionText, item.status === s && styles.actionTextActive]}>
                    {complaintStatusLabel(s)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 40 },
  qrBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  qrBannerTitle: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  qrBannerSub: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: adminTheme.colors.warningLight,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  bannerText: { flex: 1, color: adminTheme.colors.text, fontSize: 13, lineHeight: 19 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surface,
  },
  filterChipActive: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  filterChipText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.text },
  filterChipTextActive: { color: '#fff' },
  loadingWrap: { paddingVertical: 32, alignItems: 'center' },
  emptyWrap: { paddingVertical: 24, alignItems: 'center' },
  emptyText: { color: adminTheme.colors.textMuted },
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  meta: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: adminTheme.colors.surfaceTertiary,
  },
  status_pending: { backgroundColor: '#fef3c7' },
  status_taken_for_review: { backgroundColor: '#e0f2fe' },
  status_solution_in_progress: { backgroundColor: '#ede9fe' },
  status_resolved: { backgroundColor: '#d1fae5' },
  status_unresolved: { backgroundColor: '#fee2e2' },
  status_rejected: { backgroundColor: '#fee2e2' },
  statusText: { fontSize: 11, fontWeight: '700', color: adminTheme.colors.text },
  description: { fontSize: 15, lineHeight: 22, color: adminTheme.colors.text, marginBottom: 8 },
  metaRow: { fontSize: 12, color: adminTheme.colors.textSecondary },
  date: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 4, marginBottom: 10 },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  mediaCell: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
  },
  mediaFill: { width: '100%', height: '100%' },
  videoBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  videoBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  noteInput: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: adminTheme.colors.text,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    marginBottom: 10,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  actionBtnActive: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  actionText: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.text },
  actionTextActive: { color: '#fff' },
});
