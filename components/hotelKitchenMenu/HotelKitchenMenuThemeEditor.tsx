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
  kitchenMenuThemeToPayload,
  normalizeKitchenMenuHexColor,
  parseKitchenMenuPublicTheme,
  resolveKitchenMenuTheme,
  type KitchenMenuLayoutMode,
  type KitchenMenuPublicTheme,
} from '@/lib/kitchenMenuTheme';
import { fetchOrganizationSlugById, invalidatePublicMenuCache } from '@/lib/publicKitchenMenu';
import { buildPublicKitchenMenuUrl } from '@/lib/appPublicUrl';
import { KITCHEN_MENU_THEME_PRESETS } from '@/lib/kitchenMenuThemePresets';
import { LinearGradient } from 'expo-linear-gradient';

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
  const [form, setForm] = useState<KitchenMenuPublicTheme>({ layout: 'featured' });
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [migrationMissing, setMigrationMissing] = useState(false);

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

  const save = async () => {
    if (!staff?.organization_id) return;
    const validationErrors = kitchenMenuThemeColorErrors(form);
    if (validationErrors.length > 0) {
      Alert.alert(t('error'), validationErrors.join('\n'));
      return;
    }
    setSaving(true);
    try {
      const normalizedForm: KitchenMenuPublicTheme = {
        ...form,
        primaryColor: normalizeKitchenMenuHexColor(form.primaryColor),
        navyColor: normalizeKitchenMenuHexColor(form.navyColor),
        accentLightColor: normalizeKitchenMenuHexColor(form.accentLightColor),
      };
      const payload = kitchenMenuThemeToPayload(normalizedForm);
      const { error } = await supabase.rpc('update_kitchen_menu_public_theme', {
        p_organization_id: staff.organization_id,
        p_theme: payload,
      });
      if (error) {
        if (
          error.message.includes('update_kitchen_menu_public_theme') ||
          error.message.includes('kitchen_menu_public_theme')
        ) {
          throw new Error(
            'Veritabanı güncellemesi gerekli (migration 434). Supabase\'de migration uygulayın veya yöneticinize bildirin.'
          );
        }
        if (error.message.includes('otel_mutfak_menu') || error.message.includes('yetkiniz yok')) {
          throw new Error('Otel mutfağı menü yetkisi gerekli. Yöneticinizden «otel_mutfak_menu» iznini açmasını isteyin.');
        }
        throw error;
      }
      setMigrationMissing(false);
      setForm(normalizedForm);
      if (orgSlug) invalidatePublicMenuCache(orgSlug);
      await load();
      Alert.alert(t('success'), t('hotelKitchenMenuThemeSaved'));
    } catch (e) {
      Alert.alert(t('error'), (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

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
});
