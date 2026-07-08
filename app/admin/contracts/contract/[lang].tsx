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
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { FullScreenTextEditor } from '@/components/contracts/FullScreenTextEditor';

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
  const [editorOpen, setEditorOpen] = useState(false);

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
          <View style={styles.contentHeaderRow}>
            <Text style={styles.label}>İçerik (düz metin)</Text>
            <Text style={styles.contentMeta}>
              {content ? `${content.split('\n').length} satır · ${content.length} karakter` : 'Boş'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.editorCard}
            activeOpacity={0.7}
            onPress={() => setEditorOpen(true)}
          >
            <Text style={content ? styles.previewText : styles.previewPlaceholder} numberOfLines={12}>
              {content || 'İçerik henüz yok. Tam ekranda düzenlemek için dokunun.'}
            </Text>
            {content.split('\n').length > 12 ? <Text style={styles.previewMore}>…</Text> : null}
          </TouchableOpacity>

          <TouchableOpacity style={styles.editBtn} onPress={() => setEditorOpen(true)} activeOpacity={0.85}>
            <Ionicons name="create-outline" size={20} color="#fff" />
            <Text style={styles.editBtnText}>Tam ekranda düzenle</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={save} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#fff" style={styles.btnSpinner} />
            ) : (
              <Text style={styles.saveBtnText}>Kaydet</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      <FullScreenTextEditor
        visible={editorOpen}
        title={`${langLabel} – Sözleşme metni`}
        initialValue={content}
        placeholder="Sözleşme metnini buraya yazın veya yapıştırın…"
        onCancel={() => setEditorOpen(false)}
        onSave={(text) => {
          setContent(text);
          setEditorOpen(false);
        }}
      />
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
  contentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  contentMeta: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },
  editorCard: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 14,
    minHeight: 180,
    maxHeight: 300,
    backgroundColor: '#fff',
    marginBottom: 12,
    overflow: 'hidden',
  },
  previewText: { fontSize: 14, lineHeight: 21, color: '#0f172a' },
  previewPlaceholder: { fontSize: 14, lineHeight: 21, color: '#94a3b8' },
  previewMore: { fontSize: 18, color: '#94a3b8', marginTop: 4, textAlign: 'center' },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    paddingVertical: 13,
    borderRadius: 12,
    marginBottom: 20,
  },
  editBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
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
