import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGuestFlowStore } from '@/stores/guestFlowStore';
import { useGuestMessagingStore } from '@/stores/guestMessagingStore';
import { supabase, supabaseUrl, supabaseAnonKey } from '@/lib/supabase';
import { uriToArrayBuffer } from '@/lib/uploadMedia';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { CachedImage } from '@/components/CachedImage';
import { isoDateToFormDisplay, resolveInAppContractContext, type GuestContractPrefill } from '@/lib/inAppContractFlow';
import { COUNTRY_PHONE_CODES, type CountryCode } from '@/constants/countryPhoneCodes';
import { LANGUAGES } from '@/i18n';
import { FORM_STRINGS, DEFAULT_FORM_FIELDS, type ContractFormLang } from '@/lib/contractFormStrings';
import { notifyAdmins } from '@/lib/notificationService';
import { ADMIN_TYPES } from '@/lib/notifications';
import { safeRouterReplace } from '@/lib/safeRouter';
import { GuestSignOneWebShell, GUEST_CONTRACT_WEB_BG } from '@/components/guest/GuestSignOneWebShell';

const CONTRACT_LANGS = LANGUAGES;

function parseDDMMYYYY(s: string): string | null {
  const trimmed = (s || '').trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/[./-]/).map((p) => parseInt(p, 10));
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d);
  return date.toISOString().slice(0, 10) + 'T12:00:00.000Z';
}

function toISODate(s: string): string | null {
  const iso = parseDDMMYYYY(s);
  return iso ? iso.slice(0, 10) : null;
}

const ID_TYPE_VALUES = ['tc', 'passport', 'other'] as const;
const GENDER_VALUES = ['male', 'female'] as const;

export type FamilyMemberTcRow = { full_name: string; tc: string };

function emptyFamilyRow(): FamilyMemberTcRow {
  return { full_name: '', tc: '' };
}

function normalizeFamilyMemberTcs(rows: FamilyMemberTcRow[]): FamilyMemberTcRow[] {
  return rows
    .map((r) => ({
      full_name: r.full_name.trim(),
      tc: r.tc.replace(/\D/g, '').slice(0, 11),
    }))
    .filter((r) => r.full_name.length > 0 || r.tc.length > 0);
}

