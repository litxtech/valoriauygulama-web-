import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFloatingTabBarTotalHeight } from '@/constants/floatingTabBarMetrics';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import {
  PARTNER_STATUS_LABELS,
  changePartnerPassword,
  fmtPartnerMoney,
  formatPartnerDate,
  partnerHotelInitials,
  updatePartnerLogo,
  updatePartnerOwnProfile,
} from '@/lib/breakfastPartner';
import { getPartnerAccountCache, loadPartnerAccountSnapshot } from '@/lib/partnerAccountCache';
import { partnerRadii, partnerTheme } from '@/lib/breakfastPartnerTheme';
import { useAuthStore } from '@/stores/authStore';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import {
  PartnerField,
  PartnerGlassCard,
  PartnerHero,
  PartnerPrimaryButton,
  PartnerReadOnlyField,
  PartnerSectionTitle,
} from '@/components/breakfastPartner/PartnerUi';
import { switchPartnerToMainApp } from '@/stores/partnerAppSurfaceStore';

type PartnerProfileContentProps = {
  showBack?: boolean;
};

export function PartnerProfileContent({ showBack = false }: PartnerProfileContentProps) {
  const insets = useSafeAreaInsets();
  const scrollBottomPad = insets.bottom + getFloatingTabBarTotalHeight(insets) + 24;
  const router = useRouter();
  const partner = usePartnerAuthStore((s) => s.partner);
  const user = useAuthStore((s) => s.user);
  const resolvePartner = usePartnerAuthStore((s) => s.resolvePartner);
  const signOut = useAuthStore((s) => s.signOut);

  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [taxId, setTaxId] = useState('');
  const [taxOffice, setTaxOffice] = useState('');
  const [iban, setIban] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const hotelId = partner?.hotel.id ?? '';
  const cachedBalance = hotelId ? getPartnerAccountCache(hotelId)?.openBalance : undefined;
  const [openBalance, setOpenBalance] = useState(cachedBalance ?? 0);
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [saving, setSaving] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [loadingBalance, setLoadingBalance] = useState(partner?.isPortalActive && cachedBalance == null);
  const [balanceLoadFailed, setBalanceLoadFailed] = useState(false);

  const isSuspended = partner?.hotel.status === 'suspended';
  const canEdit = !isSuspended;

  useEffect(() => {
    if (!partner) return;
    setName(partner.hotel.name);
    setContactName(partner.fullName);
    setPhone(partner.hotel.phone ?? '');
    setCity(partner.hotel.city ?? '');
    setAddress(partner.hotel.address ?? '');
    setTaxId(partner.hotel.tax_id ?? '');
    setTaxOffice(partner.hotel.tax_office ?? '');
    setIban(partner.hotel.iban ?? '');
    setLogoUrl(partner.hotel.logo_url ?? null);
  }, [partner]);

  const loadBalance = useCallback(async () => {
    if (!partner?.isPortalActive || !hotelId) {
      setOpenBalance(0);
      setLoadingBalance(false);
      setBalanceLoadFailed(false);
      return;
    }
    setLoadingBalance(true);
    setBalanceLoadFailed(false);
    try {
      const snap = await loadPartnerAccountSnapshot(hotelId, { force: true });
      setOpenBalance(snap.openBalance);
    } catch {
      const cached = getPartnerAccountCache(hotelId);
      if (cached) setOpenBalance(cached.openBalance);
      else setBalanceLoadFailed(true);
    } finally {
      setLoadingBalance(false);
    }
  }, [partner?.isPortalActive, hotelId]);

  useEffect(() => {
    if (!partner?.isPortalActive || !hotelId) return;
    const cached = getPartnerAccountCache(hotelId);
    if (cached != null) setOpenBalance(cached.openBalance);
    void loadBalance();
  }, [partner?.isPortalActive, hotelId, loadBalance]);

  useFocusEffect(
    useCallback(() => {
      void loadBalance();
    }, [loadBalance])
  );

  const refreshPartner = async () => {
    if (user) await resolvePartner(user);
  };

  const pickLogo = async () => {
    if (!partner || !canEdit) return;
    const granted = await ensureMediaLibraryPermission({
      title: 'Galeri izni',
      message: 'Otel logosu seçmek için galeri erişimi gerekir.',
      settingsMessage: 'Galeri izni kapalı. Logo yüklemek için ayarlardan izin verin.',
    });
    if (!granted) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (result.canceled || !result.assets[0]?.uri) return;

      setUploadingLogo(true);
      const { publicUrl } = await uploadUriToPublicBucket({
        bucketId: 'profiles',
        uri: result.assets[0].uri,
        subfolder: `breakfast-partner/${partner.hotel.id}`,
      });
      const uploadResult = await updatePartnerLogo(publicUrl);
      if ('error' in uploadResult) throw new Error(uploadResult.error);
      setLogoUrl(publicUrl);
      await refreshPartner();
    } catch (e) {
      Alert.alert('Logo yüklenemedi', (e as Error)?.message ?? 'Tekrar deneyin.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const save = async () => {
    if (!canEdit) return;
    setSaving(true);
    const result = await updatePartnerOwnProfile({
      name: name.trim(),
      contactName: contactName.trim(),
      phone: phone.trim() || undefined,
      city: city.trim() || undefined,
      address: address.trim() || undefined,
      taxId: taxId.trim() || undefined,
      taxOffice: taxOffice.trim() || undefined,
      iban: iban.trim() || undefined,
    });
    setSaving(false);
    if ('error' in result) {
      Alert.alert('Hata', result.error);
      return;
    }
    await refreshPartner();
    Alert.alert('Kaydedildi', 'Profiliniz güncellendi.');
  };

  const changePassword = async () => {
    if (newPassword.length < 8) {
      Alert.alert('Şifre', 'En az 8 karakter girin.');
      return;
    }
    if (newPassword !== newPassword2) {
      Alert.alert('Şifre', 'Yeni şifreler eşleşmiyor.');
      return;
    }
    setChangingPw(true);
    const err = await changePartnerPassword(newPassword);
    setChangingPw(false);
    if (err) Alert.alert('Hata', err);
    else {
      setNewPassword('');
      setNewPassword2('');
      Alert.alert('Tamam', 'Şifreniz güncellendi.');
    }
  };

  if (!partner) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={partnerTheme.accent} />
      </View>
    );
  }

  const initials = partnerHotelInitials(name || partner.hotel.name);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
      {showBack ? (
        <PartnerHero title="Profilim" subtitle={partner.hotel.name} onBack={() => router.back()} />
      ) : null}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPad }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.identityCard}>
          <TouchableOpacity
            style={styles.logoWrap}
            onPress={() => void pickLogo()}
            disabled={!canEdit || uploadingLogo}
            activeOpacity={0.85}
          >
            {logoUrl ? (
              <CachedImage uri={logoUrl} style={styles.logoImg} contentFit="cover" recyclingKey={logoUrl} />
            ) : (
              <LinearGradient colors={[...partnerTheme.accentGradient]} style={styles.logoFallback}>
                <Text style={styles.logoInitials}>{initials}</Text>
              </LinearGradient>
            )}
            {canEdit ? (
              <View style={styles.logoBadge}>
                {uploadingLogo ? (
                  <ActivityIndicator size="small" color="#0f172a" />
                ) : (
                  <Ionicons name="camera" size={14} color="#0f172a" />
                )}
              </View>
            ) : null}
          </TouchableOpacity>
          <Text style={styles.identityName}>{name || partner.hotel.name}</Text>
          <View style={styles.identityMetaRow}>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{PARTNER_STATUS_LABELS[partner.hotel.status]}</Text>
            </View>
          </View>
          {partner.isPortalActive && partner.effectiveUnitPrice > 0 ? (
            <View style={styles.breakfastPriceCard}>
              <View style={styles.breakfastPriceIconWrap}>
                <Ionicons name="restaurant-outline" size={20} color={partnerTheme.accent} />
              </View>
              <View style={styles.breakfastPriceBody}>
                <Text style={styles.breakfastPriceLabel}>Kişi başı kahvaltı ücreti</Text>
                <Text style={styles.breakfastPriceValue}>{fmtPartnerMoney(partner.effectiveUnitPrice)}</Text>
                <Text style={styles.breakfastPriceHint}>
                  {partner.hotel.unit_price != null && partner.hotel.unit_price > 0
                    ? 'Otelinize özel fiyat · günlük kayıtlarda cariye yansır'
                    : 'Güncel tarife · günlük kayıtlarda cariye yansır'}
                </Text>
              </View>
            </View>
          ) : !partner.isPortalActive ? (
            <Text style={styles.breakfastPricePending}>
              Kişi başı kahvaltı ücreti, hesap onayından sonra burada görünür.
            </Text>
          ) : null}
          {partner.isPortalActive ? (
            <TouchableOpacity
              style={styles.balanceRow}
              onPress={() => router.push('/partner/(tabs)/account')}
              activeOpacity={0.85}
            >
              <Text style={styles.balanceLabel}>Açık cari</Text>
              <Text style={styles.balanceValue}>
                {loadingBalance ? '…' : balanceLoadFailed ? '—' : fmtPartnerMoney(openBalance)}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={partnerTheme.muted} />
            </TouchableOpacity>
          ) : (
            <Text style={styles.registeredAt}>Kayıt: {formatPartnerDate(partner.hotel.created_at.slice(0, 10))}</Text>
          )}
        </View>

        {isSuspended ? (
          <View style={styles.suspendedBanner}>
            <Ionicons name="pause-circle-outline" size={20} color={partnerTheme.danger} />
            <Text style={styles.suspendedText}>
              Hesabınız askıda. Profil bilgilerini düzenleyemezsiniz; detay için Valoria yönetimi ile iletişime geçin.
            </Text>
          </View>
        ) : null}

        <PartnerGlassCard style={{ marginTop: 14 }}>
          <PartnerSectionTitle icon="mail-outline" title="Hesap" hint="Giriş bilgileriniz" />
          <PartnerReadOnlyField
            label="Giriş e-postası"
            value={partner.email}
            hint="E-posta değişikliği için Valoria yönetimi ile iletişime geçin."
          />
        </PartnerGlassCard>

        <PartnerGlassCard style={{ marginTop: 14 }}>
          <PartnerSectionTitle icon="business-outline" title="Otel bilgileri" />
          <PartnerField label="Otel adı" value={name} onChangeText={setName} editable={canEdit} />
          <PartnerField label="Yetkili ad soyad" value={contactName} onChangeText={setContactName} editable={canEdit} />
          <PartnerField label="Telefon" value={phone} onChangeText={setPhone} keyboardType="phone-pad" editable={canEdit} />
          <PartnerField label="Şehir" value={city} onChangeText={setCity} editable={canEdit} />
          <PartnerField
            label="Adres"
            value={address}
            onChangeText={setAddress}
            multiline
            editable={canEdit}
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />
          {canEdit ? <PartnerPrimaryButton label="Otel bilgilerini kaydet" onPress={save} loading={saving} /> : null}
        </PartnerGlassCard>

        <PartnerGlassCard style={{ marginTop: 14 }}>
          <PartnerSectionTitle icon="receipt-outline" title="Fatura bilgileri" hint="Tahsilat ve faturalama için" />
          <PartnerField label="Vergi no" value={taxId} onChangeText={setTaxId} editable={canEdit} />
          <PartnerField label="Vergi dairesi" value={taxOffice} onChangeText={setTaxOffice} editable={canEdit} />
          <PartnerField
            label="IBAN"
            value={iban}
            onChangeText={setIban}
            autoCapitalize="characters"
            editable={canEdit}
            placeholder="TR00 0000 0000 0000 0000 0000 00"
            placeholderTextColor={partnerTheme.mutedSoft}
          />
          {canEdit ? <PartnerPrimaryButton label="Fatura bilgilerini kaydet" onPress={save} loading={saving} /> : null}
        </PartnerGlassCard>

        <PartnerGlassCard style={{ marginTop: 14 }}>
          <PartnerSectionTitle icon="compass-outline" title="Uygulama geçişi" hint="İstediğiniz zaman geçiş yapın" />
          <Text style={styles.noticeBody}>
            Valoria misafir uygulamasında otel içeriğine, haritaya ve diğer özelliklere göz atabilirsiniz. Kahvaltı
            kaydı ve cari işlemler partner portalında kalır.
          </Text>
          <PartnerPrimaryButton
            label="Uygulamaya git"
            onPress={() => void switchPartnerToMainApp(router)}
            variant="ghost"
          />
        </PartnerGlassCard>

        <PartnerGlassCard style={{ marginTop: 14 }}>
          <PartnerSectionTitle icon="videocam-outline" title="Kamera talepleri" hint="Geçmiş kahvaltı kayıtları" />
          <Text style={styles.noticeBody}>
            Belirli tarih ve saat için kamera görüntüsü talep edebilir, sonuçları izleyebilirsiniz.
          </Text>
          <PartnerPrimaryButton
            label="Kamera taleplerim"
            variant="ghost"
            onPress={() => router.push('/partner/camera-requests')}
          />
        </PartnerGlassCard>

        <PartnerGlassCard style={{ marginTop: 14 }}>
          <PartnerSectionTitle icon="notifications-outline" title="Bildirimler" hint="Uygulama içi ve push" />
          <Text style={styles.noticeBody}>
            Tahsilat, fiyat değişikliği ve günlük kahvaltı hatırlatmaları bu hesaba gönderilir.
          </Text>
        </PartnerGlassCard>

        <PartnerGlassCard style={{ marginTop: 14 }}>
          <PartnerSectionTitle icon="lock-closed-outline" title="Şifre değiştir" hint="En az 8 karakter" />
          <PartnerField label="Yeni şifre" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
          <PartnerField label="Yeni şifre (tekrar)" value={newPassword2} onChangeText={setNewPassword2} secureTextEntry />
          <PartnerPrimaryButton label="Şifreyi güncelle" onPress={changePassword} loading={changingPw} />
        </PartnerGlassCard>

        <PartnerPrimaryButton label="Çıkış yap" variant="danger" onPress={() => void signOut()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: partnerTheme.bg },
  boot: { flex: 1, backgroundColor: partnerTheme.bg, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 18, paddingTop: 12 },
  identityCard: {
    alignItems: 'center',
    backgroundColor: partnerTheme.card,
    borderRadius: partnerRadii.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
  },
  logoWrap: {
    width: 92,
    height: 92,
    borderRadius: 28,
    overflow: 'hidden',
    marginBottom: 12,
  },
  logoImg: { width: '100%', height: '100%' },
  logoFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logoInitials: { color: '#0f172a', fontSize: 28, fontWeight: '900' },
  logoBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: partnerTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: partnerTheme.card,
  },
  identityName: { color: partnerTheme.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  identityMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  statusPill: {
    backgroundColor: partnerTheme.accentSoft,
    borderRadius: partnerRadii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusPillText: { color: partnerTheme.accent, fontWeight: '800', fontSize: 12 },
  breakfastPriceCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 14,
    padding: 14,
    borderRadius: partnerRadii.md,
    backgroundColor: partnerTheme.bgSoft,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
    width: '100%',
  },
  breakfastPriceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: partnerTheme.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breakfastPriceBody: { flex: 1 },
  breakfastPriceLabel: { color: partnerTheme.muted, fontSize: 12, fontWeight: '600' },
  breakfastPriceValue: { color: partnerTheme.text, fontWeight: '900', fontSize: 22, marginTop: 2 },
  breakfastPriceHint: { color: partnerTheme.mutedSoft, fontSize: 12, lineHeight: 17, marginTop: 6 },
  breakfastPricePending: {
    color: partnerTheme.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 14,
    paddingHorizontal: 8,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: partnerTheme.cardBorder,
    width: '100%',
    justifyContent: 'center',
  },
  balanceLabel: { color: partnerTheme.muted, fontSize: 13, fontWeight: '600' },
  balanceValue: { color: partnerTheme.accent, fontSize: 18, fontWeight: '900' },
  registeredAt: { color: partnerTheme.muted, fontSize: 13, marginTop: 14 },
  suspendedBanner: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    marginTop: 14,
    padding: 14,
    borderRadius: partnerRadii.md,
    backgroundColor: partnerTheme.dangerSoft,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.25)',
  },
  suspendedText: { flex: 1, color: partnerTheme.text, fontSize: 13, lineHeight: 19 },
  noticeBody: { color: partnerTheme.muted, fontSize: 14, lineHeight: 21 },
});
