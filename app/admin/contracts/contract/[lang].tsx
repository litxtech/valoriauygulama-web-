import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { AutoGrowMultilineInput } from '@/components/ui/AutoGrowMultilineInput';

const VERSION = 2;
const LANG_LABELS: Record<string, string> = {
  tr: 'Türkçe',
  en: 'English',
  ar: 'Arapça',
  de: 'Almanca',
  fr: 'Fransızca',
  ru: 'Rusça',
  es: 'İspanyolca',
};

export default function ContractLangEdit() {
  const { lang } = useLocalSearchParams<{ lang: string }>();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!lang) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('contract_templates')
        .select('title, content')
        .eq('lang', lang)
        .eq('version', VERSION)
        .maybeSingle();
      setTitle(data?.title ?? '');
      setContent(data?.content ?? '');
      setLoading(false);
    })();
  }, [lang]);

  const save = async () => {
    if (!lang) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('contract_templates')
        .update({
          title: (title ?? '').trim(),
          content: (content ?? '').trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('lang', lang)
        .eq('version', VERSION);
      if (error) throw error;
      await supabase.rpc('bump_contract_public_revision');
      Alert.alert('Kaydedildi', `${LANG_LABELS[lang] ?? lang} sözleşmesi güncellendi.`);
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Kaydedilemedi.');
    }
    setSaving(false);
  };

  const headerOffset = (Platform.OS === 'ios' ? 44 : 56) + insets.top;
  const langLabel = LANG_LABELS[lang ?? ''] ?? (lang ?? '').toUpperCase();

  if (!lang) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Dil parametresi yok.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={headerOffset}
    >
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#1a365d" />
          <Text style={styles.loading}>Yükleniyor...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 24) + 32 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator
          nestedScrollEnabled={Platform.OS === 'android'}
        >
          <Text style={styles.pageTitle}>{langLabel} – Sözleşme</Text>
          <Text style={styles.label}>Başlık</Text>
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Başlık"
            placeholderTextColor="#94a3b8"
          />
          <Text style={styles.label}>İçerik (düz metin)</Text>
          <AutoGrowMultilineInput
            style={styles.contentInput}
            value={content}
            onChangeText={setContent}
            minHeight={280}
            lineHeight={20}
            placeholder="İçerik"
            placeholderTextColor="#94a3b8"
          />
          <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={save} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#fff" style={styles.btnSpinner} />
            ) : (
              <Text style={styles.saveBtnText}>Kaydet</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  error: { padding: 24, fontSize: 14, color: '#64748b' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loading: { fontSize: 14, color: '#64748b' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 48 },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#0f172a', marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 6 },
  titleInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  contentInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 280,
    backgroundColor: '#fff',
    marginBottom: 24,
  },
  saveBtn: {
    backgroundColor: '#1a365d',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.7 },
  btnSpinner: { marginVertical: 4 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