function showGuestFlowAlert(title: string, message: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

async function uploadGuestAvatarInBackground(guestId: string, avatarUri: string) {
  try {
    const arrayBuffer = await uriToArrayBuffer(avatarUri);
    const fileName = `guest/${guestId}/${Date.now()}.jpg`;
    const { error: uploadErr } = await supabase.storage.from('profiles').upload(fileName, arrayBuffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (uploadErr) return;
    const {
      data: { publicUrl },
    } = supabase.storage.from('profiles').getPublicUrl(fileName);
    await supabase.from('guests').update({ photo_url: publicUrl }).eq('id', guestId);
  } catch {
    /* profil fotoğrafı onayı engellemesin */
  }
}

// Göz yormayan, okunaklı renk paleti (web: tek sayfa arka planı)
const COLORS = {
  bg: GUEST_CONTRACT_WEB_BG,
  card: '#ffffff',
  cardBorder: '#e2e8f0',
  text: '#0f172a',
  textSecondary: '#64748b',
  label: '#334155',
  accent: '#0d9488',
  accentLight: '#ccfbf1',
  success: '#059669',
  inputBg: '#f8fafc',
  inputBorder: '#e2e8f0',
  divider: '#e2e8f0',
};

export default function GuestSignOneScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ token?: string; lang?: string; t?: string; l?: string; inApp?: string; guestId?: string }>();
  const { qrToken, roomId, setQR, setStep, setGuestId, setContractLang: setStoreContractLang, setSignedFormLines } = useGuestFlowStore();
  const { setAppToken } = useGuestMessagingStore();

  const inAppMode = params.inApp === '1' || params.inApp === 'true';
  const inAppGuestId = (params.guestId ?? '').trim() || null;

  const token = (params.token ?? params.t ?? qrToken ?? '').trim();
  const lang = (params.lang ?? params.l ?? i18n.language ?? 'tr').toLowerCase();
  const missingWebEnv = Platform.OS === 'web' && (!supabaseUrl || !supabaseAnonKey);

  const [contractContent, setContractContent] = useState('');
  const [contractLang, setContractLang] = useState(lang);
  const [loadingContract, setLoadingContract] = useState(true);
  const [translating, setTranslating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showNationalityPicker, setShowNationalityPicker] = useState(false);
  const [formFieldsConfig, setFormFieldsConfig] = useState<Record<string, boolean>>(DEFAULT_FORM_FIELDS);
  const translatedCache = useRef<Record<string, string>>({});
  const submittedRef = useRef(false);

  const [fullName, setFullName] = useState('');
  const [idType, setIdType] = useState<'tc' | 'passport' | 'other'>('tc');
  const [idNumber, setIdNumber] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(COUNTRY_PHONE_CODES[0]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [nationality, setNationality] = useState('Türkiye');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [address, setAddress] = useState('');
  const [checkInDate, setCheckInDate] = useState('');
  const [checkOutDate, setCheckOutDate] = useState('');
  const [roomType, setRoomType] = useState('Çift kişilik');
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [familyMemberTcs, setFamilyMemberTcs] = useState<FamilyMemberTcRow[]>([emptyFamilyRow()]);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [inAppBootstrapping, setInAppBootstrapping] = useState(false);
  const [inAppBootstrapError, setInAppBootstrapError] = useState<string | null>(null);

  const applyGuestPrefill = useCallback((row: GuestContractPrefill) => {
    if (row.full_name) setFullName(row.full_name);
    if (row.id_number) setIdNumber(row.id_number);
    if (row.id_type === 'tc' || row.id_type === 'passport' || row.id_type === 'other') setIdType(row.id_type);
    if (row.phone) {
      const dial = row.phone_country_code ?? '';
      const match = COUNTRY_PHONE_CODES.find((c) => dial && row.phone?.startsWith(c.dial));
      if (match) {
        setPhoneCountry(match);
        setPhoneNumber(row.phone.replace(match.dial, '').trim());
      } else {
        setPhoneNumber(row.phone);
      }
    }
    if (row.email) setEmail(row.email);
    if (row.nationality) setNationality(row.nationality);
    if (row.date_of_birth) setDateOfBirth(isoDateToFormDisplay(row.date_of_birth));
    if (row.gender === 'male' || row.gender === 'female') setGender(row.gender);
    if (row.address) setAddress(row.address);
    if (row.check_in_at) setCheckInDate(isoDateToFormDisplay(row.check_in_at));
    if (row.check_out_at) setCheckOutDate(isoDateToFormDisplay(row.check_out_at));
    if (row.room_type) setRoomType(row.room_type);
    if (typeof row.adults === 'number') setAdults(row.adults);
    if (typeof row.children === 'number') setChildren(row.children);
    const fam = (row as GuestContractPrefill & { family_member_tcs?: unknown }).family_member_tcs;
    if (Array.isArray(fam) && fam.length > 0) {
      const parsed = fam
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const o = item as { full_name?: unknown; tc?: unknown };
          return {
            full_name: typeof o.full_name === 'string' ? o.full_name : '',
            tc: typeof o.tc === 'string' ? o.tc.replace(/\D/g, '').slice(0, 11) : '',
          };
        })
        .filter((r): r is FamilyMemberTcRow => !!r && (r.full_name.length > 0 || r.tc.length > 0));
      if (parsed.length > 0) setFamilyMemberTcs(parsed);
    }
  }, []);

  const fetchContract = useCallback(async (lng: string) => {
    setLoadingContract(true);
    const { data } = await supabase
      .from('contract_templates')
      .select('content')
      .eq('lang', lng)
      .eq('version', 2)
      .eq('is_active', true)
      .maybeSingle();
    let content = data?.content?.trim() ?? '';
    if (!content) {
      const { data: fallback } = await supabase
        .from('contract_templates')
        .select('content')
        .eq('lang', lng)
        .eq('is_active', true)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      content = fallback?.content?.trim() ?? '';
    }
    if (!content && lng !== 'tr') {
      if (translatedCache.current[lng]) {
        setContractContent(translatedCache.current[lng]);
        setLoadingContract(false);
        setTranslating(false);
        return;
      }
      setTranslating(true);
      try {
        const { data: trData } = await supabase
          .from('contract_templates')
          .select('content')
          .eq('lang', 'tr')
          .eq('version', 2)
          .eq('is_active', true)
          .maybeSingle();
        const trContent = trData?.content?.trim() ?? '';
        if (trContent) {
          const { data: fnData, error: fnError } = await supabase.functions.invoke('translate-contract', {
            body: { sourceTitle: 'Konaklama Sözleşmesi ve Otel Kuralları', sourceContent: trContent },
          });
          if (!fnError && fnData) {
            const translations = (fnData as { translations?: Record<string, { content: string }> })?.translations;
            const translated = translations?.[lng]?.content?.trim();
            if (translated) {
              translatedCache.current[lng] = translated;
              content = translated;
            }
          }
        }
        if (!content) {
          const { data: trFallback } = await supabase
            .from('contract_templates')
            .select('content')
            .eq('lang', 'tr')
            .eq('is_active', true)
            .order('version', { ascending: false })
            .limit(1)
            .maybeSingle();
          content = trFallback?.content ?? '';
        }
      } catch (_) {}
      setTranslating(false);
    }
    setContractContent(content);
    setLoadingContract(false);
  }, []);

  useEffect(() => {
    fetchContract(contractLang);
  }, [contractLang, fetchContract]);

  useEffect(() => {
    const next = FORM_STRINGS[contractLang as ContractFormLang]?.roomTypes?.[1];
    if (next) setRoomType(next);
  }, [contractLang]);

  useEffect(() => {
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'contract_form_fields')
      .maybeSingle()
      .then(({ data }) => {
        const v = data?.value as Record<string, boolean> | null;
        if (v && typeof v === 'object') setFormFieldsConfig({ ...DEFAULT_FORM_FIELDS, ...v });
      });
  }, []);

  useEffect(() => {
    if (!inAppMode) return;
    let cancelled = false;
    (async () => {
      if (!token || !inAppGuestId) {
        setInAppBootstrapping(true);
      }
      setInAppBootstrapError(null);
      try {
        const result = await resolveInAppContractContext();
        if (cancelled) return;
        if (!result.ok) {
          setInAppBootstrapError(result.message);
          return;
        }
        if (result.prefill) applyGuestPrefill(result.prefill);
        setQR(result.ctx.token, result.ctx.roomId, result.ctx.roomNumber);
        if (result.ctx.guestId) setGuestId(result.ctx.guestId);
      } catch (e) {
        if (!cancelled) {
          setInAppBootstrapError((e as Error)?.message ?? t('error'));
        }
      } finally {
        if (!cancelled) setInAppBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inAppMode, inAppGuestId, token, applyGuestPrefill, setQR, setGuestId, t]);

  useEffect(() => {
    if (token) {
      supabase
        .from('room_qr_codes')
        .select('room_id, rooms(room_number)')
        .eq('token', token)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            const r = data as { room_id?: string; rooms?: { room_number?: string } };
            setQR(token, r.room_id ?? '', r.rooms?.room_number ?? '');
          }
        });
    }
  }, [token, setQR]);

  // Web: /sozlesme → /guest/sign-one (onay sonrası /guest/success adresine dokunma)
  useEffect(() => {
    if (submittedRef.current) return;
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !token) return;
    const path = window.location.pathname || '';
    if (path.includes('/guest/sign-one') || path.includes('/guest/success')) return;
    const q = new URLSearchParams();
    q.set('t', token);
    if (contractLang) q.set('l', contractLang);
    window.history.replaceState(null, '', `/guest/sign-one?${q.toString()}`);
  }, [token, contractLang]);

  const formStrings = FORM_STRINGS[(contractLang as ContractFormLang) in FORM_STRINGS ? (contractLang as ContractFormLang) : 'tr'] ?? FORM_STRINGS.tr;
  const idTypeLabels = { tc: formStrings.idTypeTC, passport: formStrings.idTypePassport, other: formStrings.idTypeOther };
  const genderLabels = { male: formStrings.male, female: formStrings.female };
  const fullPhone = `${phoneCountry.dial} ${phoneNumber.trim()}`.trim();
  const signerSummary = [
    formFieldsConfig.full_name && fullName && `${formStrings.fullName.replace(' *', '')}: ${fullName}`,
    formFieldsConfig.id_number && idNumber && `${formStrings.idNumber}: ${idNumber}`,
    formFieldsConfig.phone && fullPhone && `${formStrings.phone.replace(' *', '')}: ${fullPhone}`,
    formFieldsConfig.email && email && `${formStrings.email}: ${email}`,
    formFieldsConfig.nationality && nationality && `${formStrings.nationality}: ${nationality}`,
    formFieldsConfig.date_of_birth && dateOfBirth && `${formStrings.dateOfBirth}: ${dateOfBirth}`,
    formFieldsConfig.gender && gender && `${formStrings.gender}: ${genderLabels[gender]}`,
    formFieldsConfig.address && address && `${formStrings.address}: ${address}`,
    formFieldsConfig.check_in_date && checkInDate && `${formStrings.checkInDate}: ${checkInDate}`,
    formFieldsConfig.check_out_date && checkOutDate && `${formStrings.checkOutDate}: ${checkOutDate}`,
    formFieldsConfig.room_type && roomType && `${formStrings.roomType}: ${roomType}`,
    formFieldsConfig.adults && `${formStrings.adults}: ${adults}`,
    formFieldsConfig.children && `${formStrings.children}: ${children}`,
    formFieldsConfig.family_member_tcs &&
      normalizeFamilyMemberTcs(familyMemberTcs).length > 0 &&
      `${formStrings.familyMemberTcs}: ${normalizeFamilyMemberTcs(familyMemberTcs)
        .map((r) => `${r.full_name || '—'} (${r.tc || '—'})`)
        .join(', ')}`,
  ].filter(Boolean);

  const pickAvatar = async () => {
    const granted = await ensureMediaLibraryPermission({
      title: t('galleryPermission'),
      message: t('galleryPermissionMessage'),
      settingsMessage: t('guestGalleryPermSettings'),
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
      setAvatarUri(result.assets[0].uri);
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('guestPhotoSelectFailed'));
    }
  };

  const submit = async () => {
    if (saving || submittedRef.current) return;
    if (formFieldsConfig.full_name && !fullName.trim()) {
      showGuestFlowAlert(t('error'), formStrings.errorFullName);
      return;
    }
    if (formFieldsConfig.phone && !phoneNumber.trim()) {
      showGuestFlowAlert(t('error'), formStrings.errorPhone);
      return;
    }
    setSaving(true);
    try {
      let activeGuestId = inAppGuestId;
      let activeToken = token.trim();
      let activeRoomId = roomId || null;
      if (inAppMode) {
        const ctx = await resolveInAppContractContext();
        if (!ctx.ok) throw new Error(ctx.message);
        activeGuestId = ctx.ctx.guestId;
        activeToken = ctx.ctx.token;
        activeRoomId = ctx.ctx.roomId || null;
        setQR(ctx.ctx.token, ctx.ctx.roomId, ctx.ctx.roomNumber);
        setGuestId(ctx.ctx.guestId);
      }

      const { data: template } = await supabase
        .from('contract_templates')
        .select('id')
        .eq('lang', contractLang as string)
        .eq('version', 2)
        .eq('is_active', true)
        .maybeSingle();

      const guestPayload = {
        full_name: (formFieldsConfig.full_name ? fullName.trim() : '') || t('guestDefaultGuestName'),
        id_number: formFieldsConfig.id_number ? idNumber.trim() || null : null,
        id_type: formFieldsConfig.id_type ? idType : 'tc',
        phone: formFieldsConfig.phone ? fullPhone || null : null,
        phone_country_code: phoneCountry.dial,
        email: formFieldsConfig.email ? email.trim() || null : null,
        nationality: formFieldsConfig.nationality ? nationality.trim() || null : null,
        contract_lang: contractLang,
        contract_template_id: template?.id ?? null,
        date_of_birth: formFieldsConfig.date_of_birth ? toISODate(dateOfBirth) || null : null,
        gender: formFieldsConfig.gender ? gender : null,
        address: formFieldsConfig.address ? address.trim() || null : null,
        room_id: activeRoomId,
        check_in_at: formFieldsConfig.check_in_date ? parseDDMMYYYY(checkInDate) || null : null,
        check_out_at: formFieldsConfig.check_out_date ? parseDDMMYYYY(checkOutDate) || null : null,
        room_type: formFieldsConfig.room_type ? roomType : null,
        adults: formFieldsConfig.adults ? adults ?? 1 : 0,
        children: formFieldsConfig.children ? children ?? 0 : 0,
        family_member_tcs: formFieldsConfig.family_member_tcs
          ? normalizeFamilyMemberTcs(familyMemberTcs)
          : [],
        status: 'pending' as const,
      };

      let guestRecordId: string | null = activeGuestId;

      if (activeGuestId) {
        const { data: updated, error: guestErr } = await supabase
          .from('guests')
          .update(guestPayload)
          .eq('id', activeGuestId)
          .select('id')
          .maybeSingle();
        if (guestErr) throw guestErr;
        if (!updated?.id) {
          throw new Error(
            inAppMode ? t('guestInAppContractSessionFailed') : t('guestRegistrationCreateFailed')
          );
        }
        guestRecordId = updated.id;
      } else {
        const { data: guest, error: guestErr } = await supabase
          .from('guests')
          .insert(guestPayload)
          .select('id')
          .single();

        if (guestErr) throw guestErr;
        guestRecordId = guest?.id ?? null;
      }

      if (!guestRecordId) {
        throw new Error(t('guestRegistrationCreateFailed'));
      }

      const acceptanceToken = activeToken || `app:${guestRecordId}`;
      if (!acceptanceToken) {
        throw new Error(inAppMode ? t('guestInAppContractSessionFailed') : t('guestInvalidQrToken'));
      }

      const allowedLangs = ['tr', 'en', 'ar', 'de', 'fr', 'ru', 'es'] as const;
      const langForDb = allowedLangs.includes(contractLang as (typeof allowedLangs)[number])
        ? contractLang
        : 'tr';

      const { error: accErr } = await supabase.from('contract_acceptances').insert({
        token: acceptanceToken,
        room_id: activeRoomId,
        contract_lang: langForDb,
        contract_version: 2,
        contract_template_id: template?.id ?? null,
        source: Platform.OS === 'web' ? 'web' : 'app',
        guest_id: guestRecordId,
      });
      if (accErr) throw accErr;

      setGuestId(guestRecordId);
      const signer = (formFieldsConfig.full_name ? fullName.trim() : '') || t('guestDefaultGuestName');
      void notifyAdmins({
        title: 'Yeni sözleşme onayı',
        body: `${signer} sözleşmeyi onayladı. Sözleşme onayları ekranından kontrol edin.`,
        data: {
          url: '/admin/contracts/acceptances',
          notificationType: ADMIN_TYPES.contract_acceptance_new,
        },
      }).catch(() => {});

      if (avatarUri) {
        void uploadGuestAvatarInBackground(guestRecordId, avatarUri);
      }
      void supabase.rpc('get_guest_app_token', { p_guest_id: guestRecordId }).then(({ data: appToken }) => {
        if (appToken) void setAppToken(appToken);
      });

      submittedRef.current = true;
      setStoreContractLang(contractLang);
      setSignedFormLines(signerSummary as string[]);
      setStep('done');
      setSaving(false);

      if (inAppMode) {
        if (router.canGoBack()) router.back();
        else safeRouterReplace(router, '/customer/(tabs)/profile');
      } else {
        safeRouterReplace(router, '/guest/success');
      }
      if (Platform.OS === 'web' && typeof window !== 'undefined' && !inAppMode) {
        requestAnimationFrame(() => {
          if (window.location.pathname.includes('/guest/success')) return;
          window.history.replaceState(null, '', '/guest/success');
        });
      }
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? t('guestRegistrationCreateFailed');
      showGuestFlowAlert(t('error'), msg);
      setSaving(false);
    }
  };

  const renderPickerModal = (title: string, items: CountryCode[] | string[], onSelect: (item: CountryCode | string) => void, onClose: () => void) => (
    <Modal visible={title.length > 0} transparent animationType="slide">
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.modalDrawer, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.modalTitle}>{title}</Text>
          <FlatList
            data={items as CountryCode[]}
            keyExtractor={(item) => (typeof item === 'string' ? item : `${item.dial}-${item.code}`)}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.modalRow}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                <Text style={styles.modalRowText}>
                  {typeof item === 'string' ? item : `${item.dial} ${item.name}`}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );

  const headerH = 56 + insets.top;
  const isWebContract = Platform.OS === 'web';

  const langPicker = (
    <View style={[styles.langWrap, isWebContract && styles.langWrapWeb]}>
      {CONTRACT_LANGS.map(({ code, label }) => (
        <TouchableOpacity
          key={code}
          style={[styles.langChip, contractLang === code && styles.langChipActive]}
          onPress={() => {
            setContractLang(code);
            fetchContract(code);
          }}
          disabled={loadingContract || translating}
        >
          <Text style={[styles.langChipText, contractLang === code && styles.langChipTextActive]}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const submitButton = (
    <TouchableOpacity
      style={[styles.submitBtn, isWebContract && styles.submitBtnWeb, saving && styles.submitBtnDisabled]}
      onPress={() => {
        void submit();
      }}
      disabled={saving}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      {saving ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <Text style={styles.submitBtnText}>{formStrings.acceptButton}</Text>
      )}
    </TouchableOpacity>
  );

  const pageIntro = (
    <View style={[styles.pageTitleWrap, isWebContract && styles.pageTitleWrapWeb]}>
      <Text style={[styles.pageTitle, isWebContract && styles.pageTitleWeb]}>{formStrings.pageTitle}</Text>
      <Text style={[styles.pageSubtitle, isWebContract && styles.pageSubtitleWeb]}>{formStrings.pageSubtitle}</Text>
      {!isWebContract ? langPicker : null}
    </View>
  );

  const webHeader = (
    <>
      {pageIntro}
      {langPicker}
    </>
  );

  if (missingWebEnv) {
    return (
      <View style={[styles.envContainer, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.envTitle}>Yapılandırma eksik</Text>
        <Text style={styles.envText}>
          Sözleşme sayfası için Vercel ortam değişkenleri tanımlanmalı.{'\n\n'}
          EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_ANON_KEY ekleyin.{'\n\n'}
          Detay: docs/VERCEL_ENV.md
        </Text>
      </View>
    );
  }

  if (inAppMode && inAppBootstrapError) {
    return (
      <View style={[styles.envContainer, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.envTitle}>{t('error')}</Text>
        <Text style={[styles.envText, { marginBottom: 20 }]}>{inAppBootstrapError}</Text>
        <TouchableOpacity
          style={styles.submitBtn}
          onPress={() => (router.canGoBack() ? router.back() : safeRouterReplace(router, '/customer/(tabs)/profile'))}
          activeOpacity={0.85}
        >
          <Text style={styles.submitBtnText}>{t('back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (inAppMode && inAppBootstrapping) {
    return (
      <View style={[styles.envContainer, { paddingTop: insets.top + 24 }]}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={[styles.pageSubtitle, { textAlign: 'center', marginTop: 16 }]}>{t('guestInAppContractLoading')}</Text>
      </View>
    );
  }

  const modals = (
    <>
      {showCountryPicker &&
        renderPickerModal(
          t('guestCountryDialCodeTitle'),
          COUNTRY_PHONE_CODES,
          (item) => setPhoneCountry(item as CountryCode),
          () => setShowCountryPicker(false)
        )}
      {showNationalityPicker && (
        <Modal visible transparent animationType="slide">
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowNationalityPicker(false)}>
            <View style={[styles.modalDrawer, { paddingBottom: insets.bottom + 16 }]}>
              <Text style={styles.modalTitle}>{formStrings.nationality}</Text>
              <FlatList
                data={COUNTRY_PHONE_CODES.map((c) => c.name)}
                keyExtractor={(name) => name}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.modalRow}
                    onPress={() => {
                      setNationality(item);
                      setShowNationalityPicker(false);
                    }}
                  >
                    <Text style={styles.modalRowText}>{item}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </>
  );

  const formContent = (
    <>
        <View style={styles.avatarSection}>
          <TouchableOpacity
            style={styles.avatarWrap}
            onPress={saving ? undefined : pickAvatar}
            activeOpacity={0.9}
          >
            {avatarUri ? (
              <CachedImage uri={avatarUri} style={styles.avatarImage} contentFit="cover" />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarPlaceholderText}>+</Text>
                <Text style={styles.avatarHint}>Profil fotoğrafı</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {!isWebContract ? langPicker : null}

        {/* 1. Kişisel bilgiler */}
        {(formFieldsConfig.full_name || formFieldsConfig.id_type || formFieldsConfig.id_number || formFieldsConfig.phone || formFieldsConfig.email || formFieldsConfig.nationality || formFieldsConfig.date_of_birth || formFieldsConfig.gender || formFieldsConfig.address) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{formStrings.sectionPersonal}</Text>
          <View style={styles.card}>
            {formFieldsConfig.full_name && (
              <>
                <Text style={styles.label}>{formStrings.fullName}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={formStrings.placeholderFullName}
                  placeholderTextColor={COLORS.textSecondary}
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                />
              </>
            )}
            {formFieldsConfig.id_type && (
              <>
                <Text style={styles.label}>{formStrings.idType}</Text>
                <View style={styles.chipRow}>
                  {ID_TYPE_VALUES.map((value) => (
                    <TouchableOpacity
                      key={value}
                      style={[styles.chip, idType === value && styles.chipActive]}
                      onPress={() => setIdType(value)}
                    >
                      <Text style={[styles.chipText, idType === value && styles.chipTextActive]}>{idTypeLabels[value]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            {formFieldsConfig.id_number && (
              <>
                <Text style={styles.label}>{formStrings.idNumber}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={formStrings.placeholderIdNumber}
                  placeholderTextColor={COLORS.textSecondary}
                  value={idNumber}
                  onChangeText={setIdNumber}
                  keyboardType="default"
                />
              </>
            )}
            {formFieldsConfig.phone && (
              <>
                <Text style={styles.label}>{formStrings.phone}</Text>
                <View style={styles.phoneRow}>
                  <TouchableOpacity style={styles.countryBtn} onPress={() => setShowCountryPicker(true)}>
                    <Text style={styles.countryBtnText}>{phoneCountry.dial}</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.input, styles.phoneInput]}
                    placeholder={formStrings.placeholderPhone}
                    placeholderTextColor={COLORS.textSecondary}
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    keyboardType="phone-pad"
                  />
                </View>
              </>
            )}
            {formFieldsConfig.email && (
              <>
                <Text style={styles.label}>{formStrings.email}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={formStrings.placeholderEmail}
                  placeholderTextColor={COLORS.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </>
            )}
            {formFieldsConfig.nationality && (
              <>
                <Text style={styles.label}>{formStrings.nationality}</Text>
                <TouchableOpacity style={styles.input} onPress={() => setShowNationalityPicker(true)}>
                  <Text style={styles.inputValue}>{nationality || formStrings.selectNationality}</Text>
                </TouchableOpacity>
              </>
            )}
            {(formFieldsConfig.date_of_birth || formFieldsConfig.gender) && (
              <View style={styles.row}>
                {formFieldsConfig.date_of_birth && (
                  <View style={styles.half}>
                    <Text style={styles.label}>{formStrings.dateOfBirth}</Text>
                    <TextInput
                      style={styles.input}
                      placeholder={formStrings.placeholderDate}
                      placeholderTextColor={COLORS.textSecondary}
                      value={dateOfBirth}
                      onChangeText={setDateOfBirth}
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                )}
                {formFieldsConfig.gender && (
                  <View style={styles.half}>
                    <Text style={styles.label}>{formStrings.gender}</Text>
                    <View style={styles.chipRow}>
                      {GENDER_VALUES.map((value) => (
                        <TouchableOpacity
                          key={value}
                          style={[styles.chip, gender === value && styles.chipActive]}
                          onPress={() => setGender(value)}
                        >
                          <Text style={[styles.chipText, gender === value && styles.chipTextActive]}>{genderLabels[value]}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}
            {formFieldsConfig.address && (
              <>
                <Text style={styles.label}>{formStrings.address}</Text>
                <TextInput
                  style={[styles.input, styles.inputMultiline]}
                  placeholder={formStrings.placeholderAddress}
                  placeholderTextColor={COLORS.textSecondary}
                  value={address}
                  onChangeText={setAddress}
                  multiline
                />
              </>
            )}
          </View>
        </View>
        )}

        {/* 2. Konaklama bilgileri */}
        {(formFieldsConfig.check_in_date || formFieldsConfig.check_out_date || formFieldsConfig.room_type || formFieldsConfig.adults || formFieldsConfig.children) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{formStrings.sectionAccommodation}</Text>
          <View style={styles.card}>
            {(formFieldsConfig.check_in_date || formFieldsConfig.check_out_date) && (
              <View style={styles.row}>
                {formFieldsConfig.check_in_date && (
                  <View style={styles.half}>
                    <Text style={styles.label}>{formStrings.checkInDate}</Text>
                    <TextInput
                      style={styles.input}
                      placeholder={formStrings.placeholderDate}
                      placeholderTextColor={COLORS.textSecondary}
                      value={checkInDate}
                      onChangeText={setCheckInDate}
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                )}
                {formFieldsConfig.check_out_date && (
                  <View style={styles.half}>
                    <Text style={styles.label}>{formStrings.checkOutDate}</Text>
                    <TextInput
                      style={styles.input}
                      placeholder={formStrings.placeholderDate}
                      placeholderTextColor={COLORS.textSecondary}
                      value={checkOutDate}
                      onChangeText={setCheckOutDate}
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                )}
              </View>
            )}
            {formFieldsConfig.room_type && (
              <>
                <Text style={styles.label}>{formStrings.roomType}</Text>
                <View style={styles.chipRowWrap}>
                  {(formStrings.roomTypes.length ? formStrings.roomTypes : FORM_STRINGS.tr.roomTypes).map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.chipSmall, roomType === r && styles.chipActive]}
                      onPress={() => setRoomType(r)}
                    >
                      <Text style={[styles.chipText, roomType === r && styles.chipTextActive]}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            {(formFieldsConfig.adults || formFieldsConfig.children) && (
              <View style={styles.row}>
                {formFieldsConfig.adults && (
                  <View style={styles.half}>
                    <Text style={styles.label}>{formStrings.adults}</Text>
                    <View style={styles.stepperRow}>
                      <TouchableOpacity style={styles.stepperBtn} onPress={() => setAdults((a) => Math.max(0, a - 1))}>
                        <Text style={styles.stepperText}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.stepperValue}>{adults}</Text>
                      <TouchableOpacity style={styles.stepperBtn} onPress={() => setAdults((a) => a + 1)}>
                        <Text style={styles.stepperText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                {formFieldsConfig.children && (
                  <View style={styles.half}>
                    <Text style={styles.label}>{formStrings.children}</Text>
                    <View style={styles.stepperRow}>
                      <TouchableOpacity style={styles.stepperBtn} onPress={() => setChildren((c) => Math.max(0, c - 1))}>
                        <Text style={styles.stepperText}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.stepperValue}>{children}</Text>
                      <TouchableOpacity style={styles.stepperBtn} onPress={() => setChildren((c) => c + 1)}>
                        <Text style={styles.stepperText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
        )}

        {/* Aile fertleri T.C. — kimlik fotokopisi yerine */}
        {formFieldsConfig.family_member_tcs && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{formStrings.sectionFamilyTcs}</Text>
            <View style={styles.card}>
              <Text style={styles.familyHint}>{formStrings.familyMemberTcsHint}</Text>
              {familyMemberTcs.map((row, index) => (
                <View key={`fam-${index}`} style={styles.familyRow}>
                  <View style={styles.familyRowHeader}>
                    <Text style={styles.familyRowIndex}>{index + 1}.</Text>
                    {familyMemberTcs.length > 1 ? (
                      <TouchableOpacity
                        onPress={() =>
                          setFamilyMemberTcs((prev) => prev.filter((_, i) => i !== index))
                        }
                        hitSlop={8}
                      >
                        <Text style={styles.familyRemove}>{formStrings.familyMemberRemove}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <Text style={styles.label}>{formStrings.familyMemberName}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={formStrings.placeholderFamilyName}
                    placeholderTextColor={COLORS.textSecondary}
                    value={row.full_name}
                    onChangeText={(text) =>
                      setFamilyMemberTcs((prev) =>
                        prev.map((r, i) => (i === index ? { ...r, full_name: text } : r))
                      )
                    }
                    autoCapitalize="words"
                  />
                  <Text style={styles.label}>{formStrings.familyMemberTc}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={formStrings.placeholderFamilyTc}
                    placeholderTextColor={COLORS.textSecondary}
                    value={row.tc}
                    onChangeText={(text) =>
                      setFamilyMemberTcs((prev) =>
                        prev.map((r, i) =>
                          i === index ? { ...r, tc: text.replace(/\D/g, '').slice(0, 11) } : r
                        )
                      )
                    }
                    keyboardType="number-pad"
                    maxLength={11}
                  />
                </View>
              ))}
              <TouchableOpacity
                style={styles.familyAddBtn}
                onPress={() => setFamilyMemberTcs((prev) => [...prev, emptyFamilyRow()])}
                activeOpacity={0.85}
              >
                <Text style={styles.familyAddBtnText}>+ {formStrings.familyMemberAdd}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 3. Sözleşme metni */}
        <View style={[styles.section, isWebContract && styles.sectionWeb]}>
          <Text style={[styles.sectionTitle, isWebContract && styles.sectionTitleWeb]}>{formStrings.sectionContract}</Text>
          {loadingContract || translating ? (
            <ActivityIndicator size="small" color={COLORS.accent} style={styles.loader} />
          ) : (
            <View style={[styles.contractBody, isWebContract && styles.contractCardWeb]}>
              <Text style={[styles.contractText, isWebContract && styles.contractTextWeb]}>
                {contractContent || formStrings.loadingContract}
              </Text>
            </View>
          )}
        </View>

        {/* 4. Onay özeti */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{formStrings.sectionSummary}</Text>
          <View style={styles.signerCard}>
            {signerSummary.length > 0 ? (
              signerSummary.map((line, i) => (
                <Text key={i} style={styles.signerLine}>
                  {line}
                </Text>
              ))
            ) : (
              <Text style={styles.signerPlaceholder}>{formStrings.signerPlaceholder}</Text>
            )}
          </View>
        </View>

    </>
  );

  return (
    <>
      {isWebContract ? (
        <GuestSignOneWebShell header={webHeader} footer={submitButton}>
          {formContent}
        </GuestSignOneWebShell>
      ) : (
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={headerH}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            scrollEventThrottle={16}
            nestedScrollEnabled={false}
          >
            {pageIntro}
            {formContent}
            {submitButton}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
      {modals}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  envContainer: { flex: 1, backgroundColor: COLORS.bg, padding: 24 },
  envTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, marginBottom: 12, textAlign: 'center' },
  envText: { fontSize: 15, color: COLORS.textSecondary, lineHeight: 24, textAlign: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },
  pageTitleWrap: { alignItems: 'center', marginBottom: 24 },
  pageTitleWrapWeb: { marginBottom: 0 },
  pageTitle: { fontSize: 26, fontWeight: '700', color: COLORS.text, marginBottom: 6, textAlign: 'center' },
  pageTitleWeb: { fontSize: 28, fontWeight: '700', letterSpacing: -0.3 },
  pageSubtitle: { fontSize: 15, color: COLORS.textSecondary, lineHeight: 22, textAlign: 'center' },
  pageSubtitleWeb: { fontSize: 16, lineHeight: 24, maxWidth: 520 },
  langWrapWeb: { marginTop: 14, marginBottom: 0 },
  avatarSection: { alignItems: 'center', marginBottom: 20 },
  avatarWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: 'hidden',
    backgroundColor: COLORS.inputBg,
    borderWidth: 2,
    borderColor: COLORS.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: { width: 96, height: 96 },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  avatarPlaceholderText: { fontSize: 32, color: COLORS.accent, fontWeight: '300' },
  avatarHint: { fontSize: 11, color: COLORS.textSecondary, marginTop: 4 },
  section: { marginBottom: 28 },
  sectionWeb: { marginBottom: 32 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.label,
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  sectionTitleWeb: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, color: COLORS.textSecondary },
  sectionHint: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 12 },
  langWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16, justifyContent: 'center' },
  langChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    marginRight: 8,
  },
  langChipActive: { backgroundColor: COLORS.accentLight, borderColor: COLORS.accent },
  langChipText: { color: COLORS.text, fontSize: 13 },
  langChipTextActive: { color: COLORS.accent, fontWeight: '600' },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  label: { fontSize: 14, fontWeight: '500', color: COLORS.label, marginBottom: 8 },
  input: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    padding: 14,
    color: COLORS.text,
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
  },
  inputValue: { color: COLORS.text, fontSize: 16 },
  inputMultiline: { minHeight: 88 },
  phoneRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  countryBtn: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: 'center',
    minWidth: 76,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
  },
  countryBtnText: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  phoneInput: { flex: 1, marginBottom: 0 },
  chipRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
  },
  chipSmall: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
  },
  chipActive: { backgroundColor: COLORS.accentLight, borderColor: COLORS.accent },
  chipText: { color: COLORS.text, fontSize: 14 },
  chipTextActive: { color: COLORS.accent, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 16 },
  half: { flex: 1 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperText: { color: COLORS.text, fontSize: 20, fontWeight: '600' },
  stepperValue: { color: COLORS.text, fontSize: 18, fontWeight: '600', minWidth: 32, textAlign: 'center' },
  familyHint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
    backgroundColor: COLORS.accentLight,
    padding: 12,
    borderRadius: 10,
  },
  familyRow: {
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.divider,
  },
  familyRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  familyRowIndex: { fontSize: 14, fontWeight: '700', color: COLORS.label },
  familyRemove: { fontSize: 13, fontWeight: '600', color: '#dc2626' },
  familyAddBtn: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderStyle: 'dashed',
    alignItems: 'center',
    backgroundColor: COLORS.accentLight,
  },
  familyAddBtnText: { color: COLORS.accent, fontWeight: '700', fontSize: 14 },
  contractBody: { paddingVertical: 8 },
  contractCardWeb: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    paddingHorizontal: 28,
    paddingVertical: 28,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
  },
  contractText: { color: COLORS.text, fontSize: 16, lineHeight: 26 },
  contractTextWeb: { fontSize: 17, lineHeight: 30, letterSpacing: 0.15 },
  loader: { marginVertical: 24 },
  signerCard: {
    backgroundColor: COLORS.accentLight,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  signerLine: { color: COLORS.text, fontSize: 14, marginBottom: 6, lineHeight: 20 },
  signerPlaceholder: { color: COLORS.textSecondary, fontSize: 14 },
  submitBtn: {
    backgroundColor: COLORS.accent,
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  submitBtnWeb: {
    marginBottom: 0,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
    paddingVertical: 16,
    borderRadius: 12,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalDrawer: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 16 },
  modalRow: { paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  modalRowText: { color: COLORS.text, fontSize: 16 },
});
