import { useCallback, useLayoutEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useNavigation, usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import { AdminStackBackButton } from '@/lib/adminStackBack';
import { StaffStackBackButton } from '@/lib/staffStackBack';
import { FacilityJournalAccessGate } from '@/components/staff/FacilityJournalAccessGate';
import { CachedImage } from '@/components/CachedImage';
import { FacilityJournalViewerPicker } from '@/components/facilityJournal/FacilityJournalViewerPicker';
import {
  getFacilityJournalRecord,
  listFacilityJournalAccess,
  listFacilityJournalGuestAccess,
  setFacilityJournalRecordViewers,
  archiveFacilityJournalRecord,
  deleteFacilityJournalRecord,
  type FacilityJournalRecordRow,
  type FacilityJournalAccessRow,
  type FacilityJournalGuestAccessRow,
} from '@/lib/facilityJournal';
import { canAccessFacilityJournal } from '@/lib/staffPermissions';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { useTranslation } from 'react-i18next';

const { width: SCREEN_W } = Dimensions.get('window');

function FacilityJournalDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const pathname = usePathname();
  const staff = useAuthStore((s) => s.staff);
  const isAdminRoute = pathname?.startsWith('/admin') ?? false;
  const base = isAdminRoute ? '/admin/facility-journal' : '/staff/facility-journal';
  const isAdmin = staff?.role === 'admin';

  const [record, setRecord] = useState<FacilityJournalRecordRow | null>(null);
  const [access, setAccess] = useState<FacilityJournalAccessRow[]>([]);
  const [viewerStaffIds, setViewerStaffIds] = useState<string[]>([]);
  const [viewerGuestIds, setViewerGuestIds] = useState<string[]>([]);
  const [guestAccess, setGuestAccess] = useState<FacilityJournalGuestAccessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingAccess, setSavingAccess] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () =>
        isAdminRoute ? (
          <AdminStackBackButton accessibilityLabel="Geri" fallback={base as never} />
        ) : (
          <StaffStackBackButton accessibilityLabel="Geri" fallback={base as never} />
        ),
    });
  }, [navigation, isAdminRoute, base]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [recRes, accRes, guestAccRes] = await Promise.all([
      getFacilityJournalRecord(id),
      listFacilityJournalAccess(id),
      listFacilityJournalGuestAccess(id),
    ]);
    if (recRes.data) setRecord(recRes.data as FacilityJournalRecordRow);
    const acc = (accRes.data as FacilityJournalAccessRow[]) ?? [];
    setAccess(acc);
    setViewerStaffIds(acc.map((a) => a.staff_id));
    const gAcc = (guestAccRes.data as FacilityJournalGuestAccessRow[]) ?? [];
    setGuestAccess(gAcc);
    setViewerGuestIds(gAcc.map((a) => a.guest_id));
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggleViewerStaff = (sid: string) => {
    setViewerStaffIds((prev) => (prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]));
  };

  const toggleViewerGuest = (gid: string) => {
    setViewerGuestIds((prev) => (prev.includes(gid) ? prev.filter((x) => x !== gid) : [...prev, gid]));
  };

  const saveAccess = async () => {
    if (!id || !staff?.id) return;
    setSavingAccess(true);
    const { error } = await setFacilityJournalRecordViewers(id, staff.id, viewerStaffIds, viewerGuestIds);
    setSavingAccess(false);
    if (error) Alert.alert('Hata', error);
    else {
      Alert.alert(t('ok'), t('staffFjVisibilityUpdated'));
      load();
    }
  };

  const handleArchive = () => {
    if (!id) return;
    Alert.alert(t('staffFjArchiveTitle'), t('staffFjArchiveBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('staffFjArchiveBtn'),
        onPress: async () => {
          await archiveFacilityJournalRecord(id);
          router.replace(base as never);
        },
      },
    ]);
  };

  const handleDelete = () => {
    if (!id) return;
    Alert.alert(t('staffFjDeleteTitle'), t('staffFjDeleteBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const { error } = await deleteFacilityJournalRecord(id);
            setDeleting(false);
            if (error) {
              Alert.alert('Hata', error);
              return;
            }
            router.replace(base as never);
          },
        },
      ]
    );
  };

  if (loading || !record) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  const media = [...(record.media ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const canEditAccess = isAdmin || record.created_by_staff_id === staff?.id;
  const canDelete =
    isAdmin || (record.created_by_staff_id === staff?.id && canAccessFacilityJournal(staff));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <Text style={styles.ref}>{record.reference_code}</Text>
      <Text style={styles.title}>{record.title}</Text>
      <Text style={styles.meta}>
        {record.type?.name ?? '—'} · {record.record_date}
        {record.creator?.full_name ? ` · ${record.creator.full_name}` : ''}
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
      {media.map((m) => (
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
            {m.label === 'before'
              ? t('staffFjMediaBefore')
              : m.label === 'after'
                ? t('staffFjMediaAfter')
                : t('staffFjMediaGeneral')}
          </Text>
        </View>
      ))}

      {canEditAccess && staff?.organization_id ? (
        <>
          <Text style={styles.sectionTitle}>Kimler görebilir?</Text>
          <Text style={styles.hint}>Personel ve oteldeki misafirleri güncelleyebilirsiniz.</Text>
          <FacilityJournalViewerPicker
            organizationId={staff.organization_id}
            creatorStaffId={record.created_by_staff_id}
            selectedStaffIds={viewerStaffIds}
            selectedGuestIds={viewerGuestIds}
            onToggleStaff={toggleViewerStaff}
            onToggleGuest={toggleViewerGuest}
          />
          <TouchableOpacity style={styles.saveAccessBtn} onPress={saveAccess} disabled={savingAccess}>
            {savingAccess ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveAccessText}>Görünürlüğü kaydet</Text>
            )}
          </TouchableOpacity>
        </>
      ) : access.length > 0 || guestAccess.length > 0 ? (
        <Text style={styles.hint}>Bu kayıt size özel olarak paylaşıldı.</Text>
      ) : null}

      {isAdmin ? (
        <TouchableOpacity style={styles.archiveBtn} onPress={handleArchive}>
          <Text style={styles.archiveText}>Arşivle</Text>
        </TouchableOpacity>
      ) : null}

      {canDelete ? (
        <TouchableOpacity
          style={[styles.deleteBtn, deleting && styles.deleteBtnDisabled]}
          onPress={handleDelete}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="trash-outline" size={20} color="#fff" />
              <Text style={styles.deleteBtnText}>Kaydı sil</Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

export default function FacilityJournalDetail() {
  return (
    <FacilityJournalAccessGate>
      <FacilityJournalDetailScreen />
    </FacilityJournalAccessGate>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ref: { fontSize: 13, color: theme.colors.textMuted, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '700', color: theme.colors.text, marginTop: 4 },
  meta: { fontSize: 14, color: theme.colors.textMuted, marginTop: 6, marginBottom: 12 },
  body: { fontSize: 16, color: theme.colors.text, lineHeight: 24, marginBottom: 12 },
  field: { fontSize: 15, color: theme.colors.text, marginBottom: 6 },
  fieldLabel: { fontWeight: '600' },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginTop: 20, marginBottom: 8, color: theme.colors.text },
  mediaBlock: { marginBottom: 16 },
  image: { width: SCREEN_W - 32, height: 220, borderRadius: 10, backgroundColor: '#e2e8f0' },
  video: { width: SCREEN_W - 32, height: 220, borderRadius: 10, backgroundColor: '#0f172a' },
  mediaLabel: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
  hint: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 8 },
  viewerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  viewerChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  viewerChipOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  viewerChipText: { fontSize: 13, color: theme.colors.text },
  viewerChipTextOn: { color: '#fff' },
  saveAccessBtn: {
    marginTop: 12,
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveAccessText: { color: '#fff', fontWeight: '600' },
  archiveBtn: { marginTop: 24, padding: 14, alignItems: 'center' },
  archiveText: { color: '#b45309', fontWeight: '600' },
  deleteBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#dc2626',
    paddingVertical: 14,
    borderRadius: 12,
  },
  deleteBtnDisabled: { opacity: 0.7 },
  deleteBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
