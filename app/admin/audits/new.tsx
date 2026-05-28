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
import { AUDIT_MEDIA_BUCKET, MAX_AUDIT_MEDIA, MAX_CRITERION_AUDIT_MEDIA } from '@/lib/auditMedia';
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
  const [criterionMedia, setCriterionMedia] = useState<Record<string, PendingMedia[]>>({});
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
      setCriterionMedia({});
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

  const totalCriterionMedia = useMemo(
    () => Object.values(criterionMedia).reduce((n, arr) => n + arr.length, 0),
    [criterionMedia]
  );

  const pickCriterionMedia = async (criterionId: string, criterionTitle: string, fromCamera: boolean) => {
    const current = criterionMedia[criterionId]?.length ?? 0;
    if (current >= MAX_CRITERION_AUDIT_MEDIA) {
      Alert.alert('Limit', `${criterionTitle} için en fazla ${MAX_CRITERION_AUDIT_MEDIA} dosya.`);
      return;
    }
    if (totalCriterionMedia >= MAX_AUDIT_MEDIA) {
      Alert.alert('Limit', `Toplam en fazla ${MAX_AUDIT_MEDIA} kanıt dosyası.`);
      return;
    }
    const granted = fromCamera
      ? await ensureCameraPermission({
          title: 'Kamera',
          message: 'Kriter kanıtı için kamera gerekir.',
          settingsMessage: 'Ayarlardan kamera iznini açın.',
        })
      : await ensureMediaLibraryPermission({
          title: 'Galeri',
          message: 'Fotoğraf veya video eklemek için galeri gerekir.',
          settingsMessage: 'Ayarlardan galeri iznini açın.',
        });
    if (!granted) return;
    const roomLeftCriterion = MAX_CRITERION_AUDIT_MEDIA - current;
    const roomLeftTotal = MAX_AUDIT_MEDIA - totalCriterionMedia;
    const take = Math.min(roomLeftCriterion, roomLeftTotal, fromCamera ? 1 : roomLeftCriterion);
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.85 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.All,
          allowsMultipleSelection: true,
          quality: 0.85,
        });
    if (result.canceled || !result.assets?.length) return;
    const added: PendingMedia[] = result.assets.slice(0, take).map((a) => ({
      uri: a.uri,
      type: (a.type === 'video' ? 'video' : 'image') as 'image' | 'video',
    }));
    setCriterionMedia((prev) => ({
      ...prev,
      [criterionId]: [...(prev[criterionId] ?? []), ...added],
    }));
  };

  const removeCriterionMedia = (criterionId: string, index: number) => {
    setCriterionMedia((prev) => {
      const list = [...(prev[criterionId] ?? [])];
      list.splice(index, 1);
      const next = { ...prev };
      if (list.length) next[criterionId] = list;
      else delete next[criterionId];
      return next;
    });
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
    const missingEvidenceCritical = criteria.find((c) => {
      const points = Math.round(scores[c.id] ?? c.max_points);
      if (points >= c.max_points) return false;
      const hasMedia = (criterionMedia[c.id]?.length ?? 0) > 0;
      const hasComment = (comments[c.id] ?? '').trim().length >= 8;
      return c.is_critical && !hasMedia && !hasComment;
    });
    if (missingEvidenceCritical) {
      Alert.alert(
        'Kanıt gerekli',
        `"${missingEvidenceCritical.title}" kriterinde puan düşürdünüz. Kritik kriterlerde en az bir foto/video veya açıklayıcı not zorunlu.`
      );
      return;
    }

    const totalMax = criteria.reduce((sum, c) => sum + (Number(c.max_points) || 0), 0);
    const totalGiven = criteria.reduce((sum, c) => sum + Math.round(scores[c.id] ?? c.max_points), 0);
    const roughScore = totalMax > 0 ? Math.round((totalGiven / totalMax) * 100) : 100;
    if (roughScore < 70 && totalCriterionMedia === 0) {
      Alert.alert(
        'Düşük puan için kanıt zorunlu',
        'Genel puan 70 altında görünüyor. Ciddiyet için en az 1 fotoğraf/video kanıtı ekleyin.'
      );
      return;
    }

    setSaving(true);
    try {
      const mediaUrls: {
        url: string;
        mediaType: 'image' | 'video';
        criterionId: string;
      }[] = [];
      for (const c of criteria) {
        const pending = criterionMedia[c.id] ?? [];
        for (const m of pending) {
          const { publicUrl } = await uploadUriToPublicBucket({
            bucketId: AUDIT_MEDIA_BUCKET,
            uri: m.uri,
            kind: m.type === 'video' ? 'video' : 'image',
            subfolder: `sessions/${c.id}`,
          });
          mediaUrls.push({ url: publicUrl, mediaType: m.type, criterionId: c.id });
        }
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
          const mediaForCriterion = criterionMedia[c.id] ?? [];
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

            <Text style={styles.evidenceLabel}>Kanıt — puan gerekçesi (isteğe bağlı)</Text>
            <View style={styles.mediaRow}>
              <TouchableOpacity
                style={styles.mediaBtn}
                onPress={() => pickCriterionMedia(c.id, c.title, true)}
              >
                <Ionicons name="camera-outline" size={20} color={adminTheme.colors.accent} />
                <Text style={styles.mediaBtnText}>Kamera</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.mediaBtn}
                onPress={() => pickCriterionMedia(c.id, c.title, false)}
              >
                <Ionicons name="images-outline" size={20} color={adminTheme.colors.accent} />
                <Text style={styles.mediaBtnText}>Galeri</Text>
              </TouchableOpacity>
              {mediaForCriterion.length > 0 ? (
                <Text style={styles.mediaCount}>
                  {mediaForCriterion.length}/{MAX_CRITERION_AUDIT_MEDIA}
                </Text>
              ) : null}
            </View>
            {mediaForCriterion.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.criterionThumbScroll}>
                {mediaForCriterion.map((m, i) => (
                  <View key={`${m.uri}-${i}`} style={styles.thumbWrap}>
                    {m.type === 'image' ? (
                      <CachedImage uri={m.uri} style={styles.thumb} />
                    ) : (
                      <View style={[styles.thumb, styles.videoThumb]}>
                        <Ionicons name="videocam" size={24} color="#fff" />
                      </View>
                    )}
                    <TouchableOpacity
                      style={styles.thumbRemove}
                      onPress={() => removeCriterionMedia(c.id, i)}
                    >
                      <Ionicons name="close-circle" size={20} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.evidenceHint}>Bu kriter için fotoğraf veya video ekleyebilirsiniz.</Text>
            )}
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

        {totalCriterionMedia > 0 ? (
          <Text style={styles.totalMediaHint}>
            Toplam {totalCriterionMedia} kanıt dosyası eklendi (en fazla {MAX_AUDIT_MEDIA}).
          </Text>
        ) : null}

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
  evidenceLabel: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: '700',
    color: adminTheme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  evidenceHint: {
    marginTop: 6,
    fontSize: 12,
    color: adminTheme.colors.textMuted,
    fontStyle: 'italic',
  },
  mediaCount: {
    marginLeft: 'auto',
    fontSize: 12,
    fontWeight: '700',
    color: adminTheme.colors.textMuted,
  },
  criterionThumbScroll: { marginTop: 8 },
  totalMediaHint: {
    fontSize: 12,
    color: adminTheme.colors.textMuted,
    marginBottom: 8,
    textAlign: 'center',
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
  mediaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' },
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
