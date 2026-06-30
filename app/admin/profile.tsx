import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { uriToArrayBuffer } from '@/lib/uploadMedia';
import { prepareCrossPlatformUploadImageUri } from '@/lib/crossPlatformImage';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { pickProfileCoverUri } from '@/lib/profileCoverPicker';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';
import { CachedImage } from '@/components/CachedImage';
import { SharedAppLinks } from '@/components/SharedAppLinks';
import {
  emptyStaffSocialLinks,
  staffSocialLinksFromJson,
  staffSocialLinksToJson,
  type StaffSocialKey,
  type StaffSocialLinksState,
} from '@/lib/staffSocialLinks';
import { AdminProfileHero } from '@/components/modernProfile/AdminProfileHero';
import { loadStaffProfileExtendedStats } from '@/lib/staffProfileExtendedStats';
import { calculateDaysWithUs, formatStatCompact } from '@/lib/modernProfileTenure';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import type { ProfileStatItem } from '@/components/ProfileStatsCard';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  reception_chief: 'Resepsiyon Şefi',
  receptionist: 'Resepsiyonist',
  housekeeping: 'Housekeeping',
  technical: 'Teknik',
  security: 'Güvenlik',
};

/** Profilim sayfasında görev/rol olarak seçilebilecek hazır etiketler (position alanına yazılır). */
const PROFILE_ROLE_OPTIONS = [
  'Sahip',
  'Admin',
  'Genel Müdür',
  'Personel',
  'Resepsiyon Şefi',
  'Resepsiyonist',
  'Housekeeping',
  'Teknik',
  'Güvenlik',
];

type AdminProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  profile_image: string | null;
  cover_image: string | null;
  role: string | null;
  department: string | null;
  position: string | null;
  hire_date: string | null;
  created_at: string | null;
  social_links: Record<string, unknown> | null;
};

