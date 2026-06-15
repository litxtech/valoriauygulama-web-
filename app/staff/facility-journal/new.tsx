import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation, usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { AdminStackBackButton } from '@/lib/adminStackBack';
import { StaffStackBackButton } from '@/lib/staffStackBack';
import { FacilityJournalAccessGate } from '@/components/staff/FacilityJournalAccessGate';
import { useAuthStore } from '@/stores/authStore';
import { FacilityJournalViewerPicker } from '@/components/facilityJournal/FacilityJournalViewerPicker';
import {
  createFacilityJournalRecord,
  listFacilityJournalRecordTypes,
  seedDefaultFacilityJournalTypes,
  upsertFacilityJournalRecordType,
  type FacilityJournalRecordTypeRow,
} from '@/lib/facilityJournal';
import { useTranslation } from 'react-i18next';
import {
  MAX_FACILITY_JOURNAL_MEDIA,
  facilityJournalMediaPickerCameraOptions,
  facilityJournalMediaPickerGalleryOptions,
  prepareFacilityJournalUploadUri,
  uploadFacilityJournalMediaBatch,
  type FacilityJournalMediaLabel,
} from '@/lib/facilityJournalMedia';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { resolveFeedPickedMediaUri } from '@/lib/feedPostMediaPicker';
import { buildEarlyVideoPreview } from '@/lib/chatVideoThumbnail';
import { FacilityJournalMediaPreview } from '@/components/facilityJournal/FacilityJournalMediaPreview';
import { canManageFacilityJournalTypes } from '@/lib/staffPermissions';
import { FastPress } from '@/components/ui/FastPress';
import { theme } from '@/constants/theme';

type PendingMedia = {
  uri: string;
  type: 'image' | 'video';
  label: FacilityJournalMediaLabel;
  posterUri?: string | null;
  preparedUri?: string;
  preparing?: boolean;
};

const TYPE_TINTS: Record<string, string> = {
  kullanim: '#0d9488',
  kurulum: '#2563eb',
  bakim: '#ea580c',
  zimmet: '#7c3aed',
  emanet: '#0891b2',
  degisiklik: '#dc2626',
};

function typeTint(slug: string) {
  return TYPE_TINTS[slug] ?? theme.colors.primary;
}

function typeIcon(icon: string | null): keyof typeof Ionicons.glyphMap {
  return (icon ?? 'document-text-outline') as keyof typeof Ionicons.glyphMap;
}

