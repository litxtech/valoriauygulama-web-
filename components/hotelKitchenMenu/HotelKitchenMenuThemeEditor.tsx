import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
  Keyboard,
  KeyboardAvoidingView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { useLayoutEffect } from 'react';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import { StaffStackBackButton } from '@/lib/staffStackBack';
import { useAuthStore } from '@/stores/authStore';
import { canManageHotelKitchenMenu } from '@/lib/staffPermissions';
import { supabase } from '@/lib/supabase';
import {
  kitchenMenuThemeColorErrors,
  normalizeKitchenMenuHexColor,
  parseKitchenMenuPublicTheme,
  resolveKitchenMenuTheme,
  type KitchenMenuLayoutMode,
  type KitchenMenuPublicTheme,
} from '@/lib/kitchenMenuTheme';
import {
  DEFAULT_KITCHEN_MENU_CHECKOUT_FIELDS,
  type CheckoutFieldMode,
} from '@/lib/kitchenMenuCheckoutFields';
import {
  newKitchenMenuPromoVideoId,
  type KitchenMenuPromoVideo,
} from '@/lib/kitchenMenuPromoVideo';
import {
  pickAndUploadKitchenMenuPromoVideo,
  pickKitchenMenuPromoPoster,
} from '@/lib/hotelKitchenMenuPromoUpload';
import { fetchOrganizationSlugById } from '@/lib/publicKitchenMenu';
import { persistKitchenMenuPublicTheme } from '@/lib/kitchenMenuPromoPersist';
import { buildPublicKitchenMenuUrl } from '@/lib/appPublicUrl';
import { KITCHEN_MENU_THEME_PRESETS } from '@/lib/kitchenMenuThemePresets';
import { LinearGradient } from 'expo-linear-gradient';

const CHECKOUT_FIELD_KEYS = ['name', 'email', 'hotelName', 'room', 'table', 'location'] as const;

const CHECKOUT_MODES: { value: CheckoutFieldMode; labelKey: string }[] = [
  { value: 'required', labelKey: 'hotelKitchenMenuCheckoutRequired' },
  { value: 'optional', labelKey: 'hotelKitchenMenuCheckoutOptional' },
  { value: 'hidden', labelKey: 'hotelKitchenMenuCheckoutHidden' },
];
const LAYOUTS: { value: KitchenMenuLayoutMode; label: string }[] = [
  { value: 'classic', label: 'Klasik' },
  { value: 'featured', label: 'Öne çıkan görseller' },
  { value: 'compact', label: 'Kompakt liste' },
];

type Props = {
  backFallback?: string;
};

