import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
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
  Switch,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { uriToArrayBuffer } from '@/lib/uploadMedia';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { pickProfileCoverUri } from '@/lib/profileCoverPicker';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';
import { CachedImage } from '@/components/CachedImage';
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
import type { ProfileStatItem } from '@/components/ProfileStatsCard';
import { canAccessAdminRoute } from '@/lib/adminRoutePermissions';

type StaffProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  profile_image: string | null;
  cover_image: string | null;
  department: string | null;
  position: string | null;
  hire_date: string | null;
  created_at: string | null;
  tenure_note: string | null;
  office_location: string | null;
  bio: string | null;
  specialties: string[] | null;
  languages: string[] | null;
  achievements: string[] | null;
  social_links: Record<string, unknown> | null;
  show_phone_to_guest: boolean | null;
  show_email_to_guest: boolean | null;
  show_whatsapp_to_guest: boolean | null;
  profile_hidden_by_admin: boolean | null;
};

const SOCIAL_FIELDS = [
  {
    key: 'instagram' as StaffSocialKey,
    icon: 'logo-instagram' as const,
    label: 'Instagram',
    placeholder: '@otel veya URL',
    circle: { backgroundColor: '#E1306C' },
  },
  {
    key: 'facebook' as StaffSocialKey,
    icon: 'logo-facebook' as const,
    label: 'Facebook',
    placeholder: 'sayfa veya URL',
    circle: { backgroundColor: '#1877F2' },
  },
  {
    key: 'linkedin' as StaffSocialKey,
    icon: 'logo-linkedin' as const,
    label: 'LinkedIn',
    placeholder: 'profil veya URL',
    circle: { backgroundColor: '#0A66C2' },
  },
  {
    key: 'x' as StaffSocialKey,
    icon: 'logo-twitter' as const,
    label: 'X',
    placeholder: '@kullanıcı',
    circle: { backgroundColor: '#111827' },
  },
] as const;