export default function AdminProfileScreen() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [extendedStats, setExtendedStats] = useState<Awaited<ReturnType<typeof loadStaffProfileExtendedStats>> | null>(null);
  const [roleOther, setRoleOther] = useState(''); // "Diğer" seçiliyken serbest metin
  const [social, setSocial] = useState<StaffSocialLinksState>(() => emptyStaffSocialLinks());
  const profileRef = useRef<AdminProfile | null>(null);
  const socialRef = useRef<StaffSocialLinksState>(emptyStaffSocialLinks());

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    socialRef.current = social;
  }, [social]);

  useEffect(() => {
    if (!staff?.id || staff.role !== 'admin') {
      router.replace('/admin');
      return;
    }
    const load = async () => {
      const { data } = await supabase
        .from('staff')
        .select('id, full_name, email, phone, profile_image, cover_image, role, department, position, hire_date, created_at, social_links')
        .eq('id', staff.id)
        .single();
      if (data) {
        const d = data as AdminProfile;
        setProfile({
          ...d,
        });
        const sl = staffSocialLinksFromJson(d.social_links);
        setSocial(sl);
        socialRef.current = sl;
        const pos = (data as AdminProfile).position;
        if (pos && !PROFILE_ROLE_OPTIONS.includes(pos)) setRoleOther(pos);
        const joinIso = d.hire_date ?? d.created_at ?? null;
        const days = joinIso ? calculateDaysWithUs(joinIso, Date.now()) : null;
        const stats = await loadStaffProfileExtendedStats(d.id, days);
        setExtendedStats(stats);
      }
    };
    load();
  }, [staff?.id, staff?.role]);

  const pickCover = async () => {
    if (!profile || uploadingCover) return;
    try {
      const uri = await pickProfileCoverUri('Galeri izni kapali.');
      if (!uri) return;
      setUploadingCover(true);
      const { publicUrl } = await uploadUriToPublicBucket({
        bucketId: 'profiles',
        uri,
        kind: 'image',
        subfolder: `staff/${profile.id}/cover`,
      });
      await supabase.from('staff').update({ cover_image: publicUrl }).eq('id', profile.id);
      setProfile((p) => (p ? { ...p, cover_image: publicUrl } : null));
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Kapak yüklenemedi.');
    } finally {
      setUploadingCover(false);
    }
  };

  const pickImage = async () => {
    if (!profile) return;
    const granted = await ensureMediaLibraryPermission({
      title: 'Galeri izni',
      message: 'Profil fotografi secmek icin galeri erisimi istiyoruz.',
      settingsMessage: 'Galeri izni kapali. Profil fotografi icin ayarlardan izin verin.',
    });
    if (!granted) {
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      setUploading(true);
      const uploadUri = await prepareCrossPlatformUploadImageUri(result.assets[0].uri);
      const arrayBuffer = await uriToArrayBuffer(uploadUri);
      const fileName = `staff/${profile.id}/${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('profiles').upload(fileName, arrayBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('profiles').getPublicUrl(fileName);
      await supabase.from('staff').update({ profile_image: publicUrl }).eq('id', profile.id);
      setProfile((p) => (p ? { ...p, profile_image: publicUrl } : null));
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Resim yüklenemedi.');
    } finally {
      setUploading(false);
    }
  };

  const confirmDeleteProfileImage = () => {
    if (!profile?.profile_image || uploading) return;
    Alert.alert('Sil', 'Profil resminiz kaldırılacak. Devam edilsin mi?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setUploading(true);
            try {
              const { error } = await supabase
                .from('staff')
                .update({ profile_image: null })
                .eq('id', profile.id);
              if (error) throw error;
              setProfile((p) => (p ? { ...p, profile_image: null } : null));
            } catch (e) {
              Alert.alert('Hata', (e as Error)?.message ?? 'Profil resmi silinemedi.');
            } finally {
              setUploading(false);
            }
          })();
        },
      },
    ]);
  };

  const saveSocialLinks = useCallback(async (next: StaffSocialLinksState) => {
    if (!profile?.id) return;
    const json = staffSocialLinksToJson(next);
    setSaving(true);
    const { error } = await supabase.from('staff').update({ social_links: json }).eq('id', profile.id);
    setSaving(false);
    if (error) {
      Alert.alert('Kayıt hatası', `Sosyal medya kaydedilemedi: ${error.message}`);
      return;
    }
    setProfile((p) => (p ? { ...p, social_links: json ?? {} } : null));
  }, [profile?.id]);

  const saveField = useCallback(async (field: keyof AdminProfile, value: string | null) => {
    if (!profile?.id) return;
    if (field === 'social_links') return;
    const trimmed = value?.trim() ?? '';
    const payload = field === 'email' ? { [field]: trimmed || profile.email || '' } : { [field]: trimmed || null };
    setSaving(true);
    const { error } = await supabase.from('staff').update(payload).eq('id', profile.id);
    setSaving(false);
    if (error) {
      Alert.alert('Kayıt hatası', `${field} kaydedilemedi: ${error.message}`);
      return;
    }
    setProfile((p) => (p ? { ...p, ...payload } : null));
  }, [profile?.id, profile?.email]);

  const setPositionFromRole = useCallback(
    (value: string) => {
      if (!profile) return;
      const trimmed = value.trim();
      setRoleOther('');
      setProfile((p) => (p ? { ...p, position: trimmed || null } : null));
      setSaving(true);
      supabase
        .from('staff')
        .update({ position: trimmed || null })
        .eq('id', profile.id)
        .then(({ error }) => {
          setSaving(false);
          if (error) Alert.alert('Kayıt hatası', `Görev kaydedilemedi: ${error.message}`);
        });
    },
    [profile?.id]
  );

  // Sayfadan çıkarken bekleyen değişiklikleri kaydet
  useEffect(() => {
    return () => {
      const p = profileRef.current;
      if (!p?.id) return;
      const name = p.full_name?.trim() ?? '';
      const email = p.email?.trim() ?? '';
      const phone = p.phone?.trim() ?? null;
      const socialJson = staffSocialLinksToJson(socialRef.current);
      supabase
        .from('staff')
        .update({
          full_name: name || null,
          email: email || p.email || '',
          phone,
          social_links: socialJson,
        })
        .eq('id', p.id);
    };
  }, []);

  if (!profile) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.primary} />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  const avatarUri = profile.profile_image || undefined;
  const positionLine = [profile.position, profile.department].filter(Boolean).join(' · ');
  const adminStatItems: ProfileStatItem[] = extendedStats
    ? [
        { value: formatStatCompact(extendedStats.tasksCompleted, 'tr'), label: 'Görev' },
        { value: formatStatCompact(extendedStats.visits, 'tr'), label: 'Ziyaret' },
        { value: formatStatCompact(extendedStats.likes, 'tr'), label: 'Beğeni' },
        { value: formatStatCompact(extendedStats.thanksCount, 'tr'), label: 'Teşekkür' },
      ]
    : [];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <AdminProfileHero
          staffId={profile.id}
          fullName={profile.full_name}
          positionLine={positionLine || null}
          coverUri={profile.cover_image}
          avatarUri={avatarUri}
          statItems={adminStatItems}
          onPickCover={pickCover}
          uploadingCover={uploadingCover}
        />
        <AdminCard>
          <View style={styles.avatarSection}>
            <TouchableOpacity
              onPress={pickImage}
              disabled={uploading}
              style={styles.avatarWrap}
              activeOpacity={0.8}
            >
              {avatarUri ? (
                <CachedImage uri={avatarUri} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={48} color={adminTheme.colors.textMuted} />
                </View>
              )}
              {uploading && (
                <View style={styles.uploadOverlay}>
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              )}
              <View style={styles.avatarEditBadge}>
                <Ionicons name="camera" size={14} color="#fff" />
              </View>
              {avatarUri ? (
                <TouchableOpacity
                  style={styles.avatarDeleteBtn}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    confirmDeleteProfileImage();
                  }}
                  disabled={uploading}
                  activeOpacity={0.85}
                >
                  <Ionicons name="trash-outline" size={11} color="#fff" />
                </TouchableOpacity>
              ) : null}
            </TouchableOpacity>
            <Text style={styles.roleLabel}>
              {ROLE_LABELS[profile.role ?? ''] ?? profile.role ?? 'Admin'}
              {profile.department ? ` · ${profile.department}` : ''}
              {profile.position ? ` · ${profile.position}` : ''}
            </Text>
            <Text style={styles.avatarHint}>Profil fotoğrafı için dokunun</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Rol / Görev</Text>
            <Text style={styles.fieldHint}>Sahip, personel vb. görünen unvanınızı seçin veya yazın.</Text>
            <View style={styles.chipWrap}>
              {PROFILE_ROLE_OPTIONS.map((opt) => {
                const isSelected = (profile.position ?? '') === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.chip, isSelected && styles.chipActive]}
                    onPress={() => setPositionFromRole(opt)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{opt}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.roleOtherRow}>
              <TextInput
                style={[styles.input, styles.roleOtherInput]}
                value={roleOther}
                onChangeText={setRoleOther}
                onBlur={() => { if (roleOther.trim()) setPositionFromRole(roleOther.trim()); }}
                placeholder="Diğer (serbest yazın: örn. Müdür Yardımcısı)"
                placeholderTextColor={adminTheme.colors.textMuted}
              />
              {roleOther.trim() ? (
                <TouchableOpacity style={styles.roleOtherBtn} onPress={() => setPositionFromRole(roleOther.trim())}>
                  <Ionicons name="checkmark" size={20} color={adminTheme.colors.surface} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Ad Soyad</Text>
            <TextInput
              style={styles.input}
              value={profile.full_name ?? ''}
              onChangeText={(t) => setProfile((p) => (p ? { ...p, full_name: t || null } : null))}
              onBlur={() => saveField('full_name', profile.full_name ?? '')}
              placeholder="Adınız soyadınız"
              placeholderTextColor={adminTheme.colors.textMuted}
              autoCapitalize="words"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>E-posta</Text>
            <TextInput
              style={styles.input}
              value={profile.email ?? ''}
              onChangeText={(t) => setProfile((p) => (p ? { ...p, email: t || null } : null))}
              onBlur={() => saveField('email', profile.email ?? '')}
              placeholder="ornek@otel.com"
              placeholderTextColor={adminTheme.colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Telefon</Text>
            <TextInput
              style={styles.input}
              value={profile.phone ?? ''}
              onChangeText={(t) => setProfile((p) => (p ? { ...p, phone: t || null } : null))}
              onBlur={() => saveField('phone', profile.phone ?? '')}
              placeholder="0555 123 45 67"
              placeholderTextColor={adminTheme.colors.textMuted}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Sosyal medya</Text>
            <Text style={styles.fieldHint}>
              Misafirler personel profilinizde WhatsApp ve e-posta ile aynı hizada simgeler olarak görür. Kullanıcı adı veya tam bağlantı yazabilirsiniz.
            </Text>
            <View style={styles.socialRow}>
              {(
                [
                  {
                    key: 'instagram' as StaffSocialKey,
                    icon: 'logo-instagram' as const,
                    label: 'Instagram',
                    placeholder: '@otel veya URL',
                    circle: styles.socialCircleInstagram,
                  },
                  {
                    key: 'facebook',
                    icon: 'logo-facebook',
                    label: 'Facebook',
                    placeholder: 'sayfa veya URL',
                    circle: styles.socialCircleFacebook,
                  },
                  {
                    key: 'linkedin',
                    icon: 'logo-linkedin',
                    label: 'LinkedIn',
                    placeholder: 'profil veya URL',
                    circle: styles.socialCircleLinkedin,
                  },
                  {
                    key: 'x',
                    icon: 'logo-twitter',
                    label: 'X',
                    placeholder: '@kullanıcı',
                    circle: styles.socialCircleX,
                  },
                ] as const
              ).map((item) => (
                <View key={item.key} style={styles.socialCol}>
                  <View style={[styles.socialCircle, item.circle]}>
                    <Ionicons name={item.icon} size={22} color="#fff" />
                  </View>
                  <TextInput
                    style={styles.socialInput}
                    value={social[item.key]}
                    onChangeText={(t) => {
                      setSocial((prev) => {
                        const next = { ...prev, [item.key]: t };
                        socialRef.current = next;
                        return next;
                      });
                    }}
                    onBlur={() => saveSocialLinks(socialRef.current)}
                    placeholder={item.placeholder}
                    placeholderTextColor={adminTheme.colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              ))}
            </View>
          </View>

          {saving && (
            <View style={styles.savingRow}>
              <ActivityIndicator size="small" color={adminTheme.colors.accent} />
              <Text style={styles.savingText}>Kaydediliyor...</Text>
            </View>
          )}
        </AdminCard>

        <TouchableOpacity
          style={styles.docMgmtBtn}
          activeOpacity={0.85}
          onPress={() => router.push('/admin/documents')}
        >
          <View style={styles.docMgmtIcon}>
            <Ionicons name="folder-open-outline" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.docMgmtTitle}>Doküman Yönetimi</Text>
            <Text style={styles.docMgmtSub} numberOfLines={2}>
              Belgeler, onaylar, arşiv ve loglar
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.docMgmtBtn}
          activeOpacity={0.85}
          onPress={() => router.push('/admin/attendance')}
        >
          <View style={styles.docMgmtIcon}>
            <Ionicons name="time-outline" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.docMgmtTitle}>Mesai Takibi</Text>
            <Text style={styles.docMgmtSub} numberOfLines={2}>
              Günlük mesai görünümü, giriş performansı ve personel detayları
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.docMgmtBtn}
          activeOpacity={0.85}
          onPress={() => router.push('/admin/incident-reports')}
        >
          <View style={styles.docMgmtIcon}>
            <Ionicons name="document-text-outline" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.docMgmtTitle}>Tutanaklar</Text>
            <Text style={styles.docMgmtSub} numberOfLines={2}>
              Olay kayıtları, onay süreci ve PDF/yazıcı takibi
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.docMgmtBtn}
          activeOpacity={0.85}
          onPress={() => router.push('/admin/incident-reports/new')}
        >
          <View style={styles.docMgmtIcon}>
            <Ionicons name="add-circle-outline" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.docMgmtTitle}>Tutanak Oluştur</Text>
            <Text style={styles.docMgmtSub} numberOfLines={2}>
              Yeni resmi tutanak kaydı aç ve taslak oluştur
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.textMuted} />
        </TouchableOpacity>

        <SharedAppLinks showManageButton title="Uygulamalar & Web Siteleri" compact />

        <Text style={styles.footNote}>
          Değişiklikler otomatik kaydedilir. Admin hesabınız personel tablosunda tutulur; giriş bilgileriniz (e-posta/şifre) Supabase Auth üzerinden yönetilir.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  content: {
    padding: adminTheme.spacing.lg,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: adminTheme.colors.textSecondary,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: adminTheme.colors.surfaceTertiary,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadOverlay: {
    position: 'absolute',
    inset: 0,
    borderRadius: 50,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: adminTheme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarDeleteBtn: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  roleLabel: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '600',
    color: adminTheme.colors.primary,
  },
  avatarHint: {
    marginTop: 8,
    fontSize: 13,
    color: adminTheme.colors.textMuted,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: adminTheme.colors.text,
    marginBottom: 6,
  },
  fieldHint: {
    fontSize: 12,
    color: adminTheme.colors.textMuted,
    marginBottom: 10,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: adminTheme.colors.text,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: adminTheme.radius.md,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  chipActive: {
    backgroundColor: adminTheme.colors.primary,
    borderColor: adminTheme.colors.primary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: adminTheme.colors.text,
  },
  chipTextActive: {
    color: adminTheme.colors.surface,
  },
  roleOtherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleOtherInput: {
    flex: 1,
  },
  roleOtherBtn: {
    width: 44,
    height: 44,
    borderRadius: adminTheme.radius.md,
    backgroundColor: adminTheme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.md,
    padding: adminTheme.spacing.md,
    fontSize: 15,
    backgroundColor: adminTheme.colors.surface,
    color: adminTheme.colors.text,
  },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  savingText: {
    fontSize: 13,
    color: adminTheme.colors.textMuted,
  },
  docMgmtBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.lg,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  docMgmtIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: adminTheme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docMgmtTitle: { fontSize: 15, fontWeight: '800', color: adminTheme.colors.text },
  docMgmtSub: { marginTop: 2, fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted, lineHeight: 16 },
  socialRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 14,
    marginTop: 4,
    paddingVertical: 8,
  },
  socialCol: {
    width: 72,
    alignItems: 'center',
  },
  socialCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  socialCircleInstagram: {
    backgroundColor: '#E4405F',
  },
  socialCircleFacebook: {
    backgroundColor: '#1877F2',
  },
  socialCircleLinkedin: {
    backgroundColor: '#0A66C2',
  },
  socialCircleX: {
    backgroundColor: '#0f1419',
  },
  socialInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 6,
    fontSize: 11,
    backgroundColor: adminTheme.colors.surface,
    color: adminTheme.colors.text,
    textAlign: 'center',
  },
  footNote: {
    marginTop: 20,
    fontSize: 12,
    color: adminTheme.colors.textMuted,
    lineHeight: 18,
  },
});
