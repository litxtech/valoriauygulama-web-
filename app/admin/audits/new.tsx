import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminButton, AdminCard } from '@/components/admin';
import {
  createAndSubmitAuditSession,
  fetchAuditCategories,
  fetchAuditCriteria,
  type AuditCategoryRow,
  type AuditCriterionRow,
} from '@/lib/audit';
import { AUDIT_MEDIA_BUCKET, MAX_AUDIT_MEDIA } from '@/lib/auditMedia';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { CachedImage } from '@/components/CachedImage';
import { supabase } from '@/lib/supabase';
import { sortStaffAdminFirst } from '@/lib/sortStaffAdminFirst';

type StaffRow = { id: string; full_name: string | null; department: string | null };
type PendingMedia = { uri: string; type: 'image' | 'video' };

export default function NewAuditScreen() {
  const router = useRouter();
  const { categoryId: initialCategoryId } = useLocalSearchParams<{ categoryId?: string }>();
  const { staff } = useAuthStore();
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);

  const orgId = useMemo(() => {
    if (staff?.app_permissions?.super_admin === true || staff?.role === 'admin') {
      return selectedOrganizationId && selectedOrganizationId !== 'all' ? selectedOrganizationId : staff?.organization_id;
    }
    return staff?.organization_id ?? null;
  }, [staff, selectedOrganizationId]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<AuditCategoryRow[]>([]);
  const [criteria, setCriteria] = useState<AuditCriterionRow[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(initialCategoryId ?? null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [areaNote, setAreaNote] = useState('');
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<Set<string>>(new Set());
  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([]);
  const [criteriaError, setCriteriaError] = useState<string | null>(null);
  const [criteriaLoading, setCriteriaLoading] = useState(false);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    (async () => {
      const [cats, sRes] = await Promise.all([
        fetchAuditCategories(orgId),
        supabase
          .from('staff')
          .select('id, full_name, department')
          .eq('organization_id', orgId)
          .eq('is_active', true)
          .order('full_name'),
      ]);
      setCategories(cats.data);
      const rows = (sRes.data ?? []) as StaffRow[];
      setStaffList(
        sortStaffAdminFirst(rows, (a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'tr')) as StaffRow[]
      );
      if (!selectedCategoryId && cats.data[0]) {
        setSelectedCategoryId(cats.data[0].id);
      }
      setLoading(false);
    })();
  }, [orgId]);

  const loadCriteria = useCallback(
    async (catId: string) => {
      if (!orgId) return;
      setCriteriaLoading(true);
      setCriteriaError(null);
      const { data, error } = await fetchAuditCriteria(catId, orgId);
      setCriteria(data);
      setCriteriaError(error ?? (data.length === 0 ? 'Bu bölümde henüz kriter yok.' : null));
      const init: Record<string, number> = {};
      for (const c of data) init[c.id] = c.max_points;
      setScores(init);
      setComments({});
      setCriteriaLoading(false);
    },
    [orgId]
  );

  useEffect(() => {
    if (selectedCategoryId) loadCriteria(selectedCategoryId);
  }, [selectedCategoryId, loadCriteria]);

  const toggleStaff = (id: string) => {
    setSelectedStaff((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pickMedia = async (fromCamera: boolean) => {
    if (pendingMedia.length >= MAX_AUDIT_MEDIA) {
      Alert.alert('Limit', `En fazla ${MAX_AUDIT_MEDIA} dosya.`);
      return;
    }
    const granted = fromCamera
      ? await ensureCameraPermission({
          title: 'Kamera',
          message: 'Denetim kanıtı için kamera gerekir.',
          settingsMessage: 'Ayarlardan kamera iznini açın.',
        })
      : await ensureMediaLibraryPermission({
          title: 'Galeri',
          message: 'Fotoğraf veya video eklemek için galeri gerekir.',
          settingsMessage: 'Ayarlardan galeri iznini açın.',
        });
    if (!granted) return;
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.85 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.All,
          allowsMultipleSelection: true,
          quality: 0.85,
        });
    if (result.canceled || !result.assets?.length) return;
    const added: PendingMedia[] = result.assets.slice(0, MAX_AUDIT_MEDIA - pendingMedia.length).map((a) => ({
      uri: a.uri,
      type: (a.type === 'video' ? 'video' : 'image') as 'image' | 'video',
    }));
    setPendingMedia((p) => [...p, ...added]);
  };

  const submit = async () => {
    if (!orgId || !staff?.id || !selectedCategoryId) {
      Alert.alert('Hata', 'İşletme ve bölüm seçin.');
      return;
    }
    if (!criteria.length) {
      Alert.alert('Hata', 'Bu bölümde kriter yok. Bölümler & kriterler ekranından ekleyin.');
      return;
    }
    if (selectedStaff.size === 0) {
      Alert.alert('Hata', 'En az bir sorumlu personel seçin.');
      return;
    }
    setSaving(true);
    try {
      const mediaUrls: { url: string; mediaType: 'image' | 'video' }[] = [];
      for (const m of pendingMedia) {
        const { publicUrl } = await uploadUriToPublicBucket({
          bucketId: AUDIT_MEDIA_BUCKET,
          uri: m.uri,
          kind: m.type === 'video' ? 'video' : 'image',
          subfolder: 'sessions',
        });
        mediaUrls.push({ url: publicUrl, mediaType: m.type });
      }

      const { sessionId, sessionScore, error } = await createAndSubmitAuditSession({
        organizationId: orgId,
        categoryId: selectedCategoryId,
        auditorStaffId: staff.id,
        areaNote,
        staffIds: Array.from(selectedStaff),
        criterionScores: criteria.map((c) => ({
          criterionId: c.id,
          pointsAwarded: Math.round(scores[c.id] ?? c.max_points),
          maxPoints: c.max_points,
          weight: c.weight,
          comment: comments[c.id],
        })),
        mediaUrls,
      });

      if (error) throw new Error(error);
      Alert.alert('Tamam', `Denetim kaydedildi: ${sessionScore ?? '—'}/100`, [
        { text: 'Tamam', onPress: () => router.replace(sessionId ? `/admin/audits/${sessionId}` : '/admin/audits') },
      ]);
    } catch (e) {
      Alert.alert('Hata', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!orgId) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>İşletme seçin (denetim panosundan).</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={adminTheme.colors.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Bölüm</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          {categories.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[styles.chip, selectedCategoryId === c.id && styles.chipOn]}
              onPress={() => setSelectedCategoryId(c.id)}
            >
              <Text style={[styles.chipText, selectedCategoryId === c.id && styles.chipTextOn]}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.label}>Kriter puanları</Text>
        {criteriaLoading ? (
          <ActivityIndicator style={{ marginVertical: 16 }} color={adminTheme.colors.accent} />
        ) : null}
        {criteriaError && !criteriaLoading ? (
          <AdminCard>
            <Text style={styles.criteriaErr}>{criteriaError}</Text>
            <Text style={styles.muted}>
              Bölümler & kriterler ekranından ekleyin veya veritabanı migration 257’yi uygulayın.
            </Text>
            <AdminButton
              title="Bölümlere git"
              variant="outline"
              onPress={() => router.push('/admin/audits/categories')}
              style={{ marginTop: 8 }}
            />
          </AdminCard>
        ) : null}
        {criteria.map((c) => {
          const maxPts = Number(c.max_points) || 1;
          const current = Math.round(scores[c.id] ?? maxPts);
          return (
          <AdminCard key={c.id} style={styles.criterionCard}>
            <View style={styles.criterionHead}>
              <Text style={styles.criterionTitle}>
                {c.title}
                {c.is_critical ? ' *' : ''}
              </Text>
              <Text style={styles.criterionPts}>
                {current}/{maxPts}
              </Text>
            </View>
            {c.description ? <Text style={styles.muted}>{c.description}</Text> : null}
            <View style={styles.stepperRow}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() =>
                  setScores((s) => ({
                    ...s,
                    [c.id]: Math.max(0, Math.round((s[c.id] ?? maxPts) - 1)),
                  }))
                }
              >
                <Ionicons name="remove" size={22} color={adminTheme.colors.text} />
              </TouchableOpacity>
              <View style={styles.stepTrack}>
                <View
                  style={[
                    styles.stepFill,
                    {
                      width: `${(current / maxPts) * 100}%`,
                    },
                  ]}
                />
              </View>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() =>
                  setScores((s) => ({
                    ...s,
                    [c.id]: Math.min(maxPts, Math.round((s[c.id] ?? maxPts) + 1)),
                  }))
                }
              >
                <Ionicons name="add" size={22} color={adminTheme.colors.text} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.commentInput}
              placeholder="Not (isteğe bağlı)"
              placeholderTextColor={adminTheme.colors.textMuted}
              value={comments[c.id] ?? ''}
              onChangeText={(t) => setComments((cm) => ({ ...cm, [c.id]: t }))}
            />
          </AdminCard>
          );
        })}

        <Text style={styles.label}>Genel not</Text>
        <TextInput
          style={styles.areaInput}
          multiline
          placeholder="Alan hakkında genel yorum"
          placeholderTextColor={adminTheme.colors.textMuted}
          value={areaNote}
          onChangeText={setAreaNote}
        />

        <Text style={styles.label}>Sorumlu personel</Text>
        {staffList.map((s) => (
          <TouchableOpacity key={s.id} style={styles.staffRow} onPress={() => toggleStaff(s.id)}>
            <Ionicons
              name={selectedStaff.has(s.id) ? 'checkbox' : 'square-outline'}
              size={22}
              color={selectedStaff.has(s.id) ? adminTheme.colors.accent : adminTheme.colors.textMuted}
            />
            <Text style={styles.staffName}>{s.full_name ?? s.id.slice(0, 8)}</Text>
            {s.department ? <Text style={styles.muted}>{s.department}</Text> : null}
          </TouchableOpacity>
        ))}

        <Text style={styles.label}>Fotoğraf / video</Text>
        <View style={styles.mediaRow}>
          <TouchableOpacity style={styles.mediaBtn} onPress={() => pickMedia(true)}>
            <Ionicons name="camera-outline" size={22} color={adminTheme.colors.accent} />
            <Text style={styles.mediaBtnText}>Kamera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.mediaBtn} onPress={() => pickMedia(false)}>
            <Ionicons name="images-outline" size={22} color={adminTheme.colors.accent} />
            <Text style={styles.mediaBtnText}>Galeri</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {pendingMedia.map((m, i) => (
            <View key={`${m.uri}-${i}`} style={styles.thumbWrap}>
              {m.type === 'image' ? (
                <CachedImage uri={m.uri} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.videoThumb]}>
                  <Ionicons name="videocam" size={28} color="#fff" />
                </View>
              )}
              <TouchableOpacity
                style={styles.thumbRemove}
                onPress={() => setPendingMedia((p) => p.filter((_, j) => j !== i))}
              >
                <Ionicons name="close-circle" size={22} color="#dc2626" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>

        <AdminButton title={saving ? 'Kaydediliyor…' : 'Denetimi gönder'} onPress={submit} disabled={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  label: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.textSecondary, marginBottom: 8, marginTop: 8 },
  muted: { fontSize: 13, color: adminTheme.colors.textMuted },
  criteriaErr: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.error, marginBottom: 6 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    marginRight: 8,
  },
  chipOn: { backgroundColor: adminTheme.colors.primary },
  chipText: { fontWeight: '600', color: adminTheme.colors.text },
  chipTextOn: { color: '#fff' },
  criterionCard: { marginBottom: 10 },
  criterionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  criterionTitle: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text, flex: 1 },
  criterionPts: { fontSize: 15, fontWeight: '800', color: adminTheme.colors.accent },
  commentInput: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    fontSize: 14,
    color: adminTheme.colors.text,
  },
  areaInput: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 14,
    color: adminTheme.colors.text,
    marginBottom: 8,
  },
  staffRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  staffName: { flex: 1, fontSize: 15, fontWeight: '600', color: adminTheme.colors.text },
  mediaRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  mediaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surfaceTertiary,
  },
  mediaBtnText: { fontWeight: '600', color: adminTheme.colors.text },
  thumbWrap: { marginRight: 10, position: 'relative' },
  thumb: { width: 72, height: 72, borderRadius: 8 },
  videoThumb: { backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  thumbRemove: { position: 'absolute', top: -6, right: -6 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: adminTheme.colors.border,
    overflow: 'hidden',
  },
  stepFill: { height: '100%', backgroundColor: adminTheme.colors.accent, borderRadius: 4 },
});
