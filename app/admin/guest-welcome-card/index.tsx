import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import {
  defaultGuestWelcomeContent,
  fetchGuestWelcomeCardForOrganization,
  GUEST_WELCOME_FIELD_LABELS,
  saveGuestWelcomeCardForOrganization,
  type GuestWelcomeCardLang,
  type GuestWelcomeCardLangContent,
  type GuestWelcomeCardStored,
} from '@/lib/guestWelcomeCardContent';

const LANGS: { id: GuestWelcomeCardLang; label: string }[] = [
  { id: 'tr', label: 'Türkçe' },
  { id: 'en', label: 'English' },
];

function emptyLangContent(): GuestWelcomeCardLangContent {
  return {
    title: '',
    subtitle: '',
    profileHint: '',
    purposeTitle: '',
    purposeBody: '',
    featureRequests: '',
    featureComplaints: '',
    featureThanks: '',
    sla: '',
  };
}

function mergeStoredLang(
  stored: GuestWelcomeCardStored | null,
  lang: GuestWelcomeCardLang
): GuestWelcomeCardLangContent {
  const base = emptyLangContent();
  const overrides = stored?.[lang];
  if (!overrides) return base;
  for (const key of Object.keys(base) as (keyof GuestWelcomeCardLangContent)[]) {
    base[key] = overrides[key]?.trim() ?? '';
  }
  return base;
}

export default function AdminGuestWelcomeCardScreen() {
  const insets = useSafeAreaInsets();
  const { staff, canUseAll, orgScoped, canQuery } = useAdminOrganizationQueryScope();
  const [lang, setLang] = useState<GuestWelcomeCardLang>('tr');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tr, setTr] = useState<GuestWelcomeCardLangContent>(emptyLangContent());
  const [en, setEn] = useState<GuestWelcomeCardLangContent>(emptyLangContent());

  const active = lang === 'tr' ? tr : en;
  const setActive = lang === 'tr' ? setTr : setEn;

  const load = useCallback(async () => {
    if (!canQuery || !orgScoped) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const row = await fetchGuestWelcomeCardForOrganization(orgScoped);
    setTr(mergeStoredLang(row, 'tr'));
    setEn(mergeStoredLang(row, 'en'));
    setLoading(false);
  }, [canQuery, orgScoped]);

  useEffect(() => {
    void load();
  }, [load]);

  const defaults = useMemo(() => defaultGuestWelcomeContent(lang), [lang]);

  const updateField = (key: keyof GuestWelcomeCardLangContent, value: string) => {
    setActive((prev) => ({ ...prev, [key]: value }));
  };

  const buildPayload = (): GuestWelcomeCardStored => {
    const pick = (content: GuestWelcomeCardLangContent, langId: GuestWelcomeCardLang) => {
      const defs = defaultGuestWelcomeContent(langId);
      const partial: Partial<GuestWelcomeCardLangContent> = {};
      for (const key of Object.keys(defs) as (keyof GuestWelcomeCardLangContent)[]) {
        const val = content[key].trim();
        if (val && val !== defs[key]) partial[key] = val;
      }
      return Object.keys(partial).length ? partial : undefined;
    };
    const payload: GuestWelcomeCardStored = { v: 1 };
    const trPart = pick(tr, 'tr');
    const enPart = pick(en, 'en');
    if (trPart) payload.tr = trPart;
    if (enPart) payload.en = enPart;
    return payload;
  };

  const save = async () => {
    if (!orgScoped) {
      Alert.alert('Hata', 'İşletme seçin veya personel kaydına işletme atayın.');
      return;
    }
    setSaving(true);
    const payload = buildPayload();
    const hasAny = !!(payload.tr || payload.en);
    const { error } = await saveGuestWelcomeCardForOrganization(orgScoped, hasAny ? payload : null);
    setSaving(false);
    if (error) Alert.alert('Hata', error);
    else {
      Alert.alert('Kaydedildi', 'Misafir karşılama kartı metinleri güncellendi. Yeni kayıt olan misafirler bu metinleri görür.');
      void load();
    }
  };

  const resetLangToDefaults = () => {
    Alert.alert(
      'Varsayılana dön',
      `${LANGS.find((l) => l.id === lang)?.label} metinleri temizlensin mi? Uygulama varsayılan metinleri kullanılır.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Temizle',
          style: 'destructive',
          onPress: () => setActive(emptyLangContent()),
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={adminTheme.colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        keyboardShouldPersistTaps="handled"
      >
        <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={staff?.organization_id} />
        {!orgScoped ? (
          <Text style={styles.intro}>Liste için üstten bir işletme seçin veya personel kaydınıza işletme atayın.</Text>
        ) : (
          <>
            <Text style={styles.intro}>
              Yeni misafir hesabı oluşturulduğunda gösterilen karşılama kartının metinlerini buradan düzenleyin. Boş
              bırakılan alanlar uygulama varsayılanına düşer.
            </Text>

            <View style={styles.langRow}>
              {LANGS.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.langChip, lang === item.id && styles.langChipActive]}
                  onPress={() => setLang(item.id)}
                >
                  <Text style={[styles.langChipText, lang === item.id && styles.langChipTextActive]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {(Object.keys(GUEST_WELCOME_FIELD_LABELS) as (keyof GuestWelcomeCardLangContent)[]).map((key) => (
              <View key={key} style={styles.fieldBlock}>
                <Text style={styles.label}>{GUEST_WELCOME_FIELD_LABELS[key]}</Text>
                <Text style={styles.defaultHint}>Varsayılan: {defaults[key]}</Text>
                <TextInput
                  style={[styles.input, key.includes('Body') || key === 'profileHint' ? styles.inputArea : null]}
                  value={active[key]}
                  onChangeText={(v) => updateField(key, v)}
                  placeholder={defaults[key]}
                  placeholderTextColor={adminTheme.colors.textMuted}
                  multiline={key.includes('Body') || key === 'profileHint' || key === 'subtitle'}
                  numberOfLines={key.includes('Body') || key === 'profileHint' ? 4 : 2}
                />
              </View>
            ))}

            <TouchableOpacity style={styles.secondaryBtn} onPress={resetLangToDefaults}>
              <Text style={styles.secondaryBtnText}>Bu dilde varsayılana dön</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Kaydet</Text>}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: adminTheme.colors.pageBg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: adminTheme.colors.pageBg },
  scroll: { padding: 20 },
  intro: {
    fontSize: 14,
    lineHeight: 21,
    color: adminTheme.colors.textSecondary,
    marginBottom: 16,
  },
  langRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  langChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: '#fff',
  },
  langChipActive: {
    backgroundColor: adminTheme.colors.primary,
    borderColor: adminTheme.colors.primary,
  },
  langChipText: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.text },
  langChipTextActive: { color: '#fff' },
  fieldBlock: { marginBottom: 14 },
  label: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text, marginBottom: 4 },
  defaultHint: { fontSize: 12, color: adminTheme.colors.textMuted, marginBottom: 6, lineHeight: 17 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: adminTheme.colors.text,
  },
  inputArea: { minHeight: 96, textAlignVertical: 'top' },
  secondaryBtn: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: '#fff',
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.textSecondary },
  saveBtn: {
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: adminTheme.colors.primary,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