function splitList(raw: string): string[] {
  return raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export default function AdminStaffProfileEditScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { staff: adminActor } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [row, setRow] = useState<StaffProfileRow | null>(null);
  const [extendedStats, setExtendedStats] = useState<Awaited<ReturnType<typeof loadStaffProfileExtendedStats>> | null>(null);
  const [social, setSocial] = useState<StaffSocialLinksState>(() => emptyStaffSocialLinks());
  const socialRef = useRef<StaffSocialLinksState>(emptyStaffSocialLinks());

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [officeLocation, setOfficeLocation] = useState('');
  const [tenureNote, setTenureNote] = useState('');
  const [bio, setBio] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [languages, setLanguages] = useState('');
  const [achievements, setAchievements] = useState('');
  const [showPhone, setShowPhone] = useState(true);
  const [showEmail, setShowEmail] = useState(true);
  const [showWhatsapp, setShowWhatsapp] = useState(true);
  const [profileHidden, setProfileHidden] = useState(false);

  useEffect(() => {
    socialRef.current = social;
  }, [social]);

  const hydrate = useCallback((data: StaffProfileRow) => {
    setRow(data);
    setFullName(data.full_name?.trim() ?? '');
    setPhone(data.phone?.trim() ?? '');
    setEmail(data.email?.trim() ?? '');
    setWhatsapp(data.whatsapp?.trim() ?? '');
    setOfficeLocation(data.office_location?.trim() ?? '');
    setTenureNote(data.tenure_note?.trim() ?? '');
    setBio(data.bio?.trim() ?? '');
    setSpecialties(data.specialties?.join(', ') ?? '');
    setLanguages(data.languages?.join(', ') ?? '');
    setAchievements(data.achievements?.join(', ') ?? '');
    setShowPhone(data.show_phone_to_guest !== false);
    setShowEmail(data.show_email_to_guest !== false);
    setShowWhatsapp(data.show_whatsapp_to_guest !== false);
    setProfileHidden(data.profile_hidden_by_admin === true);
    const sl = staffSocialLinksFromJson(data.social_links);
    setSocial(sl);
    socialRef.current = sl;
  }, []);

  useEffect(() => {
    if (!adminActor || !canAccessAdminRoute(adminActor, '/admin/staff/list')) {
      router.replace('/admin');
      return;
    }
    if (!id) return;

    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('staff')
          .select(
            'id, full_name, email, phone, whatsapp, profile_image, cover_image, department, position, hire_date, created_at, tenure_note, office_location, bio, specialties, languages, achievements, social_links, show_phone_to_guest, show_email_to_guest, show_whatsapp_to_guest, profile_hidden_by_admin'
          )
          .eq('id', id)
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          Alert.alert('Bulunamadı', 'Personel kaydı bulunamadı.', [{ text: 'Tamam', onPress: () => router.back() }]);
          return;
        }
        const d = data as StaffProfileRow;
        hydrate(d);
        const joinIso = d.hire_date ?? d.created_at ?? null;
        const days = joinIso ? calculateDaysWithUs(joinIso, Date.now()) : null;
        const stats = await loadStaffProfileExtendedStats(d.id, days);
        setExtendedStats(stats);
      } catch (e) {
        Alert.alert('Hata', (e as Error)?.message ?? 'Profil yüklenemedi.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [adminActor, id, hydrate, router]);

  const pickCover = async () => {
    if (!row || uploadingCover) return;
    try {
      const uri = await pickProfileCoverUri('Galeri izni kapalı.');
      if (!uri) return;
      setUploadingCover(true);
      const { publicUrl } = await uploadUriToPublicBucket({
        bucketId: 'profiles',
        uri,
        kind: 'image',
        subfolder: `staff/${row.id}/cover`,
      });
      const { error } = await supabase.from('staff').update({ cover_image: publicUrl }).eq('id', row.id);
      if (error) throw error;
      setRow((p) => (p ? { ...p, cover_image: publicUrl } : null));
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Kapak yüklenemedi.');
    } finally {
      setUploadingCover(false);
    }
  };

  const pickImage = async () => {
    if (!row) return;
    const granted = await ensureMediaLibraryPermission({
      title: 'Galeri izni',
      message: 'Profil fotografı secmek icin galeri erisimi istiyoruz.',
      settingsMessage: 'Galeri izni kapali. Profil fotografi icin ayarlardan izin verin.',
    });
    if (!granted) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      setUploading(true);
      const arrayBuffer = await uriToArrayBuffer(result.assets[0].uri);
      const fileName = `staff/${row.id}/${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage.from('profiles').upload(fileName, arrayBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (uploadErr) throw uploadErr;
      const {
        data: { publicUrl },
      } = supabase.storage.from('profiles').getPublicUrl(fileName);
      const { error } = await supabase.from('staff').update({ profile_image: publicUrl }).eq('id', row.id);
      if (error) throw error;
      setRow((p) => (p ? { ...p, profile_image: publicUrl } : null));
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Resim yüklenemedi.');
    } finally {
      setUploading(false);
    }
  };

  const confirmDeleteProfileImage = () => {
    if (!row?.profile_image || uploading) return;
    Alert.alert('Sil', 'Profil resmi kaldırılacak. Devam edilsin mi?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setUploading(true);
            try {
              const { error } = await supabase.from('staff').update({ profile_image: null }).eq('id', row.id);
              if (error) throw error;
              setRow((p) => (p ? { ...p, profile_image: null } : null));
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

  const handleSave = async () => {
    if (!row?.id) return;
    const nameTrim = fullName.trim();
    if (!nameTrim) {
      Alert.alert('Hata', 'Ad soyad zorunludur.');
      return;
    }

    const payload = {
      full_name: nameTrim,
      phone: phone.trim() || null,
      email: email.trim() || row.email || '',
      whatsapp: whatsapp.trim() || null,
      office_location: officeLocation.trim() || null,
      tenure_note: tenureNote.trim() || null,
      bio: bio.trim() || null,
      specialties: splitList(specialties),
      languages: splitList(languages),
      achievements: splitList(achievements),
      social_links: staffSocialLinksToJson(socialRef.current),
      show_phone_to_guest: showPhone,
      show_email_to_guest: showEmail,
      show_whatsapp_to_guest: showWhatsapp,
      profile_hidden_by_admin: profileHidden,
      updated_at: new Date().toISOString(),
    };

    setSaving(true);
    try {
      const { error } = await supabase.from('staff').update(payload).eq('id', row.id);
      if (error) throw error;
      setRow((p) => (p ? { ...p, ...payload } : null));
      Alert.alert('Kaydedildi', 'Personel profili güncellendi.');
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Kayıt başarısız.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !row) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.primary} />
        <Text style={styles.loadingText}>Profil yükleniyor…</Text>
      </View>
    );
  }

  const avatarUri = row.profile_image || undefined;
  const positionLine = [row.position, row.department].filter(Boolean).join(' · ');
  const statItems: ProfileStatItem[] = extendedStats
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
          staffId={row.id}
          fullName={fullName || row.full_name}
          positionLine={positionLine || null}
          coverUri={row.cover_image}
          avatarUri={avatarUri}
          statItems={statItems}
          onPickCover={pickCover}
          uploadingCover={uploadingCover}
        />

        <View style={styles.topActions}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.push(`/staff/profile/${row.id}`)}
            activeOpacity={0.85}
          >
            <Ionicons name="eye-outline" size={18} color={adminTheme.colors.primary} />
            <Text style={styles.secondaryBtnText}>Profili önizle</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.push(`/admin/staff/${row.id}`)}
            activeOpacity={0.85}
          >
            <Ionicons name="id-card-outline" size={18} color={adminTheme.colors.primary} />
            <Text style={styles.secondaryBtnText}>İK kaydı</Text>
          </TouchableOpacity>
        </View>

        <AdminCard>
          <View style={styles.avatarSection}>
            <TouchableOpacity onPress={pickImage} disabled={uploading} style={styles.avatarWrap} activeOpacity={0.8}>
              {avatarUri ? (
                <CachedImage uri={avatarUri} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={48} color={adminTheme.colors.textMuted} />
                </View>
              )}
              {uploading ? (
                <View style={styles.uploadOverlay}>
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              ) : null}
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
            <Text style={styles.avatarHint}>Profil fotoğrafı için dokunun</Text>
          </View>

          <Text style={styles.sectionTitle}>Kişisel bilgiler</Text>
          <Field label="Ad Soyad">
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Ad Soyad"
              placeholderTextColor={adminTheme.colors.textMuted}
              autoCapitalize="words"
            />
          </Field>
          <Field label="Kıdem notu (profil alt metni)">
            <TextInput
              style={styles.input}
              value={tenureNote}
              onChangeText={setTenureNote}
              placeholder="Örn: Ön büro kıdem sorumlusu"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>

          <Text style={styles.sectionTitle}>İletişim</Text>
          <Field label="Telefon">
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="0555 123 45 67"
              placeholderTextColor={adminTheme.colors.textMuted}
              keyboardType="phone-pad"
            />
          </Field>
          <Field label="E-posta">
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="ornek@otel.com"
              placeholderTextColor={adminTheme.colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </Field>
          <Field label="WhatsApp">
            <TextInput
              style={styles.input}
              value={whatsapp}
              onChangeText={setWhatsapp}
              placeholder="05551234567"
              placeholderTextColor={adminTheme.colors.textMuted}
              keyboardType="phone-pad"
            />
          </Field>
          <Field label="Ofis / konum">
            <TextInput
              style={styles.input}
              value={officeLocation}
              onChangeText={setOfficeLocation}
              placeholder="Örn: 2. Kat Ofisi"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>

          <Text style={styles.sectionTitle}>Misafir görünürlüğü</Text>
          <SwitchRow label="Telefonu misafire göster" value={showPhone} onValueChange={setShowPhone} />
          <SwitchRow label="E-postayı misafire göster" value={showEmail} onValueChange={setShowEmail} />
          <SwitchRow label="WhatsApp'ı misafire göster" value={showWhatsapp} onValueChange={setShowWhatsapp} />
          <SwitchRow label="Gizli profil (maskeli ad)" value={profileHidden} onValueChange={setProfileHidden} />
          <Text style={styles.fieldHint}>
            Gizli profil açıksa yalnızca fotoğraf ve maskeli ad görünür; diğer bilgiler gizlenir.
          </Text>

          <Text style={styles.sectionTitle}>Profil içeriği</Text>
          <Field label="Hakkında">
            <TextInput
              style={[styles.input, styles.textArea]}
              value={bio}
              onChangeText={setBio}
              placeholder="Personel hakkında kısa bilgi"
              placeholderTextColor={adminTheme.colors.textMuted}
              multiline
            />
          </Field>
          <Field label="Uzmanlıklar (virgülle)">
            <TextInput
              style={styles.input}
              value={specialties}
              onChangeText={setSpecialties}
              placeholder="Örn: VIP karşılama, spa"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>
          <Field label="Konuşulan diller (virgülle)">
            <TextInput
              style={styles.input}
              value={languages}
              onChangeText={setLanguages}
              placeholder="Örn: Türkçe, İngilizce"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>
          <Field label="Başarılar (virgülle)">
            <TextInput
              style={styles.input}
              value={achievements}
              onChangeText={setAchievements}
              placeholder="Örn: Ayın Personeli 2024"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>

          <Text style={styles.sectionTitle}>Sosyal medya</Text>
          <Text style={styles.fieldHint}>
            Misafirler personel profilinde simgeler olarak görür. Kullanıcı adı veya tam bağlantı yazabilirsiniz.
          </Text>
          <View style={styles.socialRow}>
            {SOCIAL_FIELDS.map((item) => (
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
                  placeholder={item.placeholder}
                  placeholderTextColor={adminTheme.colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            ))}
          </View>
        </AdminCard>

        <TouchableOpacity
          style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.88}
        >
          {saving ? (
            <ActivityIndicator color={adminTheme.button.primaryText} size="small" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={22} color={adminTheme.button.primaryText} />
              <Text style={styles.primaryButtonText}>Profili kaydet</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function SwitchRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: adminTheme.colors.border, true: adminTheme.colors.primary }}
        thumbColor="#fff"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: adminTheme.spacing.lg, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 15, color: adminTheme.colors.textSecondary },
  topActions: { flexDirection: 'row', gap: 10, marginBottom: adminTheme.spacing.md },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: adminTheme.radius.md,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.primary },
  avatarSection: { alignItems: 'center', marginBottom: 20 },
  avatarWrap: { position: 'relative' },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: adminTheme.colors.surfaceTertiary },
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
  avatarHint: { marginTop: 8, fontSize: 13, color: adminTheme.colors.textMuted },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: adminTheme.colors.text,
    marginTop: 8,
    marginBottom: 12,
  },
  field: { marginBottom: 14 },
  label: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.text, marginBottom: 6 },
  fieldHint: { fontSize: 12, color: adminTheme.colors.textMuted, marginBottom: 10, lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: adminTheme.colors.text,
    backgroundColor: adminTheme.colors.surface,
  },
  textArea: { minHeight: 96, textAlignVertical: 'top' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    gap: 12,
  },
  switchLabel: { flex: 1, fontSize: 14, color: adminTheme.colors.text },
  socialRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  socialCol: { width: '47%', minWidth: 140 },
  socialCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  socialInput: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 13,
    color: adminTheme.colors.text,
    backgroundColor: adminTheme.colors.surface,
  },
  primaryButton: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: adminTheme.button.primary,
    borderRadius: adminTheme.radius.lg,
    paddingVertical: 16,
  },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: adminTheme.button.primaryText, fontSize: 17, fontWeight: '700' },
});
