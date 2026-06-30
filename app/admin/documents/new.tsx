import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard, type ViewStyle, Modal, Pressable, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { pickDocumentSafe } from '@/lib/documentPickerSafe';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { adminTheme } from '@/constants/adminTheme';
import { documentDetailHref, useDocumentsBasePath } from '@/lib/documentManagementRoutes';
import { supabase } from '@/lib/supabase';
import { listDocumentCategories, upsertDocumentCategory, type DocumentCategoryRow } from '@/lib/documentManagement';
import { useAuthStore } from '@/stores/authStore';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { prepareCrossPlatformUploadImageUri } from '@/lib/crossPlatformImage';
import {
  defaultExtensionForMime,
  inferDocumentMimeFromFileName,
  inferDocumentMimeFromUri,
} from '@/lib/documentsSignedUrl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listMaliyeSections } from '@/lib/maliyeAccess';

type Picked = { uri: string; name: string; size?: number; mimeType?: string | null };

export default function AdminDocumentNew() {
  const router = useRouter();
  const base = useDocumentsBasePath();
  const { relatedStaffId, relatedStaffName } = useLocalSearchParams<{
    relatedStaffId?: string;
    relatedStaffName?: string;
  }>();
  const insets = useSafeAreaInsets();
  const staff = useAuthStore((s) => s.staff);
  const [cats, setCats] = useState<DocumentCategoryRow[]>([]);
  const [catsLoading, setCatsLoading] = useState(false);

  const [picked, setPicked] = useState<Picked | null>(null);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [description, setDescription] = useState('');
  const [documentDate, setDocumentDate] = useState(new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState('');
  const [note, setNote] = useState('');
  const [submitForApproval, setSubmitForApproval] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keyboardH, setKeyboardH] = useState(0);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [newCategoryRequiresApproval, setNewCategoryRequiresApproval] = useState(false);
  const [categorySaving, setCategorySaving] = useState(false);
  const [maliyeVisible, setMaliyeVisible] = useState(false);
  const [maliyeSections, setMaliyeSections] = useState<Array<{ id: string; name: string }>>([]);
  const [maliyeSectionId, setMaliyeSectionId] = useState('');
  const [maliyeOrder, setMaliyeOrder] = useState('0');
  const scopedStaffId =
    typeof relatedStaffId === 'string' && relatedStaffId.trim().length > 0 ? relatedStaffId.trim() : null;
  const scopedStaffName =
    typeof relatedStaffName === 'string' && relatedStaffName.trim().length > 0 ? relatedStaffName.trim() : null;

  useEffect(() => {
    if (!staff?.id) return;
    let cancelled = false;
    setCatsLoading(true);
    listDocumentCategories()
      .then((res) => {
        if (cancelled) return;
        if (!res.error && res.data) setCats((res.data as any) ?? []);
      })
      .finally(() => {
        if (!cancelled) setCatsLoading(false);
      });
    listMaliyeSections().then((res) => {
      if (!cancelled && !res.error && res.data) {
        const mapped = (res.data as Array<{ id: string; name: string }>).map((s) => ({ id: s.id, name: s.name }));
        setMaliyeSections(mapped);
        if (mapped.length && !maliyeSectionId) setMaliyeSectionId(mapped[0].id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [staff?.id]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardH(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const catOptions = useMemo(() => cats.filter((c) => c.is_active !== false), [cats]);
  const isAdmin = staff?.role === 'admin';

  const setPickedFromUri = async (uri: string, nameHint?: string, mimeHint?: string | null) => {
    const name = (nameHint && nameHint.trim()) ? nameHint.trim() : `kamera_${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
    // fileSize for camera assets isn't always available; it's optional for our upload flow
    setPicked({ uri, name, size: undefined, mimeType: mimeHint ?? 'image/jpeg' });
    if (!title.trim()) setTitle(name.replace(/\.[a-z0-9]+$/i, ''));
  };

  const pickFile = async () => {
    const res = await pickDocumentSafe({
      multiple: false,
      type: ['application/pdf', 'image/jpeg', 'image/png'],
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    const a = res.assets?.[0];
    if (!a?.uri || !a.name) return;
    setPicked({ uri: a.uri, name: a.name, size: a.size, mimeType: a.mimeType ?? null });
    if (!title.trim()) setTitle(a.name.replace(/\.[a-z0-9]+$/i, ''));
  };

  const takePhoto = async () => {
    const granted = await ensureCameraPermission({
      title: 'Kamera izni',
      message: 'Belge fotoğrafı çekmek için kamera izni gerekiyor.',
      settingsMessage: 'Kamera izni kapalı. Ayarlardan izin verip tekrar deneyin.',
    });
    if (!granted) return;
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    const jpegUri = await prepareCrossPlatformUploadImageUri(res.assets[0].uri);
    await setPickedFromUri(jpegUri, `kamera_${Date.now()}.jpg`, 'image/jpeg');
  };

  const chooseSource = () => {
    Alert.alert('Belge ekle', 'Belgeyi nereden eklemek istiyorsunuz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Dosyalardan seç', onPress: () => { pickFile(); } },
      { text: 'Kamera ile çek', onPress: () => { takePhoto(); } },
    ]);
  };

  const uploadAndCreate = async () => {
    if (!picked) {
      Alert.alert('Eksik', 'Dosya seçin.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Eksik', 'Belge adı zorunlu.');
      return;
    }
    if (!categoryId) {
      Alert.alert('Eksik', 'Kategori zorunlu.');
      return;
    }
    if (!documentDate || documentDate.length < 10) {
      Alert.alert('Eksik', 'Belge tarihi zorunlu.');
      return;
    }
    if (!staff?.id || !staff.organization_id) {
      Alert.alert('Hata', 'Oturum/işletme bulunamadı.');
      return;
    }
    const canUpload = staff.role === 'admin' || (staff.app_permissions as any)?.dokuman_yukle === true;
    if (!canUpload) {
      Alert.alert('Yetki yok', 'Bu işlem için "dokuman_yukle" yetkisine sahip olmalısınız.');
      return;
    }

    setSaving(true);
    let createdDocId: string | null = null;
    try {
      // 1) create document row (draft -> maybe pending/active after category check)
      const { data: cat, error: catErr } = await supabase
        .from('document_categories')
        .select('id, requires_approval')
        .eq('id', categoryId)
        .single();
      if (catErr || !cat) throw new Error('Kategori bulunamadı');

      const needsApproval = submitForApproval || (cat as any).requires_approval === true;
      const status = needsApproval ? 'pending_approval' : 'active';

      const { data: doc, error: dErr } = await supabase
        .from('documents')
        .insert({
          organization_id: staff.organization_id,
          title: title.trim(),
          category_id: categoryId,
          description: description.trim() || null,
          visibility: scopedStaffId ? 'related_staff_only' : 'department',
          related_staff_id: scopedStaffId,
          status,
          document_date: documentDate.slice(0, 10),
          expiry_date: expiryDate.trim() ? expiryDate.trim().slice(0, 10) : null,
          uploaded_by_staff_id: staff.id,
          is_maliye_visible: maliyeVisible,
          maliye_section_id: maliyeVisible ? (maliyeSectionId || null) : null,
          maliye_display_order: Math.max(0, parseInt(maliyeOrder || '0', 10) || 0),
        })
        .select('id')
        .single();
      if (dErr || !doc) throw new Error(`documents insert: ${dErr?.message ?? 'Belge oluşturulamadı'}`);
      createdDocId = doc.id;

      // 2) upload storage (bucket must exist; path is org/doc/version)
      const rawMime = picked.mimeType?.trim() || null;
      const inferredFromName = inferDocumentMimeFromFileName(picked.name);
      const inferredFromUri = inferDocumentMimeFromUri(picked.uri);
      let resolvedMime =
        rawMime && rawMime !== 'application/octet-stream' ? rawMime : null;
      if (!resolvedMime) resolvedMime = inferredFromName ?? inferredFromUri ?? null;

      const nameExt = picked.name.includes('.') ? picked.name.split('.').pop()?.toLowerCase() : undefined;
      const safeNameExt =
        nameExt && /^[a-z0-9]{1,8}$/.test(nameExt) ? nameExt : undefined;
      const ext =
        safeNameExt ??
        defaultExtensionForMime(resolvedMime) ??
        defaultExtensionForMime(inferredFromUri ?? inferredFromName) ??
        'bin';
      const objectPath = `org/${staff.organization_id}/documents/${doc.id}/v1-${Date.now()}.${ext}`;

      if (!resolvedMime) {
        resolvedMime = inferDocumentMimeFromFileName(`x.${ext}`);
      }

      // React Native: base64/atob decode often breaks on device; use fetch(file://).arrayBuffer() instead.
      const fileRes = await fetch(picked.uri);
      const ab = await fileRes.arrayBuffer();
      const bytes = new Uint8Array(ab);

      const up = await supabase.storage.from('documents').upload(objectPath, bytes, {
        contentType: resolvedMime ?? undefined,
        upsert: false,
      });
      if (up.error) {
        const details = [up.error.message, (up.error as any)?.statusCode ? `status=${(up.error as any).statusCode}` : null]
          .filter(Boolean)
          .join(' | ');
        throw new Error(`storage upload: ${details}\npath=${objectPath}\norg=${staff.organization_id}\nstaff=${staff.id}`);
      }

      // 3) create version row + set current_version_id
      const { data: ver, error: vErr } = await supabase
        .from('document_versions')
        .insert({
          organization_id: staff.organization_id,
          document_id: doc.id,
          version_no: 1,
          file_name: picked.name,
          file_path: objectPath,
          file_size: picked.size ?? null,
          mime_type: resolvedMime,
          uploaded_by_staff_id: staff.id,
          note: note.trim() || null,
        })
        .select('id')
        .single();
      if (vErr || !ver) throw new Error(`document_versions insert: ${vErr?.message ?? 'Versiyon oluşturulamadı'}`);

      const { error: updErr } = await supabase.from('documents').update({ current_version_id: ver.id }).eq('id', doc.id);
      if (updErr) throw new Error(`documents update current_version_id: ${updErr.message}`);

      // 4) log
      await supabase.from('document_logs').insert({
        organization_id: staff.organization_id,
        document_id: doc.id,
        actor_staff_id: staff.id,
        action_type: 'document.created',
        new_data: { status, version_no: 1, file_path: objectPath },
      });

      if (needsApproval) {
        await supabase.from('document_approvals').insert({
          organization_id: staff.organization_id,
          document_id: doc.id,
          requested_by_staff_id: staff.id,
          status: 'pending',
        });
        await supabase.from('document_logs').insert({
          organization_id: staff.organization_id,
          document_id: doc.id,
          actor_staff_id: staff.id,
          action_type: 'document.submit_approval',
        });
      }

      // From here on, treat the document as successfully persisted (avoid accidental cleanup if navigation throws).
      createdDocId = null;
      // push: stack’te “yükle” ekranı kalır; geri düzgün çalışır. replace kullanınca GO_BACK hatası oluşuyordu.
      router.push(documentDetailHref(base, doc.id) as never);
    } catch (e) {
      const msg = (e as Error)?.message ?? 'Kaydedilemedi';
      // If we created the DB row but failed later (common with storage RLS), remove the draft document to avoid "ghost" records.
      if (createdDocId) {
        await supabase.from('documents').delete().eq('id', createdDocId);
      }
      Alert.alert(
        'Hata',
        msg.includes('row-level security')
          ? `${msg}\n\nİpucu: Bu hata genelde storage.objects INSERT policy (Supabase migration uygulanmamış/yanlış proje) veya staff↔auth eşlemesi (staff.auth_id) kaynaklıdır.`
          : msg
      );
    } finally {
      setSaving(false);
    }
  };

  const createQuickCategory = async () => {
    if (!isAdmin) {
      Alert.alert('Yetki yok', 'Kategori ekleme sadece admin için açık.');
      return;
    }
    if (!staff?.organization_id) {
      Alert.alert('Hata', 'Oturum/işletme bulunamadı.');
      return;
    }
    if (!newCategoryName.trim()) {
      Alert.alert('Eksik', 'Kategori adı zorunlu.');
      return;
    }
    setCategorySaving(true);
    try {
      const res = await upsertDocumentCategory({
        organizationId: staff.organization_id,
        name: newCategoryName.trim(),
        description: newCategoryDescription.trim() || null,
        requiresApproval: newCategoryRequiresApproval,
        isActive: true,
      });
      if (res.error || !res.data?.id) {
        throw new Error(res.error?.message ?? 'Kategori kaydedilemedi');
      }
      setCategoryId(res.data.id);
      setCategoryModalOpen(false);
      setNewCategoryName('');
      setNewCategoryDescription('');
      setNewCategoryRequiresApproval(false);
      const refreshed = await listDocumentCategories();
      if (!refreshed.error && refreshed.data) {
        setCats((refreshed.data as DocumentCategoryRow[]) ?? []);
      }
      Alert.alert('Başarılı', 'Kategori eklendi ve seçildi.');
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Kategori kaydedilemedi.');
    } finally {
      setCategorySaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: Math.max(insets.bottom + 140, keyboardH > 0 ? keyboardH + 120 : 140),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient colors={['#0b1324', '#112b3c', '#1d4e3c']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <Text style={styles.heroKicker}>BELGE YÜKLE</Text>
          <Text style={styles.heroTitle}>Yeni doküman</Text>
          <Text style={styles.heroSub}>PDF/JPG/PNG · Kategori · Versiyon notu</Text>
          {scopedStaffId ? (
            <Text style={styles.heroSub}>
              Personel kapsamı: {scopedStaffName ?? 'Seçili personel'} (sadece bu personele bağlı kayıt)
            </Text>
          ) : null}
        </LinearGradient>

        <TouchableOpacity style={styles.fileCard} activeOpacity={0.85} onPress={chooseSource} disabled={saving}>
          <View style={styles.fileIconWrap}>
            <Ionicons name={picked ? 'document-text-outline' : 'cloud-upload-outline'} size={22} color={adminTheme.colors.accent} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.fileTitle} numberOfLines={1}>
              {picked ? picked.name : 'Dosya seç'}
            </Text>
            <Text style={styles.fileSub} numberOfLines={2}>
              {picked ? 'Dosyayı değiştirmek için artıya dokunun.' : 'Artı butonundan dosya seçin.'}
            </Text>
          </View>
        </TouchableOpacity>

      <Text style={styles.label}>Belge adı *</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Örn: Vergi levhası" placeholderTextColor={adminTheme.colors.textMuted} editable={!saving} />

      <Text style={styles.label}>Kategori *</Text>
      <View style={styles.selectBox}>
        {catsLoading && catOptions.length === 0 ? (
          <Text style={styles.selectMuted}>Kategoriler yükleniyor…</Text>
        ) : catOptions.length === 0 ? (
          <Text style={styles.selectMuted}>Kategori yok (önce kategori ekleyin)</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {catOptions.map((c) => {
              const active = categoryId === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setCategoryId(c.id)}
                  disabled={saving}
                  activeOpacity={0.8}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
      {isAdmin ? (
        <TouchableOpacity
          style={styles.quickCategoryBtn}
          onPress={() => setCategoryModalOpen(true)}
          activeOpacity={0.85}
          disabled={saving}
        >
          <Ionicons name="add-circle-outline" size={18} color={adminTheme.colors.accent} />
          <Text style={styles.quickCategoryBtnText}>Admin: hızlı kategori ekle</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.label}>Belge tarihi *</Text>
      <TextInput style={styles.input} value={documentDate} onChangeText={setDocumentDate} placeholder="YYYY-MM-DD" placeholderTextColor={adminTheme.colors.textMuted} editable={!saving} />

      <Text style={styles.label}>Son geçerlilik tarihi</Text>
      <TextInput style={styles.input} value={expiryDate} onChangeText={setExpiryDate} placeholder="YYYY-MM-DD" placeholderTextColor={adminTheme.colors.textMuted} editable={!saving} />

      <Text style={styles.label}>Açıklama</Text>
      <TextInput style={[styles.input, styles.textArea]} value={description} onChangeText={setDescription} placeholder="Opsiyonel" placeholderTextColor={adminTheme.colors.textMuted} editable={!saving} multiline />

      <Text style={styles.label}>Yükleme notu (versiyon notu)</Text>
      <TextInput style={[styles.input, styles.textArea]} value={note} onChangeText={setNote} placeholder="Opsiyonel" placeholderTextColor={adminTheme.colors.textMuted} editable={!saving} multiline />

      <TouchableOpacity style={styles.secondaryBtn} onPress={() => setSubmitForApproval((v) => !v)} activeOpacity={0.85} disabled={saving}>
        <Ionicons name={submitForApproval ? 'checkbox-outline' : 'square-outline'} size={20} color={adminTheme.colors.text} />
        <Text style={styles.secondaryBtnText}>Onaya gönder</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryBtn} onPress={() => setMaliyeVisible((v) => !v)} activeOpacity={0.85} disabled={saving}>
        <Ionicons name={maliyeVisible ? 'checkbox-outline' : 'square-outline'} size={20} color={adminTheme.colors.text} />
        <Text style={styles.secondaryBtnText}>Maliye portalında da göster</Text>
      </TouchableOpacity>
      {maliyeVisible ? (
        <>
          <Text style={styles.label}>Maliye çekmecesi</Text>
          <View style={styles.selectBox}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {maliyeSections.map((s) => (
                <TouchableOpacity key={s.id} style={[styles.chip, maliyeSectionId === s.id && styles.chipActive]} onPress={() => setMaliyeSectionId(s.id)}>
                  <Text style={[styles.chipText, maliyeSectionId === s.id && styles.chipTextActive]}>{s.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <Text style={styles.label}>Maliye sırası</Text>
          <TextInput style={styles.input} value={maliyeOrder} onChangeText={setMaliyeOrder} keyboardType="number-pad" placeholder="0" />
        </>
      ) : null}

      <TouchableOpacity style={styles.primaryBtn} onPress={uploadAndCreate} activeOpacity={0.9} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Kaydet & Yükle</Text>}
      </TouchableOpacity>
      </ScrollView>

      <TouchableOpacity
        style={[styles.fab, { bottom: Math.max(insets.bottom + 22, keyboardH > 0 ? keyboardH + 16 : 22) }]}
        activeOpacity={0.9}
        onPress={chooseSource}
        disabled={saving}
        accessibilityLabel="Dosya seç"
      >
        <Ionicons name="add" size={24} color="#fff" />
      </TouchableOpacity>

      <Modal visible={categoryModalOpen} transparent animationType="fade" onRequestClose={() => setCategoryModalOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setCategoryModalOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Yeni kategori ekle</Text>
            <TextInput
              style={styles.input}
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              placeholder="Kategori adı"
              placeholderTextColor={adminTheme.colors.textMuted}
              editable={!categorySaving}
            />
            <TextInput
              style={[styles.input, styles.textArea]}
              value={newCategoryDescription}
              onChangeText={setNewCategoryDescription}
              placeholder="Açıklama (opsiyonel)"
              placeholderTextColor={adminTheme.colors.textMuted}
              editable={!categorySaving}
              multiline
            />
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Onay gerekli</Text>
              <Switch
                value={newCategoryRequiresApproval}
                onValueChange={setNewCategoryRequiresApproval}
                trackColor={{ false: '#cbd5e0', true: adminTheme.colors.accent }}
                thumbColor="#fff"
                disabled={categorySaving}
              />
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={createQuickCategory} activeOpacity={0.9} disabled={categorySaving}>
              {categorySaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Kategoriyi Kaydet</Text>}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 20, paddingBottom: 140 },
  hero: {
    borderRadius: adminTheme.radius.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  heroKicker: { fontSize: 11, fontWeight: '900', color: 'rgba(255,255,255,0.72)', letterSpacing: 1.2 },
  heroTitle: { marginTop: 6, fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: -0.2 },
  heroSub: { marginTop: 6, fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.78)' },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: adminTheme.radius.lg,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginBottom: 12,
  },
  fileIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: adminTheme.colors.warningLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileTitle: { fontSize: 14, fontWeight: '900', color: adminTheme.colors.text },
  fileSub: { marginTop: 2, fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted, lineHeight: 16 },
  label: { marginTop: 10, marginBottom: 6, fontSize: 13, fontWeight: '800', color: adminTheme.colors.text },
  input: {
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: adminTheme.colors.text,
  },
  textArea: { minHeight: 88, textAlignVertical: 'top' as any },
  selectBox: { backgroundColor: adminTheme.colors.surface, borderWidth: 1, borderColor: adminTheme.colors.border, borderRadius: adminTheme.radius.lg, padding: 10 },
  selectMuted: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textMuted },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: adminTheme.colors.surfaceTertiary, borderWidth: 1, borderColor: adminTheme.colors.border },
  chipActive: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.text },
  chipTextActive: { color: '#fff' },
  quickCategoryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 4, paddingVertical: 8 },
  quickCategoryBtnText: { fontSize: 13, fontWeight: '800', color: adminTheme.colors.accent },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, paddingVertical: 8 },
  secondaryBtnText: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text },
  primaryBtn: { marginTop: 18, backgroundColor: adminTheme.colors.accent, borderRadius: adminTheme.radius.lg, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 22,
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: adminTheme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.10)',
    ...(adminTheme.shadow?.md as ViewStyle),
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 18 },
  modalCard: { backgroundColor: adminTheme.colors.surface, borderRadius: adminTheme.radius.lg, padding: 14, borderWidth: 1, borderColor: adminTheme.colors.border },
  modalTitle: { fontSize: 16, fontWeight: '900', color: adminTheme.colors.text, marginBottom: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  switchLabel: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text },
});