export function HotelKitchenMenuThemeEditor({ backFallback = '/staff/fnb-hub' }: Props) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const heroTitleRef = useRef<View>(null);
  const heroSubRef = useRef<View>(null);
  const primaryColorRef = useRef<View>(null);
  const navyColorRef = useRef<View>(null);
  const heroImageRef = useRef<View>(null);
  const staff = useAuthStore((s) => s.staff);
  const canUse = canManageHotelKitchenMenu(staff);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [form, setForm] = useState<KitchenMenuPublicTheme>({
    layout: 'featured',
    checkoutFields: { ...DEFAULT_KITCHEN_MENU_CHECKOUT_FIELDS },
  });
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [promoVideoUploadingId, setPromoVideoUploadingId] = useState<string | null>(null);
  const [promoPosterUploadingId, setPromoPosterUploadingId] = useState<string | null>(null);
  const [promoUploadStep, setPromoUploadStep] = useState('');

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const scrollFieldIntoView = (target: React.RefObject<View | null>) => {
    const content = contentRef.current;
    const field = target.current;
    if (!content || !field) return;
    requestAnimationFrame(() => {
      field.measureLayout(
        content,
        (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 96), animated: true }),
        () => {}
      );
    });
  };

  const contentPadBottom = Math.max(insets.bottom, 16) + 48 + (Platform.OS === 'android' ? keyboardHeight : 0);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('hotelKitchenMenuThemeTitle'),
      headerLeft: () => (
        <StaffStackBackButton accessibilityLabel={t('back')} fallback={backFallback} />
      ),
    });
  }, [navigation, t, backFallback]);

  const preview = useMemo(
    () =>
      resolveKitchenMenuTheme(form, {
        heroTitle: t('hotelKitchenMenuHeroTitle'),
        heroSubtitle: t('publicKitchenMenuHeroSub'),
      }),
    [form, t]
  );

  const load = useCallback(async () => {
    if (!staff?.organization_id) return;
    const [{ data, error }, slug] = await Promise.all([
      supabase
        .from('organizations')
        .select('kitchen_menu_public_theme')
        .eq('id', staff.organization_id)
        .maybeSingle(),
      fetchOrganizationSlugById(staff.organization_id),
    ]);
    if (error?.message?.includes('kitchen_menu_public_theme')) {
      setMigrationMissing(true);
      setForm({ layout: 'classic' });
    } else {
      setMigrationMissing(false);
      setForm(parseKitchenMenuPublicTheme((data as { kitchen_menu_public_theme?: unknown } | null)?.kitchen_menu_public_theme));
    }
    setPublicUrl(slug ? buildPublicKitchenMenuUrl(slug) : null);
    setOrgSlug(slug);
  }, [staff?.organization_id]);

  useEffect(() => {
    if (!canUse) {
      setLoading(false);
      return;
    }
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [canUse, load]);

  const colorErrors = useMemo(() => kitchenMenuThemeColorErrors(form), [form]);
  const formRef = useRef(form);
  formRef.current = form;

  const persistTheme = useCallback(
    async (nextForm: KitchenMenuPublicTheme, opts?: { silent?: boolean }) => {
      if (!staff?.organization_id) return;
      const validationErrors = kitchenMenuThemeColorErrors(nextForm);
      if (validationErrors.length > 0) {
        if (!opts?.silent) Alert.alert(t('error'), validationErrors.join('\n'));
        throw new Error(validationErrors.join('\n'));
      }
      try {
        await persistKitchenMenuPublicTheme({
          organizationId: staff.organization_id,
          orgSlug,
          theme: nextForm,
        });
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes('update_kitchen_menu_public_theme') || msg.includes('kitchen_menu_public_theme')) {
          throw new Error(
            'Veritabanı güncellemesi gerekli (migration 434). Supabase\'de migration uygulayın veya yöneticinize bildirin.'
          );
        }
        if (msg.includes('otel_mutfak_menu') || msg.includes('yetkiniz yok')) {
          throw new Error('Otel mutfağı menü yetkisi gerekli. Yöneticinizden «otel_mutfak_menu» iznini açmasını isteyin.');
        }
        throw e;
      }
      setMigrationMissing(false);
      setForm(nextForm);
      if (!opts?.silent) Alert.alert(t('success'), t('hotelKitchenMenuThemeSaved'));
    },
    [staff?.organization_id, orgSlug, t]
  );

  const save = async () => {
    if (!staff?.organization_id) return;
    setSaving(true);
    try {
      await persistTheme(formRef.current);
      await load();
    } catch (e) {
      Alert.alert(t('error'), (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const savePromoPatch = useCallback(
    async (patch: (videos: KitchenMenuPromoVideo[]) => KitchenMenuPromoVideo[]) => {
      if (!staff?.organization_id) return;
      const current = formRef.current;
      const nextForm: KitchenMenuPublicTheme = {
        ...current,
        promoVideos: patch(current.promoVideos ?? []),
      };
      setForm(nextForm);
      setSaving(true);
      try {
        await persistTheme(nextForm, { silent: true });
        Alert.alert(t('success'), t('hotelKitchenMenuPromoSavedLive'));
      } catch (e) {
        Alert.alert(t('error'), (e as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [persistTheme, staff?.organization_id, t]
  );

  if (!canUse) {
    return (
      <View style={styles.denied}>
        <Ionicons name="lock-closed-outline" size={28} color={theme.colors.textSecondary} />
        <Text style={styles.deniedTitle}>Erişim yok</Text>
        <Text style={styles.deniedDesc}>Web menü tasarımı için «Otel mutfağı menüsü» yetkisi gerekir.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + headerHeight : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: contentPadBottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <View ref={contentRef} collapsable={false}>
      <Text style={styles.lead}>{t('hotelKitchenMenuThemeLead')}</Text>

      <Text style={styles.label}>{t('hotelKitchenMenuThemePresets')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetScroll}>
        {KITCHEN_MENU_THEME_PRESETS.map((preset) => (
          <TouchableOpacity
            key={preset.id}
            style={styles.presetChip}
            onPress={() => setForm({ ...preset.theme })}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={[preset.theme.navyColor ?? menuUi.navy, preset.theme.primaryColor ?? menuUi.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.presetSwatch}
            />
            <Text style={styles.presetName}>{preset.name}</Text>
            <Text style={styles.presetTag}>{preset.tag}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Text style={styles.presetHint}>{t('hotelKitchenMenuThemePresetHint')}</Text>

      {migrationMissing ? (
        <View style={styles.warnBox}>
          <Ionicons name="warning-outline" size={18} color="#b45309" />
          <Text style={styles.warnText}>
            Tema kaydı için Supabase migration 434 henüz uygulanmamış. Önizleme çalışır; kaydetmek için migration gerekir.
          </Text>
        </View>
      ) : null}

      {publicUrl ? (
        <TouchableOpacity
          style={styles.liveBtn}
          onPress={() => {
            if (Platform.OS === 'web') window.open(publicUrl, '_blank');
            else void Linking.openURL(publicUrl);
          }}
        >
          <Ionicons name="globe" size={20} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={styles.liveBtnTitle}>Canlı menüyü aç</Text>
            <Text style={styles.liveBtnUrl} numberOfLines={1}>
              {publicUrl}
            </Text>
          </View>
          <Ionicons name="open-outline" size={18} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>
      ) : null}

      <LinearGradient colors={[...preview.webHeroGradient]} style={styles.previewHero}>
        <View style={styles.previewLiveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.previewLiveText}>Canlı önizleme</Text>
        </View>
        <Text style={styles.previewHotel}>{t('hotelKitchenMenuThemePreview')}</Text>
        <Text style={styles.previewTitle}>{preview.heroTitle ?? t('hotelKitchenMenuHeroTitle')}</Text>
        <Text style={styles.previewSub}>{preview.heroSubtitle ?? t('publicKitchenMenuHeroSub')}</Text>
        <View style={[styles.previewChip, { backgroundColor: preview.primaryColor }]}>
          <Text style={styles.previewChipText}>{preview.layout}</Text>
        </View>
      </LinearGradient>

      <View ref={heroTitleRef} collapsable={false}>
      <Text style={styles.label}>{t('hotelKitchenMenuThemeHeroTitle')}</Text>
      <TextInput
        style={styles.input}
        value={form.heroTitle ?? ''}
        onChangeText={(v) => setForm((f) => ({ ...f, heroTitle: v }))}
        placeholder={t('hotelKitchenMenuHeroTitle')}
        placeholderTextColor="#94a3b8"
        onFocus={() => scrollFieldIntoView(heroTitleRef)}
      />
      </View>

      <View ref={heroSubRef} collapsable={false}>
      <Text style={styles.label}>{t('hotelKitchenMenuThemeHeroSub')}</Text>
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        value={form.heroSubtitle ?? ''}
        onChangeText={(v) => setForm((f) => ({ ...f, heroSubtitle: v }))}
        placeholder={t('publicKitchenMenuHeroSub')}
        placeholderTextColor="#94a3b8"
        multiline
        onFocus={() => scrollFieldIntoView(heroSubRef)}
      />
      </View>

      <View ref={primaryColorRef} collapsable={false}>
      <Text style={styles.label}>{t('hotelKitchenMenuThemePrimary')}</Text>
      <TextInput
        style={[styles.input, colorErrors.some((e) => e.includes('Vurgu')) && styles.inputInvalid]}
        value={form.primaryColor ?? ''}
        onChangeText={(v) => setForm((f) => ({ ...f, primaryColor: v }))}
        placeholder={menuUi.accent}
        placeholderTextColor="#94a3b8"
        autoCapitalize="none"
        onFocus={() => scrollFieldIntoView(primaryColorRef)}
        onBlur={() => {
          const normalized = normalizeKitchenMenuHexColor(form.primaryColor);
          if (normalized && normalized !== form.primaryColor) {
            setForm((f) => ({ ...f, primaryColor: normalized }));
          }
        }}
      />
      </View>

      <View ref={navyColorRef} collapsable={false}>
      <Text style={styles.label}>{t('hotelKitchenMenuThemeNavy')}</Text>
      <TextInput
        style={[styles.input, colorErrors.some((e) => e.includes('lacivert')) && styles.inputInvalid]}
        value={form.navyColor ?? ''}
        onChangeText={(v) => setForm((f) => ({ ...f, navyColor: v }))}
        placeholder={menuUi.navy}
        placeholderTextColor="#94a3b8"
        autoCapitalize="none"
        onFocus={() => scrollFieldIntoView(navyColorRef)}
        onBlur={() => {
          const normalized = normalizeKitchenMenuHexColor(form.navyColor);
          if (normalized && normalized !== form.navyColor) {
            setForm((f) => ({ ...f, navyColor: normalized }));
          }
        }}
      />
      </View>

      {colorErrors.length > 0 ? (
        <View style={styles.colorHintBox}>
          {colorErrors.map((msg) => (
            <Text key={msg} style={styles.colorHintText}>
              {msg}
            </Text>
          ))}
        </View>
      ) : null}

      <Text style={styles.label}>{t('hotelKitchenMenuThemeLayout')}</Text>
      <View style={styles.layoutRow}>
        {LAYOUTS.map((opt) => {
          const active = (form.layout ?? 'classic') === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.layoutChip, active && { backgroundColor: preview.primaryColor, borderColor: preview.primaryColor }]}
              onPress={() => setForm((f) => ({ ...f, layout: opt.value }))}
            >
              <Text style={[styles.layoutChipText, active && styles.layoutChipTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>{t('hotelKitchenMenuLandingMode')}</Text>
      <View style={styles.layoutRow}>
        {([
          { value: 'hero' as const, label: t('hotelKitchenMenuLandingHero') },
          { value: 'explore' as const, label: t('hotelKitchenMenuLandingExplore') },
        ]).map((opt) => {
          const active = (form.landingMode ?? 'hero') === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.layoutChip, active && { backgroundColor: preview.primaryColor, borderColor: preview.primaryColor }]}
              onPress={() => setForm((f) => ({ ...f, landingMode: opt.value }))}
            >
              <Text style={[styles.layoutChipText, active && styles.layoutChipTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.presetHint}>{t('hotelKitchenMenuLandingModeHint')}</Text>

      <Text style={styles.label}>{t('hotelKitchenMenuCheckoutFieldsTitle')}</Text>
      <Text style={styles.checkoutLead}>{t('hotelKitchenMenuCheckoutFieldsLead')}</Text>
      {CHECKOUT_FIELD_KEYS.map((key) => {
        const current =
          form.checkoutFields?.[key] ?? DEFAULT_KITCHEN_MENU_CHECKOUT_FIELDS[key];
        const labelKey =
          key === 'name'
            ? 'publicKitchenMenuYourName'
            : key === 'email'
              ? 'publicKitchenMenuYourEmail'
              : key === 'hotelName'
                ? 'publicKitchenMenuHotelName'
                : key === 'room'
                  ? 'publicKitchenMenuRoomNumber'
                  : key === 'table'
                    ? 'publicKitchenMenuTableNumber'
                    : 'publicKitchenMenuDeliveryAddress';
        return (
          <View key={key} style={styles.checkoutRow}>
            <Text style={styles.checkoutRowLabel}>{t(labelKey)}</Text>
            <View style={styles.checkoutModes}>
              {CHECKOUT_MODES.map((mode) => {
                const active = current === mode.value;
                return (
                  <TouchableOpacity
                    key={mode.value}
                    style={[styles.checkoutModeChip, active && { backgroundColor: preview.primaryColor, borderColor: preview.primaryColor }]}
                    onPress={() =>
                      setForm((f) => ({
                        ...f,
                        checkoutFields: {
                          ...(f.checkoutFields ?? DEFAULT_KITCHEN_MENU_CHECKOUT_FIELDS),
                          [key]: mode.value,
                        },
                      }))
                    }
                  >
                    <Text style={[styles.checkoutModeText, active && styles.checkoutModeTextOn]}>
                      {t(mode.labelKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })}

      <Text style={styles.label}>{t('hotelKitchenMenuPromoVideosTitle')}</Text>
      <Text style={styles.presetHint}>{t('hotelKitchenMenuPromoVideosLead')}</Text>
      {(form.promoVideos ?? []).map((video, idx) => (
        <View key={video.id} style={styles.promoCard}>
          <View style={styles.promoCardHeader}>
            <Text style={styles.promoCardTitle}>{t('hotelKitchenMenuPromoVideoN', { n: idx + 1 })}</Text>
            <TouchableOpacity
              onPress={() =>
                setForm((f) => ({
                  ...f,
                  promoVideos: (f.promoVideos ?? []).filter((v) => v.id !== video.id),
                }))
              }
              hitSlop={8}
            >
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
            </TouchableOpacity>
          </View>
          <Text style={styles.promoFieldLabel}>{t('hotelKitchenMenuPromoVideoTitle')}</Text>
          <TextInput
            style={styles.input}
            value={video.title}
            onChangeText={(v) =>
              setForm((f) => ({
                ...f,
                promoVideos: (f.promoVideos ?? []).map((row) =>
                  row.id === video.id ? { ...row, title: v } : row
                ),
              }))
            }
            placeholder={t('hotelKitchenMenuPromoVideoTitlePh')}
            placeholderTextColor="#94a3b8"
          />
          <TouchableOpacity
            style={[styles.promoPickBtn, { borderColor: preview.primaryColor }]}
            disabled={
              !staff?.organization_id ||
              promoVideoUploadingId === video.id ||
              promoPosterUploadingId === video.id
            }
            onPress={async () => {
              if (!staff?.organization_id) return;
              setPromoPosterUploadingId(video.id);
              setPromoUploadStep('');
              const res = await pickKitchenMenuPromoPoster({
                organizationId: staff.organization_id,
                onProgress: setPromoUploadStep,
              });
              setPromoPosterUploadingId(null);
              setPromoUploadStep('');
              if (res.cancelled || !res.publicUrl) {
                if (res.error) Alert.alert(t('error'), res.error);
                return;
              }
              await savePromoPatch((videos) =>
                videos.map((row) =>
                  row.id === video.id
                    ? {
                        ...row,
                        posterUrl: res.publicUrl,
                        title: row.title.trim() || t('hotelKitchenMenuPromoVideoTitlePh'),
                      }
                    : row
                )
              );
            }}
          >
            {promoPosterUploadingId === video.id ? (
              <ActivityIndicator color={preview.primaryColor} />
            ) : (
              <Ionicons name="image-outline" size={18} color={preview.primaryColor} />
            )}
            <Text style={[styles.promoPickText, { color: preview.primaryColor }]}>
              {promoPosterUploadingId === video.id
                ? promoUploadStep || t('hotelKitchenMenuPromoPickingPoster')
                : video.posterUrl
                  ? t('hotelKitchenMenuPromoChangePoster')
                  : t('hotelKitchenMenuPromoPickPoster')}
            </Text>
          </TouchableOpacity>
          {video.posterUrl ? (
            <Text style={styles.promoUrlHint} numberOfLines={1}>
              {video.posterUrl}
            </Text>
          ) : null}
          <TouchableOpacity
            style={styles.promoPickBtnSecondary}
            disabled={
              !staff?.organization_id ||
              promoVideoUploadingId === video.id ||
              promoPosterUploadingId === video.id
            }
            onPress={async () => {
              if (!staff?.organization_id) return;
              setPromoVideoUploadingId(video.id);
              setPromoUploadStep('');
              const res = await pickAndUploadKitchenMenuPromoVideo({
                organizationId: staff.organization_id,
                onProgress: setPromoUploadStep,
              });
              setPromoVideoUploadingId(null);
              setPromoUploadStep('');
              if (res.cancelled) return;
              if (res.error) {
                Alert.alert(t('error'), res.error);
                return;
              }
              if (!res.publicUrl) return;
              await savePromoPatch((videos) =>
                videos.map((row) =>
                  row.id === video.id
                    ? {
                        ...row,
                        videoUrl: res.publicUrl,
                        muxPlaybackId: null,
                        title: row.title.trim() || t('hotelKitchenMenuPromoVideoTitlePh'),
                      }
                    : row
                )
              );
            }}
          >
            {promoVideoUploadingId === video.id ? (
              <ActivityIndicator color="#635bff" />
            ) : (
              <Ionicons name="film-outline" size={16} color="#635bff" />
            )}
            <Text style={styles.promoPickTextSecondary}>
              {promoVideoUploadingId === video.id
                ? promoUploadStep || t('hotelKitchenMenuPromoPickingVideo')
                : video.videoUrl
                  ? t('hotelKitchenMenuPromoChangeVideo')
                  : t('hotelKitchenMenuPromoPickVideoOptional')}
            </Text>
          </TouchableOpacity>
          {video.videoUrl ? (
            <Text style={styles.promoUrlHint} numberOfLines={1}>
              {video.videoUrl}
            </Text>
          ) : null}
        </View>
      ))}
      <TouchableOpacity
        style={styles.promoAddBtn}
        onPress={() => {
          const row: KitchenMenuPromoVideo = {
            id: newKitchenMenuPromoVideoId(),
            title: t('hotelKitchenMenuPromoVideoTitlePh'),
            videoUrl: null,
            muxPlaybackId: null,
            posterUrl: null,
          };
          setForm((f) => ({ ...f, promoVideos: [...(f.promoVideos ?? []), row] }));
        }}
      >
        <Ionicons name="add-circle-outline" size={20} color={preview.primaryColor} />
        <Text style={[styles.promoAddText, { color: preview.primaryColor }]}>{t('hotelKitchenMenuPromoAddSlide')}</Text>
      </TouchableOpacity>

      <View ref={heroImageRef} collapsable={false}>
      <Text style={styles.label}>{t('hotelKitchenMenuThemeHeroImage')}</Text>
      <TextInput
        style={styles.input}
        value={form.heroImageUrl ?? ''}
        onChangeText={(v) => setForm((f) => ({ ...f, heroImageUrl: v }))}
        placeholder="https://..."
        placeholderTextColor="#94a3b8"
        autoCapitalize="none"
        onFocus={() => scrollFieldIntoView(heroImageRef)}
      />
      </View>

      <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{t('save')}</Text>}
      </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  deniedTitle: { fontSize: 18, fontWeight: '700', marginTop: 10 },
  deniedDesc: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  lead: { fontSize: 14, color: '#64748b', lineHeight: 20, marginBottom: 16 },
  warnBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  warnText: { flex: 1, fontSize: 13, color: '#92400e', lineHeight: 18 },
  previewHero: { borderRadius: 16, padding: 20, marginBottom: 18, overflow: 'hidden' },
  previewLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 10,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80' },
  previewLiveText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  previewHotel: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 6 },
  previewTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  previewSub: { fontSize: 14, color: 'rgba(255,255,255,0.82)', marginTop: 6, lineHeight: 20 },
  previewChip: { alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  previewChipText: { color: '#fff', fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  label: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
  },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top' },
  inputInvalid: { borderColor: '#f87171', backgroundColor: '#fef2f2' },
  colorHintBox: {
    marginTop: 4,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  colorHintText: { fontSize: 12, color: '#b91c1c', lineHeight: 18 },
  layoutRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  layoutChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  layoutChipText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  layoutChipTextActive: { color: '#fff' },
  liveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    backgroundColor: '#2563eb',
    borderRadius: 14,
    padding: 14,
  },
  liveBtnTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  liveBtnUrl: { color: 'rgba(255,255,255,0.82)', fontSize: 12, marginTop: 2 },
  saveBtn: {
    marginTop: 20,
    backgroundColor: theme.colors.primaryDark,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  presetScroll: { gap: 10, paddingBottom: 4, marginBottom: 4 },
  presetChip: {
    width: 108,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  presetSwatch: { height: 40, borderRadius: 10, marginBottom: 8 },
  presetName: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  presetTag: { fontSize: 10, fontWeight: '600', color: '#94a3b8', marginTop: 2 },
  presetHint: { fontSize: 12, color: '#94a3b8', marginBottom: 12, lineHeight: 17 },
  checkoutLead: { fontSize: 12, color: '#64748b', lineHeight: 18, marginBottom: 10 },
  checkoutRow: { marginBottom: 12 },
  checkoutRowLabel: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 8 },
  checkoutModes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  checkoutModeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  checkoutModeText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  checkoutModeTextOn: { color: '#fff' },
  promoCard: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    gap: 6,
  },
  promoCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  promoCardTitle: { fontSize: 13, fontWeight: '800', color: '#334155' },
  promoFieldLabel: { fontSize: 11, fontWeight: '700', color: '#64748b', marginTop: 4 },
  promoAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, paddingVertical: 8 },
  promoAddText: { fontSize: 14, fontWeight: '700' },
  promoPickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginTop: 4,
  },
  promoPickText: { fontSize: 13, fontWeight: '700', flex: 1 },
  promoUrlHint: { fontSize: 10, color: '#94a3b8', marginTop: 4 },
  promoPickBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingVertical: 6,
  },
  promoPickTextSecondary: { fontSize: 12, fontWeight: '600', color: '#64748b' },
});
