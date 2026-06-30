/**
 * Admin: Uygulama ve web sitesi linklerini yönet (ekleme/düzenleme/silme)
 */
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Modal,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { uriToArrayBuffer } from '@/lib/uploadMedia';
import { prepareCrossPlatformUploadImageUri } from '@/lib/crossPlatformImage';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import {
  listAdminAppLinks,
  insertAdminAppLink,
  updateAdminAppLink,
  deleteAdminAppLink,
  type AdminAppLink,
  type AppLinkType,
  type AppLinkIconType,
} from '@/lib/adminAppLinks';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';
import { CachedImage } from '@/components/CachedImage';

const ICON_OPTIONS: { value: AppLinkIconType; label: string }[] = [
  { value: 'app_store', label: 'App Store' },
  { value: 'google_play', label: 'Google Play' },
  { value: 'globe', label: 'Web (globe)' },
  { value: 'custom', label: 'Özel logo' },
];

export default function AdminAppLinksScreen() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const [links, setLinks] = useState<AdminAppLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<AdminAppLink | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);

  const [formType, setFormType] = useState<AppLinkType>('app');
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formIconType, setFormIconType] = useState<AppLinkIconType>('app_store');
  const [formIconUrl, setFormIconUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!staff?.id || staff.role !== 'admin') {
      router.replace('/admin');
      return;
    }
    load();
  }, [staff?.id, staff?.role]);

  const load = useCallback(async () => {
    try {
      const data = await listAdminAppLinks();
      setLinks(data ?? []);
    } catch {
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const openAdd = () => {
    setEditing(null);
    setFormType('app');
    setFormName('');
    setFormUrl('');
    setFormIconType('app_store');
    setFormIconUrl(null);
    setModalVisible(true);
  };

  const openEdit = (link: AdminAppLink) => {
    setEditing(link);
    setFormType(link.type);
    setFormName(link.name);
    setFormUrl(link.url);
    setFormIconType(link.icon_type);
    setFormIconUrl(link.icon_url);
    setModalVisible(true);
  };

  const pickIcon = async () => {
    const granted = await ensureMediaLibraryPermission({
      title: 'Galeri izni',
      message: 'Uygulama logosu seçmek için galeri erişimi gerekir.',
      settingsMessage: 'Galeri iznini ayarlardan açın.',
    });
    if (!granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setUploadingIcon(true);
    try {
      const uploadUri = await prepareCrossPlatformUploadImageUri(result.assets[0].uri);
      const isPng = uploadUri.toLowerCase().includes('.png');
      const arrayBuffer = await uriToArrayBuffer(uploadUri);
      const path = `app-links/${Date.now()}.${isPng ? 'png' : 'jpg'}`;
      const { error } = await supabase.storage.from('app-link-icons').upload(path, arrayBuffer, {
        contentType: isPng ? 'image/png' : 'image/jpeg',
        upsert: true,
      });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('app-link-icons').getPublicUrl(path);
      setFormIconUrl(publicUrl);
      setFormIconType('custom');
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Logo yüklenemedi.');
    } finally {
      setUploadingIcon(false);
    }
  };

  const save = async () => {
    const name = formName.trim();
    const url = formUrl.trim();
    if (!name || !url) {
      Alert.alert('Eksik alan', 'Ad ve URL zorunludur.');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateAdminAppLink(editing.id, {
          type: formType,
          name,
          url,
          icon_type: formIconType,
          icon_url: formIconType === 'custom' ? formIconUrl : null,
        });
      } else {
        await insertAdminAppLink({
          type: formType,
          name,
          url,
          icon_type: formIconType,
          icon_url: formIconType === 'custom' ? formIconUrl : null,
          sort_order: links.length,
        });
      }
      setModalVisible(false);
      load();
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const remove = (link: AdminAppLink) => {
    Alert.alert('Sil', `"${link.name}" linkini silmek istediğinize emin misiniz?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAdminAppLink(link.id);
            load();
          } catch (e) {
            Alert.alert('Hata', (e as Error)?.message ?? 'Silinemedi.');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AdminCard>
        <Text style={styles.hint}>
          Paylaşmak istediğiniz uygulama ve web sitelerini ekleyin. Personel ve misafir dahil herkes görebilir. İstediğiniz
          kadar ekleyebilirsiniz.
        </Text>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Ionicons name="add-circle" size={24} color={adminTheme.colors.accent} />
          <Text style={styles.addBtnText}>Yeni uygulama veya web sitesi ekle</Text>
        </TouchableOpacity>
      </AdminCard>

      {links.map((link) => (
        <View key={link.id} style={styles.card}>
          <View style={styles.cardRow}>
            {link.icon_type === 'custom' && link.icon_url ? (
              <CachedImage uri={link.icon_url} style={styles.cardIcon} contentFit="cover" />
            ) : (
              <View style={styles.cardIconPlaceholder}>
                <Ionicons
                  name={
                    link.icon_type === 'app_store'
                      ? 'logo-apple-appstore'
                      : link.icon_type === 'google_play'
                        ? 'logo-google-playstore'
                        : 'globe-outline'
                  }
                  size={28}
                  color={adminTheme.colors.primary}
                />
              </View>
            )}
            <View style={styles.cardInfo}>
              <Text style={styles.cardName}>{link.name}</Text>
              <Text style={styles.cardUrl} numberOfLines={1}>
                {link.url}
              </Text>
              <Text style={styles.cardType}>{link.type === 'app' ? 'Uygulama' : 'Web sitesi'}</Text>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity onPress={() => openEdit(link)} style={styles.iconBtn}>
                <Ionicons name="pencil" size={22} color={adminTheme.colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => remove(link)} style={styles.iconBtn}>
                <Ionicons name="trash-outline" size={22} color={adminTheme.colors.error} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ))}

      {links.length === 0 && (
        <View style={styles.empty}>
          <Ionicons name="link-outline" size={48} color={adminTheme.colors.textMuted} />
          <Text style={styles.emptyText}>Henüz link eklenmemiş. Yukarıdaki butondan ekleyin.</Text>
        </View>
      )}

      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalVisible(false)} />
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.modalTitle}>{editing ? 'Linki düzenle' : 'Yeni link ekle'}</Text>

            <Text style={styles.label}>Tür</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, formType === 'app' && styles.chipActive]}
                onPress={() => setFormType('app')}
              >
                <Text style={[styles.chipText, formType === 'app' && styles.chipTextActive]}>Uygulama</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, formType === 'website' && styles.chipActive]}
                onPress={() => setFormType('website')}
              >
                <Text style={[styles.chipText, formType === 'website' && styles.chipTextActive]}>Web sitesi</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Ad</Text>
            <TextInput
              style={styles.input}
              value={formName}
              onChangeText={setFormName}
              placeholder="Örn: Valoria Hotel App"
              placeholderTextColor={adminTheme.colors.textMuted}
            />

            <Text style={styles.label}>URL</Text>
            <TextInput
              style={styles.input}
              value={formUrl}
              onChangeText={setFormUrl}
              placeholder="https://..."
              placeholderTextColor={adminTheme.colors.textMuted}
              keyboardType="url"
              autoCapitalize="none"
            />

            <Text style={styles.label}>İkon</Text>
            <View style={styles.chipRow}>
              {ICON_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.chipSmall, formIconType === opt.value && styles.chipActive]}
                  onPress={() => {
                    setFormIconType(opt.value);
                    if (opt.value !== 'custom') setFormIconUrl(null);
                  }}
                >
                  <Text style={[styles.chipText, formIconType === opt.value && styles.chipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {formIconType === 'custom' && (
              <TouchableOpacity
                style={styles.pickIconBtn}
                onPress={pickIcon}
                disabled={uploadingIcon}
              >
                {formIconUrl ? (
                  <CachedImage uri={formIconUrl} style={styles.pickIconPreview} contentFit="cover" />
                ) : (
                  <Ionicons name="image-outline" size={32} color={adminTheme.colors.textMuted} />
                )}
                <Text style={styles.pickIconText}>
                  {uploadingIcon ? 'Yükleniyor...' : formIconUrl ? 'Değiştir' : 'Logo seç'}
                </Text>
              </TouchableOpacity>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={save}
                disabled={saving}
              >
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Kaydet</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hint: {
    fontSize: 14,
    color: adminTheme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderRadius: adminTheme.radius.md,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderStyle: 'dashed',
  },
  addBtnText: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.accent },
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.lg,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardIcon: { width: 48, height: 48, borderRadius: 10 },
  cardIconPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: { flex: 1, marginLeft: 12, minWidth: 0 },
  cardName: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text },
  cardUrl: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  cardType: { fontSize: 11, color: adminTheme.colors.textSecondary, marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 6 },
  empty: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: { fontSize: 14, color: adminTheme.colors.textMuted, marginTop: 12, textAlign: 'center' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalScroll: {
    maxHeight: '90%',
  },
  modalContent: {
    backgroundColor: adminTheme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: adminTheme.colors.text, marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.text, marginTop: 12, marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: adminTheme.radius.md,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  chipSmall: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  chipActive: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  chipText: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.text },
  chipTextActive: { color: '#fff' },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.md,
    padding: 12,
    fontSize: 15,
    backgroundColor: adminTheme.colors.surface,
    color: adminTheme.colors.text,
  },
  pickIconBtn: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderRadius: adminTheme.radius.md,
    marginTop: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  pickIconPreview: { width: 64, height: 64, borderRadius: 12 },
  pickIconText: { fontSize: 13, color: adminTheme.colors.textMuted, marginTop: 8 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: adminTheme.radius.md,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.text },
  saveBtn: {
    flex: 1,
    padding: 14,
    borderRadius: adminTheme.radius.md,
    backgroundColor: adminTheme.colors.accent,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