function Section({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIconWrap}>
          <Ionicons name={icon} size={18} color={theme.colors.primary} />
        </View>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

function FacilityJournalNewScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const pathname = usePathname();
  const staff = useAuthStore((s) => s.staff);
  const isAdminRoute = pathname?.startsWith('/admin') ?? false;
  const isAdmin = staff?.role === 'admin';
  const canManageTypes = canManageFacilityJournalTypes(staff);
  const base = isAdminRoute ? '/admin/facility-journal' : '/staff/facility-journal';
  const orgId = staff?.organization_id;
  const staffId = staff?.id;

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

  const [types, setTypes] = useState<FacilityJournalRecordTypeRow[]>([]);
  const [typeId, setTypeId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationDetail, setLocationDetail] = useState('');
  const [counterpartyName, setCounterpartyName] = useState('');
  const [recordDate, setRecordDate] = useState(new Date().toISOString().slice(0, 10));
  const [media, setMedia] = useState<PendingMedia[]>([]);
  const [viewerStaffIds, setViewerStaffIds] = useState<string[]>([]);
  const [viewerGuestIds, setViewerGuestIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [typesLoading, setTypesLoading] = useState(true);
  const [pickingMedia, setPickingMedia] = useState(false);
  const [uploadStep, setUploadStep] = useState<string | null>(null);
  const [newTypeName, setNewTypeName] = useState('');
  const [typeSaving, setTypeSaving] = useState(false);
  const [editCategories, setEditCategories] = useState(false);

  const loadTypes = useCallback(async () => {
    if (!orgId || !staffId) return;
    setTypesLoading(true);
    try {
      let { data } = await listFacilityJournalRecordTypes(orgId, true);
      let rows = (data as FacilityJournalRecordTypeRow[]) ?? [];
      if (rows.length === 0 && isAdmin) {
        await seedDefaultFacilityJournalTypes(orgId, staffId);
        ({ data } = await listFacilityJournalRecordTypes(orgId, true));
        rows = (data as FacilityJournalRecordTypeRow[]) ?? [];
      }
      setTypes(rows);
      setTypeId((prev) => {
        if (prev && rows.some((r) => r.id === prev)) return prev;
        return rows[0]?.id || '';
      });
    } finally {
      setTypesLoading(false);
    }
  }, [orgId, staffId, isAdmin]);

  useEffect(() => {
    void loadTypes();
  }, [loadTypes]);

  const addCategory = async () => {
    if (!orgId || !staffId || !newTypeName.trim()) {
      Alert.alert(t('error'), t('staffFjTypeNameRequired'));
      return;
    }
    setTypeSaving(true);
    const { data, error } = await upsertFacilityJournalRecordType({
      organizationId: orgId,
      staffId,
      name: newTypeName.trim(),
    });
    setTypeSaving(false);
    if (error) {
      Alert.alert(t('error'), (error as { message?: string }).message ?? 'Kaydedilemedi');
      return;
    }
    setNewTypeName('');
    await loadTypes();
    const row = data as FacilityJournalRecordTypeRow | null;
    if (row?.id) setTypeId(row.id);
  };

  const removeCategory = (row: FacilityJournalRecordTypeRow) => {
    if (types.length <= 1) {
      Alert.alert('Uyarı', 'En az bir aktif kategori kalmalıdır.');
      return;
    }
    Alert.alert(
      'Kategoriyi kaldır',
      `"${row.name}" kategorisi listeden kaldırılsın mı? Mevcut kayıtlar etkilenmez.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Kaldır',
          style: 'destructive',
          onPress: async () => {
            if (!orgId || !staffId) return;
            setTypeSaving(true);
            const { error } = await upsertFacilityJournalRecordType({
              organizationId: orgId,
              staffId,
              id: row.id,
              name: row.name,
              icon: row.icon,
              sortOrder: row.sort_order,
              isActive: false,
            });
            setTypeSaving(false);
            if (error) {
              Alert.alert(t('error'), (error as { message?: string }).message ?? 'Kaldırılamadı');
              return;
            }
            if (typeId === row.id) setTypeId('');
            await loadTypes();
          },
        },
      ]
    );
  };

  const pickMedia = useCallback(
    async (fromCamera: boolean) => {
      if (pickingMedia) return;
      if (media.length >= MAX_FACILITY_JOURNAL_MEDIA) {
        Alert.alert('Limit', `En fazla ${MAX_FACILITY_JOURNAL_MEDIA} medya ekleyebilirsiniz.`);
        return;
      }

      setPickingMedia(true);
      try {
        const granted = fromCamera
          ? await ensureCameraPermission({
              title: t('staffCameraPermTitle'),
              message: t('staffFjCameraPermMsg'),
              settingsMessage: t('staffFjCameraSettings'),
            })
          : await ensureMediaLibraryPermission({
              title: t('staffGalleryPermTitle'),
              message: t('staffFjGalleryPermMsg'),
              settingsMessage: t('staffFjGallerySettings'),
            });
        if (!granted) return;

        const result = fromCamera
          ? await ImagePicker.launchCameraAsync(facilityJournalMediaPickerCameraOptions)
          : await ImagePicker.launchImageLibraryAsync({
              ...facilityJournalMediaPickerGalleryOptions,
              selectionLimit: MAX_FACILITY_JOURNAL_MEDIA - media.length,
            });

        if (result.canceled || !result.assets?.length) return;

        const added: PendingMedia[] = [];
        for (const asset of result.assets) {
          if (media.length + added.length >= MAX_FACILITY_JOURNAL_MEDIA) break;
          const resolved = await resolveFeedPickedMediaUri(asset);
          if (resolved.uri) {
            let posterUri: string | null = null;
            if (resolved.type === 'video') {
              const early = await buildEarlyVideoPreview(resolved.uri);
              posterUri = early.posterUri;
            }
            added.push({ uri: resolved.uri, type: resolved.type, label: 'general', posterUri });
          }
        }
        if (added.length) {
          setMedia((m) => [...m, ...added.map((a) => ({ ...a, preparing: true }))]);
          void (async () => {
            for (const item of added) {
              try {
                const preparedUri = await prepareFacilityJournalUploadUri(item.uri, item.type);
                setMedia((prev) =>
                  prev.map((x) =>
                    x.uri === item.uri ? { ...x, preparedUri, preparing: false } : x
                  )
                );
              } catch {
                setMedia((prev) =>
                  prev.map((x) => (x.uri === item.uri ? { ...x, preparing: false } : x))
                );
              }
            }
          })();
        }
      } catch (e) {
        Alert.alert(t('error'), (e as Error)?.message ?? t('staffFjMediaOpenFailed'));
      } finally {
        setPickingMedia(false);
      }
    },
    [media.length, pickingMedia, t]
  );

  const toggleViewerStaff = (id: string) => {
    setViewerStaffIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleViewerGuest = (id: string) => {
    setViewerGuestIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const canSubmit = useMemo(
    () => !!typeId && title.trim().length > 0 && media.length > 0 && !typesLoading,
    [typeId, title, media.length, typesLoading]
  );

  const submit = async () => {
    if (!orgId || !staffId) {
      Alert.alert(t('error'), t('staffFjNoSession'));
      return;
    }
    if (!typeId) {
      Alert.alert(t('error'), t('staffFjSelectType'));
      return;
    }
    if (!title.trim()) {
      Alert.alert(t('error'), t('staffFjTitleRequired'));
      return;
    }
    if (!media.length) {
      Alert.alert(t('error'), t('staffFjMediaRequired'));
      return;
    }

    setSaving(true);
    try {
      setUploadStep(t('staffFjPreparingMedia'));
      const uploadUris: string[] = [];
      for (let idx = 0; idx < media.length; idx++) {
        const m = media[idx];
        if (m.preparedUri) {
          uploadUris.push(m.preparedUri);
          continue;
        }
        uploadUris.push(
          await prepareFacilityJournalUploadUri(m.uri, m.type, (step) =>
            setUploadStep(`${idx + 1}/${media.length}: ${step}`)
          )
        );
      }

      setUploadStep(t('staffFjUploadingMedia'));

      const uploadResults = await uploadFacilityJournalMediaBatch({
        items: uploadUris.map((uri, i) => ({
          uri,
          kind: media[i].type,
          skipPrepare: true,
        })),
        organizationId: orgId,
        onProgress: (done, total, step) => setUploadStep(`${done}/${total} — ${step}`),
      });

      const uploaded = uploadResults.map((r, i) => ({
        storagePath: r.path,
        publicUrl: r.publicUrl,
        mediaType: media[i].type,
        label: media[i].label,
        sortOrder: i,
        thumbnailUrl: r.thumbnailUrl,
      }));

      setUploadStep(t('staffFjSavingRecord'));

      const { data, error } = await createFacilityJournalRecord(orgId, staffId, {
        typeId,
        title: title.trim(),
        description: description.trim() || null,
        locationDetail: locationDetail.trim() || null,
        counterpartyName: counterpartyName.trim() || null,
        recordDate,
        media: uploaded,
        viewerStaffIds,
        viewerGuestIds,
      });

      if (error || !data) throw new Error(error ?? t('staffFjCreateFailed'));

      Alert.alert('Kaydedildi', `Referans: ${data.reference_code}`, [
        { text: 'Tamam', onPress: () => router.replace(`${base}/${data.id}` as never) },
      ]);
    } catch (e) {
      const msg = (e as Error).message ?? t('staffFjCreateFailed');
      const lower = msg.toLowerCase();
      Alert.alert(
        t('error'),
        lower.includes('zaman aşım')
          ? msg
          : lower.includes('okunamadı') || lower.includes('base64') || lower.includes('video')
            ? t('staffFjVideoProcessFailed')
            : msg
      );
    } finally {
      setSaving(false);
      setUploadStep(null);
    }
  };

  if (!typesLoading && !types.length) {
    return (
      <View style={styles.centered}>
        <View style={styles.emptyIcon}>
          <Ionicons name="folder-open-outline" size={36} color={theme.colors.textMuted} />
        </View>
        <Text style={styles.emptyTitle}>Kategori bulunamadı</Text>
        <Text style={styles.emptyTypes}>
          {isAdmin ? t('staffFjNoTypes') : t('staffFjTypeNotDefined')}
        </Text>
        {canManageTypes ? (
          <View style={styles.emptyAddRow}>
            <TextInput
              style={styles.emptyInput}
              placeholder={t('staffFjNewTypePh')}
              placeholderTextColor={theme.colors.textMuted}
              value={newTypeName}
              onChangeText={setNewTypeName}
            />
            <FastPress style={styles.emptyAddBtn} onPress={addCategory} disabled={typeSaving}>
              {typeSaving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="add" size={22} color="#fff" />
              )}
            </FastPress>
          </View>
        ) : null}
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
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="camera" size={28} color={theme.colors.primary} />
          </View>
          <Text style={styles.heroTitle}>{t('staffFacilityJournalNew')}</Text>
          <Text style={styles.heroHint}>
            Otel eşyası kullanımını fotoğraf veya video ile belgeleyin. Devir, teslim, zimmet ve diğer
            kategorilerden birini seçin.
          </Text>
        </View>

        <Section
          title="Kategori"
          subtitle={canManageTypes ? 'Seçin veya yeni kategori ekleyin' : 'Kayıt türünü seçin'}
          icon="pricetag-outline"
        >
          {typesLoading ? (
            <ActivityIndicator style={styles.typesLoader} color={theme.colors.primary} />
          ) : (
            <>
              {canManageTypes ? (
                <FastPress
                  style={[styles.editToggle, editCategories && styles.editToggleActive]}
                  onPress={() => setEditCategories((v) => !v)}
                >
                  <Ionicons
                    name={editCategories ? 'checkmark-circle' : 'create-outline'}
                    size={16}
                    color={editCategories ? theme.colors.primary : theme.colors.textSecondary}
                  />
                  <Text style={[styles.editToggleText, editCategories && styles.editToggleTextActive]}>
                    {editCategories ? 'Düzenleme tamam' : 'Kategorileri düzenle'}
                  </Text>
                </FastPress>
              ) : null}

              <View style={styles.typeGrid}>
                {types.map((typeRow) => {
                  const active = typeId === typeRow.id;
                  const tint = typeTint(typeRow.slug);
                  return (
                    <View key={typeRow.id} style={styles.typeCardWrap}>
                      <FastPress
                        style={[
                          styles.typeCard,
                          active && { borderColor: tint, backgroundColor: `${tint}12` },
                        ]}
                        onPress={() => setTypeId(typeRow.id)}
                        disabled={editCategories && canManageTypes}
                      >
                        <View style={[styles.typeIconWrap, { backgroundColor: `${tint}18` }]}>
                          <Ionicons name={typeIcon(typeRow.icon)} size={22} color={tint} />
                        </View>
                        <Text style={[styles.typeLabel, active && { color: tint, fontWeight: '800' }]}>
                          {typeRow.name}
                        </Text>
                        {active ? (
                          <View style={[styles.typeCheck, { backgroundColor: tint }]}>
                            <Ionicons name="checkmark" size={12} color="#fff" />
                          </View>
                        ) : null}
                      </FastPress>
                      {canManageTypes && editCategories ? (
                        <FastPress
                          style={styles.typeRemoveBtn}
                          onPress={() => removeCategory(typeRow)}
                          disabled={typeSaving}
                          accessibilityLabel={`${typeRow.name} kategorisini kaldır`}
                        >
                          <Ionicons name="close" size={14} color="#fff" />
                        </FastPress>
                      ) : null}
                    </View>
                  );
                })}
              </View>

              {canManageTypes ? (
                <View style={styles.addCategoryRow}>
                  <TextInput
                    style={styles.addCategoryInput}
                    placeholder={t('staffFjNewTypePh')}
                    placeholderTextColor={theme.colors.textMuted}
                    value={newTypeName}
                    onChangeText={setNewTypeName}
                    returnKeyType="done"
                    onSubmitEditing={() => void addCategory()}
                  />
                  <FastPress
                    style={[styles.addCategoryBtn, (!newTypeName.trim() || typeSaving) && styles.addCategoryBtnDisabled]}
                    onPress={() => void addCategory()}
                    disabled={!newTypeName.trim() || typeSaving}
                  >
                    {typeSaving ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="add" size={18} color="#fff" />
                        <Text style={styles.addCategoryBtnText}>Ekle</Text>
                      </>
                    )}
                  </FastPress>
                </View>
              ) : null}
            </>
          )}
        </Section>

        <Section title="Başlık" subtitle="Zorunlu — kısa ve açıklayıcı" icon="text-outline">
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder={t('staffFjTitlePh')}
            placeholderTextColor={theme.colors.textMuted}
          />
        </Section>

        <Section title="Açıklama" subtitle="Kullanım detayları, dikkat edilecekler" icon="document-text-outline">
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            multiline
            textAlignVertical="top"
            placeholder={t('staffFjDescPh')}
            placeholderTextColor={theme.colors.textMuted}
          />
        </Section>

        <Section title="Konum & taraf" subtitle="Oda, alan ve ilgili kişi" icon="location-outline">
          <TextInput
            style={styles.input}
            value={locationDetail}
            onChangeText={setLocationDetail}
            placeholder="Oda 205, lobi…"
            placeholderTextColor={theme.colors.textMuted}
          />
          <TextInput
            style={[styles.input, styles.inputSpaced]}
            value={counterpartyName}
            onChangeText={setCounterpartyName}
            placeholder="Zimmet alan, emanet veren…"
            placeholderTextColor={theme.colors.textMuted}
          />
          <TextInput
            style={[styles.input, styles.inputSpaced]}
            value={recordDate}
            onChangeText={setRecordDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.colors.textMuted}
          />
        </Section>

        <Section
          title="Fotoğraf / video"
          subtitle={`Zorunlu — en fazla ${MAX_FACILITY_JOURNAL_MEDIA} medya`}
          icon="images-outline"
        >
          <View style={styles.mediaActions}>
            <FastPress
              style={[styles.mediaBtn, styles.mediaBtnPrimary, pickingMedia && styles.mediaBtnDisabled]}
              onPress={() => pickMedia(true)}
              disabled={pickingMedia}
            >
              {pickingMedia ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="camera" size={20} color="#fff" />
              )}
              <Text style={styles.mediaBtnPrimaryText}>Kamera</Text>
            </FastPress>
            <FastPress
              style={[styles.mediaBtn, pickingMedia && styles.mediaBtnDisabled]}
              onPress={() => pickMedia(false)}
              disabled={pickingMedia}
            >
              {pickingMedia ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Ionicons name="images-outline" size={20} color={theme.colors.primary} />
              )}
              <Text style={styles.mediaBtnText}>Galeri</Text>
            </FastPress>
          </View>

          {media.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaStrip}>
              {media.map((m, idx) => (
                <View key={`${m.uri}-${idx}`} style={styles.mediaThumb}>
                  <FacilityJournalMediaPreview
                    media={{
                      id: `pending-${idx}`,
                      record_id: 'pending',
                      public_url: m.uri,
                      media_type: m.type,
                      thumbnail_url: m.posterUri ?? null,
                      sort_order: idx,
                    }}
                    style={styles.mediaImg}
                    recyclingKey={`pending-${m.uri}`}
                    allowVideoFrameFallback={m.type === 'video' && !m.posterUri}
                  />
                  {m.type === 'video' ? (
                    <View style={styles.videoPlayDot} pointerEvents="none">
                      <Ionicons name="play" size={14} color="#fff" />
                    </View>
                  ) : null}
                  {m.preparing ? (
                    <View style={styles.mediaPreparing}>
                      <ActivityIndicator size="small" color="#fff" />
                    </View>
                  ) : null}
                  <FastPress
                    style={styles.mediaRemove}
                    onPress={() => setMedia((arr) => arr.filter((_, i) => i !== idx))}
                  >
                    <Ionicons name="close-circle" size={22} color="#dc2626" />
                  </FastPress>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.mediaEmpty}>
              <Ionicons name="cloud-upload-outline" size={28} color={theme.colors.textMuted} />
              <Text style={styles.mediaEmptyText}>Henüz medya eklenmedi</Text>
            </View>
          )}
        </Section>

        <Section title="Görünürlük" subtitle="Seçmezseniz yalnızca siz ve yöneticiler görür" icon="eye-outline">
          {orgId && staffId ? (
            <FacilityJournalViewerPicker
              organizationId={orgId}
              creatorStaffId={staffId}
              selectedStaffIds={viewerStaffIds}
              selectedGuestIds={viewerGuestIds}
              onToggleStaff={toggleViewerStaff}
              onToggleGuest={toggleViewerGuest}
            />
          ) : null}
        </Section>

        {uploadStep ? (
          <View style={styles.uploadBanner}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.uploadStep}>{uploadStep}</Text>
          </View>
        ) : null}

        <FastPress
          style={[styles.saveBtn, (!canSubmit || saving) && styles.saveBtnDisabled]}
          onPress={submit}
          disabled={!canSubmit || saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={22} color="#fff" />
              <Text style={styles.saveBtnText}>Kaydet</Text>
            </>
          )}
        </FastPress>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function FacilityJournalNew() {
  return (
    <FacilityJournalAccessGate>
      <FacilityJournalNewScreen />
    </FacilityJournalAccessGate>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  scroll: { padding: 16, paddingBottom: 48 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  emptyTypes: { textAlign: 'center', color: theme.colors.textMuted, marginBottom: 20, lineHeight: 22 },
  emptyAddRow: { flexDirection: 'row', gap: 8, width: '100%', maxWidth: 360 },
  emptyInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  emptyAddBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: `${theme.colors.primary}18`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: { fontSize: 22, fontWeight: '800', color: theme.colors.text, textAlign: 'center' },
  heroHint: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.textMuted,
    textAlign: 'center',
    maxWidth: 340,
  },
  section: {
    backgroundColor: theme.colors.background,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  sectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: `${theme.colors.primary}14`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderText: { flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  sectionSubtitle: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2, lineHeight: 18 },
  typesLoader: { marginVertical: 12, alignSelf: 'flex-start' },
  editToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: theme.colors.backgroundSecondary,
    marginBottom: 12,
  },
  editToggleActive: { backgroundColor: `${theme.colors.primary}14` },
  editToggleText: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },
  editToggleTextActive: { color: theme.colors.primary },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeCardWrap: { width: '47%', position: 'relative' },
  typeCard: {
    borderWidth: 1.5,
    borderColor: theme.colors.borderLight,
    borderRadius: 14,
    padding: 14,
    minHeight: 88,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  typeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  typeLabel: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  typeCheck: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    ...theme.shadows.sm,
  },
  addCategoryRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  addCategoryInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.text,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  addCategoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
  },
  addCategoryBtnDisabled: { opacity: 0.5 },
  addCategoryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  inputSpaced: { marginTop: 10 },
  multiline: { minHeight: 96 },
  mediaActions: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  mediaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  mediaBtnPrimary: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  mediaBtnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  mediaBtnText: { color: theme.colors.primary, fontWeight: '700', fontSize: 15 },
  mediaBtnDisabled: { opacity: 0.6 },
  mediaStrip: { marginTop: 4 },
  mediaThumb: { width: 92, height: 92, marginRight: 10, borderRadius: 12, overflow: 'hidden' },
  mediaImg: { width: '100%', height: '100%' },
  videoPlayDot: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaRemove: { position: 'absolute', top: 2, right: 2 },
  mediaPreparing: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  mediaEmptyText: { marginTop: 8, fontSize: 13, color: theme.colors.textMuted },
  uploadBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 12,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: `${theme.colors.primary}10`,
  },
  uploadStep: { fontSize: 14, color: theme.colors.textSecondary },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    ...theme.shadows.md,
  },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
