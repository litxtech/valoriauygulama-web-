import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { adminTheme } from '@/constants/adminTheme';
import {
  applyStaffPerfEvent,
  fetchStaffPerfCategories,
  fetchStaffPerfCriteria,
  STAFF_PERF_MEDIA_BUCKET,
  type StaffPerfCategory,
  type StaffPerfCriterion,
} from '@/lib/staffPerfSystem';
import { PERF_QUICK_PRESETS, getPerfBand } from '@/lib/staffPerfBands';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { CachedImage } from '@/components/CachedImage';
import { supabase } from '@/lib/supabase';
import { sortStaffAdminFirst } from '@/lib/sortStaffAdminFirst';

type StaffRow = {
  id: string;
  full_name: string | null;
  department: string | null;
  role?: string | null;
  performance_score?: number | null;
};

const TEAL = '#0f3d3a';
const TEAL_SOFT = '#ecfdf5';

function SectionCard({
  step,
  title,
  subtitle,
  children,
}: {
  step: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>{step}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          {subtitle ? <Text style={styles.cardSub}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

export default function StaffPerfEventScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { staffId: initialStaffId } = useLocalSearchParams<{ staffId?: string }>();
  const { staff } = useAuthStore();
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);

  const orgId = useMemo(() => {
    if (staff?.app_permissions?.super_admin === true || staff?.role === 'admin') {
      return selectedOrganizationId && selectedOrganizationId !== 'all'
        ? selectedOrganizationId
        : staff?.organization_id;
    }
    return staff?.organization_id ?? null;
  }, [staff, selectedOrganizationId]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [staffQuery, setStaffQuery] = useState('');
  const [staffPickerOpen, setStaffPickerOpen] = useState(!initialStaffId);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(initialStaffId ?? null);
  const [categories, setCategories] = useState<StaffPerfCategory[]>([]);
  const [criteria, setCriteria] = useState<StaffPerfCriterion[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [criterionId, setCriterionId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [delta, setDelta] = useState('1');
  const [signatureName, setSignatureName] = useState(staff?.full_name ?? '');
  const [photos, setPhotos] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [evidence, setEvidence] = useState<string[]>([]);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    (async () => {
      const [cats, sRes] = await Promise.all([
        fetchStaffPerfCategories(orgId),
        supabase
          .from('staff')
          .select('id, full_name, department, role, performance_score')
          .eq('organization_id', orgId)
          .eq('is_active', true)
          .order('full_name'),
      ]);
      setCategories(cats.data);
      const rows = (sRes.data ?? []) as StaffRow[];
      setStaffList(
        sortStaffAdminFirst(rows, (a, b) =>
          (a.full_name || '').localeCompare(b.full_name || '', 'tr')
        ) as StaffRow[]
      );
      if (!selectedStaffId && initialStaffId) setSelectedStaffId(initialStaffId);
      if (cats.data[0] && !categoryId) setCategoryId(cats.data[0].id);
      setLoading(false);
    })();
  }, [orgId]);

  useEffect(() => {
    if (!categoryId) {
      setCriteria([]);
      return;
    }
    void (async () => {
      const { data } = await fetchStaffPerfCriteria(categoryId);
      setCriteria(data);
      setCriterionId(null);
    })();
  }, [categoryId]);

  const selectedStaff = useMemo(
    () => staffList.find((s) => s.id === selectedStaffId) ?? null,
    [staffList, selectedStaffId]
  );

  const filteredStaff = useMemo(() => {
    const q = staffQuery.trim().toLocaleLowerCase('tr');
    if (!q) return staffList;
    return staffList.filter((s) =>
      `${s.full_name ?? ''} ${s.department ?? ''}`.toLocaleLowerCase('tr').includes(q)
    );
  }, [staffList, staffQuery]);

  const deltaNum = Number(delta);
  const deltaValid = Number.isFinite(deltaNum) && deltaNum !== 0;
  const previewAfter =
    selectedStaff && deltaValid
      ? Math.max(0, Math.min(100, Math.round(Number(selectedStaff.performance_score ?? 100) + deltaNum)))
      : null;
  const previewBand = previewAfter != null ? getPerfBand(previewAfter) : null;

  const applyPreset = (preset: (typeof PERF_QUICK_PRESETS)[number]) => {
    setTitle(preset.title);
    setDelta(String(preset.delta));
    if (preset.categorySlug) {
      const cat = categories.find((c) => c.slug === preset.categorySlug);
      if (cat) setCategoryId(cat.id);
    }
  };

  const pickMedia = async (kind: 'photo' | 'video' | 'evidence', fromCamera: boolean) => {
    if (fromCamera) {
      const ok = await ensureCameraPermission();
      if (!ok) return;
    } else {
      const ok = await ensureMediaLibraryPermission();
      if (!ok) return;
    }
    const result =
      kind === 'video'
        ? fromCamera
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'], quality: 0.7 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 0.7 })
        : fromCamera
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || !result.assets?.[0]?.uri || !orgId || !staff?.id) return;
    try {
      const { publicUrl } = await uploadUriToPublicBucket({
        bucketId: STAFF_PERF_MEDIA_BUCKET,
        uri: result.assets[0].uri,
        kind: kind === 'video' ? 'video' : 'image',
        subfolder: `staff-perf/${orgId}/${staff.id}`,
      });
      if (kind === 'photo') setPhotos((p) => [...p, publicUrl]);
      else if (kind === 'video') setVideos((p) => [...p, publicUrl]);
      else setEvidence((p) => [...p, publicUrl]);
    } catch (e) {
      Alert.alert('Yükleme', (e as Error).message || 'Dosya yüklenemedi');
    }
  };

  const onCriterionPick = (c: StaffPerfCriterion) => {
    setCriterionId(c.id);
    setTitle(c.title);
    setDelta(String(c.default_delta));
  };

  const submit = useCallback(async () => {
    if (!orgId || !staff?.id) return;
    if (!selectedStaffId) {
      Alert.alert('Eksik', 'Personel seçin.');
      return;
    }
    const deltaPoints = Number(delta);
    if (!Number.isFinite(deltaPoints) || deltaPoints === 0) {
      Alert.alert('Puan', 'Sıfır olmayan artı/eksi puan girin.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Eksik', 'Olay başlığı zorunlu.');
      return;
    }
    setSaving(true);
    const { data, error } = await applyStaffPerfEvent({
      organizationId: orgId,
      staffId: selectedStaffId,
      auditorStaffId: staff.id,
      title: title.trim(),
      deltaPoints: Math.max(-50, Math.min(50, Math.round(deltaPoints))),
      note,
      categoryId,
      criterionId,
      photoUrls: photos,
      videoUrls: videos,
      evidenceUrls: evidence,
      signatureName: signatureName.trim() || staff.full_name,
      signatureData: signatureName.trim() ? `typed:${signatureName.trim()}` : null,
    });
    setSaving(false);
    if (error || !data) {
      Alert.alert('Kayıt başarısız', error ?? 'Bilinmeyen hata');
      return;
    }
    Alert.alert(
      'Onay kaydı oluştu',
      `${data.report_number}\nPuan: ${data.score_before} → ${data.score_after} (${data.delta_points > 0 ? '+' : ''}${data.delta_points})`,
      [
        {
          text: 'Dosyaya git',
          onPress: () => router.replace(`/admin/staff-perf/${selectedStaffId}`),
        },
        { text: 'Tamam', onPress: () => router.back() },
      ]
    );
  }, [
    orgId,
    staff,
    selectedStaffId,
    delta,
    title,
    note,
    categoryId,
    criterionId,
    photos,
    videos,
    evidence,
    signatureName,
    router,
  ]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={TEAL} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, { paddingBottom: 100 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>Resmi kayıt</Text>
          <Text style={styles.heroTitle}>Denetim onay kaydı</Text>
          <Text style={styles.heroSub}>
            Tek performans puanına artı/eksi işlenir. Kayıt silinmez; tarih, saat ve denetçi
            otomatik loglanır.
          </Text>
        </View>

        <SectionCard step={1} title="Personel" subtitle="Değerlendirilecek personeli seçin">
          {selectedStaff && !staffPickerOpen ? (
            <Pressable
              style={styles.selectedStaff}
              onPress={() => setStaffPickerOpen(true)}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(selectedStaff.full_name || '?').slice(0, 1).toLocaleUpperCase('tr')}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.selectedName}>{selectedStaff.full_name || '—'}</Text>
                <Text style={styles.selectedMeta}>
                  {selectedStaff.department || 'Departman yok'} · Puan{' '}
                  {Math.round(Number(selectedStaff.performance_score ?? 100))}
                </Text>
              </View>
              <Text style={styles.changeLink}>Değiştir</Text>
            </Pressable>
          ) : (
            <View>
              <View style={styles.searchBox}>
                <Ionicons name="search" size={16} color={adminTheme.colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  value={staffQuery}
                  onChangeText={setStaffQuery}
                  placeholder="İsim veya departman ara…"
                  placeholderTextColor={adminTheme.colors.textMuted}
                  autoFocus={!selectedStaff}
                />
                {staffQuery ? (
                  <TouchableOpacity onPress={() => setStaffQuery('')}>
                    <Ionicons name="close-circle" size={18} color={adminTheme.colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={styles.staffList}>
                <ScrollView
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  style={{ maxHeight: 260 }}
                  showsVerticalScrollIndicator={filteredStaff.length > 5}
                >
                  {filteredStaff.slice(0, 20).map((s) => {
                    const on = selectedStaffId === s.id;
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.staffRow, on && styles.staffRowOn]}
                        onPress={() => {
                          setSelectedStaffId(s.id);
                          setStaffPickerOpen(false);
                          setStaffQuery('');
                        }}
                        activeOpacity={0.85}
                      >
                        <View style={[styles.avatarSm, on && styles.avatarSmOn]}>
                          <Text style={[styles.avatarTextSm, on && { color: '#fff' }]}>
                            {(s.full_name || '?').slice(0, 1).toLocaleUpperCase('tr')}
                          </Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.staffName} numberOfLines={1}>
                            {s.full_name || '—'}
                          </Text>
                          <Text style={styles.staffMeta} numberOfLines={1}>
                            {s.department || '—'}
                          </Text>
                        </View>
                        <Text style={styles.staffScore}>
                          {Math.round(Number(s.performance_score ?? 100))}
                        </Text>
                        {on ? <Ionicons name="checkmark-circle" size={20} color={TEAL} /> : null}
                      </TouchableOpacity>
                    );
                  })}
                  {filteredStaff.length === 0 ? (
                    <Text style={styles.emptyInline}>Sonuç yok</Text>
                  ) : null}
                </ScrollView>
              </View>
            </View>
          )}
        </SectionCard>

        <SectionCard step={2} title="Hızlı şablon" subtitle="Sık kullanılan olaylar">
          <View style={styles.presetGrid}>
            {PERF_QUICK_PRESETS.map((p) => {
              const pos = p.delta > 0;
              const active = title === p.title;
              return (
                <TouchableOpacity
                  key={p.title}
                  style={[styles.presetChip, active && styles.presetChipOn]}
                  onPress={() => applyPreset(p)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.presetDelta, { color: pos ? '#047857' : '#b91c1c' }]}>
                    {pos ? '+' : ''}
                    {p.delta}
                  </Text>
                  <Text style={styles.presetTitle} numberOfLines={2}>
                    {p.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </SectionCard>

        <SectionCard step={3} title="Denetim başlığı" subtitle="10 resmi kategori">
          <View style={styles.catGrid}>
            {categories.map((c) => {
              const on = categoryId === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.catChip, on && styles.catChipOn]}
                  onPress={() => setCategoryId(c.id)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.catText, on && styles.catTextOn]} numberOfLines={1}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {criteria.length > 0 ? (
            <View style={styles.criteriaWrap}>
              <Text style={styles.criteriaLabel}>Madde seçin</Text>
              {criteria.map((c) => {
                const on = criterionId === c.id;
                const pos = c.default_delta >= 0;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.critRow, on && styles.critOn]}
                    onPress={() => onCriterionPick(c)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.critTitle, on && styles.critTitleOn]} numberOfLines={2}>
                      {c.title}
                    </Text>
                    <View style={[styles.critDelta, { backgroundColor: pos ? '#d1fae5' : '#fee2e2' }]}>
                      <Text style={{ fontWeight: '800', color: pos ? '#047857' : '#b91c1c', fontSize: 12 }}>
                        {c.default_delta > 0 ? '+' : ''}
                        {c.default_delta}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </SectionCard>

        <SectionCard step={4} title="Puan ve açıklama">
          <Text style={styles.fieldLabel}>Olay başlığı</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Örn. Misafir teşekkür etti"
            placeholderTextColor={adminTheme.colors.textMuted}
          />

          <Text style={styles.fieldLabel}>Artı / eksi puan</Text>
          <View style={styles.deltaRow}>
            <TouchableOpacity
              style={styles.deltaBtn}
              onPress={() => setDelta(String((Number.isFinite(deltaNum) ? deltaNum : 0) - 1))}
            >
              <Ionicons name="remove" size={20} color={TEAL} />
            </TouchableOpacity>
            <TextInput
              style={styles.deltaInput}
              value={delta}
              onChangeText={setDelta}
              keyboardType="numbers-and-punctuation"
              textAlign="center"
            />
            <TouchableOpacity
              style={styles.deltaBtn}
              onPress={() => setDelta(String((Number.isFinite(deltaNum) ? deltaNum : 0) + 1))}
            >
              <Ionicons name="add" size={20} color={TEAL} />
            </TouchableOpacity>
          </View>

          {previewAfter != null && previewBand ? (
            <View style={[styles.previewBox, { borderColor: previewBand.color, backgroundColor: previewBand.bg }]}>
              <Text style={[styles.previewLabel, { color: previewBand.color }]}>Önizleme</Text>
              <Text style={[styles.previewValue, { color: previewBand.color }]}>
                {Math.round(Number(selectedStaff?.performance_score ?? 100))} → {previewAfter}
                {'  ·  '}
                {previewBand.labelTr}
              </Text>
            </View>
          ) : null}

          <Text style={styles.fieldLabel}>Denetçi notu</Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="Gözlem, yer, saat detayı…"
            placeholderTextColor={adminTheme.colors.textMuted}
            textAlignVertical="top"
          />
        </SectionCard>

        <SectionCard step={5} title="Kanıt ve imza" subtitle="Fotoğraf, video, dosya">
          <View style={styles.mediaRow}>
            {(
              [
                { kind: 'photo' as const, cam: true, icon: 'camera' as const, label: 'Kamera' },
                { kind: 'photo' as const, cam: false, icon: 'images' as const, label: 'Galeri' },
                { kind: 'video' as const, cam: false, icon: 'videocam' as const, label: 'Video' },
                { kind: 'evidence' as const, cam: false, icon: 'attach' as const, label: 'Kanıt' },
              ] as const
            ).map((m) => (
              <TouchableOpacity
                key={`${m.kind}-${m.label}`}
                style={styles.mediaBtn}
                onPress={() => void pickMedia(m.kind, m.cam)}
              >
                <Ionicons name={m.icon} size={18} color={TEAL} />
                <Text style={styles.mediaBtnText}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {(photos.length > 0 || videos.length > 0 || evidence.length > 0) && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbsScroll}>
              {photos.map((u) => (
                <CachedImage key={u} uri={u} style={styles.thumb} />
              ))}
              {videos.map((u) => (
                <View key={u} style={[styles.thumb, styles.videoThumb]}>
                  <Ionicons name="videocam" size={18} color="#fff" />
                </View>
              ))}
              {evidence.map((u) => (
                <View key={u} style={[styles.thumb, styles.videoThumb]}>
                  <Ionicons name="document" size={18} color="#fff" />
                </View>
              ))}
            </ScrollView>
          )}

          <Text style={styles.fieldLabel}>Elektronik imza (ad soyad)</Text>
          <TextInput
            style={styles.input}
            value={signatureName}
            onChangeText={setSignatureName}
            placeholder="Denetçi adı"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        </SectionCard>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(12, insets.bottom) }]}>
        <View style={styles.footerMeta}>
          <Text style={styles.footerMetaText} numberOfLines={1}>
            {selectedStaff?.full_name || 'Personel seçilmedi'}
          </Text>
          <Text
            style={[
              styles.footerDelta,
              { color: deltaValid ? (deltaNum > 0 ? '#047857' : '#b91c1c') : adminTheme.colors.textMuted },
            ]}
          >
            {deltaValid ? `${deltaNum > 0 ? '+' : ''}${Math.round(deltaNum)} puan` : 'Puan yok'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.submitBtn, saving && { opacity: 0.7 }]}
          onPress={() => void submit()}
          disabled={saving}
          activeOpacity={0.9}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="shield-checkmark" size={18} color="#fff" />
              <Text style={styles.submitText}>Onayla ve kaydet</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  root: { flex: 1 },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: adminTheme.colors.surfaceSecondary },

  hero: {
    backgroundColor: TEAL,
    borderRadius: 16,
    padding: 16,
    marginBottom: 4,
  },
  heroEyebrow: {
    color: '#99f6e4',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 4 },
  heroSub: { color: 'rgba(248,250,252,0.82)', fontSize: 12, lineHeight: 17, marginTop: 6 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    overflow: 'hidden',
    ...adminTheme.shadow.sm,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: adminTheme.colors.border,
    backgroundColor: '#fafbfc',
  },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: TEAL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: adminTheme.colors.text },
  cardSub: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 2 },
  cardBody: { padding: 14 },

  selectedStaff: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: TEAL_SOFT,
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: TEAL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  avatarSm: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmOn: { backgroundColor: TEAL },
  avatarTextSm: { fontWeight: '800', fontSize: 13, color: '#475569' },
  selectedName: { fontWeight: '800', fontSize: 15, color: adminTheme.colors.text },
  selectedMeta: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  changeLink: { color: TEAL, fontWeight: '700', fontSize: 12 },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    marginBottom: 10,
  },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 14, color: adminTheme.colors.text },
  staffList: { gap: 0 },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: '#fff',
    marginBottom: 6,
  },
  staffRowOn: { borderColor: TEAL, backgroundColor: TEAL_SOFT },
  staffName: { fontWeight: '700', fontSize: 13, color: adminTheme.colors.text },
  staffMeta: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 1 },
  staffScore: { fontWeight: '800', fontSize: 13, color: TEAL, minWidth: 28, textAlign: 'right' },
  emptyInline: { textAlign: 'center', color: adminTheme.colors.textMuted, paddingVertical: 16 },

  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetChip: {
    width: '48%',
    flexGrow: 1,
    minWidth: '46%',
    maxWidth: '48%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  presetChipOn: { borderColor: TEAL, backgroundColor: TEAL_SOFT },
  presetDelta: { fontWeight: '800', fontSize: 14 },
  presetTitle: { fontSize: 12, color: adminTheme.colors.textSecondary, marginTop: 4, lineHeight: 16 },

  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  catChipOn: { backgroundColor: TEAL, borderColor: TEAL },
  catText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.text },
  catTextOn: { color: '#fff' },

  criteriaWrap: { marginTop: 14, gap: 6 },
  criteriaLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: adminTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  critRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: '#fff',
  },
  critOn: { borderColor: TEAL, backgroundColor: TEAL_SOFT },
  critTitle: { flex: 1, fontSize: 13, color: adminTheme.colors.text, fontWeight: '600' },
  critTitleOn: { color: TEAL },
  critDelta: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },

  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: adminTheme.colors.textSecondary,
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: adminTheme.colors.text,
    fontSize: 14,
    marginBottom: 12,
  },
  noteInput: { minHeight: 88 },

  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  deltaBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: TEAL_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deltaInput: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: '#fff',
    fontSize: 18,
    fontWeight: '800',
    color: adminTheme.colors.text,
  },
  previewBox: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  previewLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  previewValue: { fontSize: 14, fontWeight: '800', marginTop: 2 },

  mediaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  mediaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: TEAL_SOFT,
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  mediaBtnText: { fontSize: 12, fontWeight: '700', color: TEAL },
  thumbsScroll: { marginBottom: 12 },
  thumb: { width: 64, height: 64, borderRadius: 10, marginRight: 8 },
  videoThumb: { backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center' },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: adminTheme.colors.border,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
    ...adminTheme.shadow.md,
  },
  footerMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  footerMetaText: { flex: 1, fontSize: 12, fontWeight: '600', color: adminTheme.colors.textSecondary },
  footerDelta: { fontSize: 12, fontWeight: '800' },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: TEAL,
    borderRadius: 14,
    paddingVertical: 14,
  },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
