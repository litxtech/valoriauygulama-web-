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
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { uriToArrayBuffer } from '@/lib/uploadMedia';
import { prepareCrossPlatformUploadImageUri } from '@/lib/crossPlatformImage';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { AutoGrowMultilineInput } from '@/components/ui/AutoGrowMultilineInput';

const VERSION = 2;

export default function RulesContractEdit() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('contract_templates')
        .select('title, content')
        .eq('lang', 'tr')
        .eq('version', VERSION)
        .maybeSingle();
      setTitle(data?.title ?? 'Konaklama Sözleşmesi ve Otel Kuralları');
      setContent(data?.content ?? '');
      setLoading(false);
    })();
  }, []);

  const addImage = async () => {
    const granted = await ensureMediaLibraryPermission({
      title: 'Galeri izni',
      message: 'Sozlesmeye resim eklemek icin galeri erisimi istiyoruz.',
      settingsMessage: 'Galeri izni kapali. Sozlesmeye resim eklemek icin ayarlardan izin verin.',
    });
    if (!granted) {
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setUploadingImage(true);
    try {
      const uri = await prepareCrossPlatformUploadImageUri(result.assets[0].uri);
      const arrayBuffer = await uriToArrayBuffer(uri);
      const ext = uri.toLowerCase().includes('.png') ? 'png' : 'jpg';
      const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
      const fileName = `contract/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('contract-media').upload(fileName, arrayBuffer, {
        contentType,
        upsert: true,
      });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('contract-media').getPublicUrl(fileName);
      // Düz metin düzenleme: HTML yerine sadece link ekliyoruz.
      setContent((prev) => ((prev ?? '').trimEnd() + '\n' + urlData.publicUrl + '\n').trimStart());
    } catch (e) {
      Alert.alert('Yükleme hatası', e instanceof Error ? e.message : 'Resim eklenemedi.');
    }
    setUploadingImage(false);
  };

  const saveAndTranslate = async () => {
    const trimmedTitle = (title || 'Konaklama Sözleşmesi ve Otel Kuralları').trim();
    const trimmedContent = (content ?? '').trim();
    setSaving(true);
    try {
      const { error: updateTr } = await supabase
        .from('contract_templates')
        .update({
          title: trimmedTitle,
          content: trimmedContent,
          updated_at: new Date().toISOString(),
        })
        .eq('lang', 'tr')
        .eq('version', VERSION);
      if (updateTr) {
        Alert.alert('Hata', updateTr.message);
        setSaving(false);
        return;
      }

      const { data: fnData, error: fnError } = await supabase.functions.invoke('translate-contract', {
        body: { sourceTitle: trimmedTitle, sourceContent: trimmedContent },
      });
      if (fnError) {
        Alert.alert('Çeviri hatası', fnError.message || 'Edge function çağrılamadı.');
        setSaving(false);
        return;
      }
      const translations = (fnData as { translations?: Record<string, { title: string; content: string }> })?.translations;
      if (!translations) {
        Alert.alert('Uyarı', 'Türkçe kaydedildi; çeviri yanıtı boş. Diğer diller manuel düzenlenebilir.');
        setSaving(false);
        return;
      }

      for (const [lang, { title: tTitle, content: tContent }] of Object.entries(translations)) {
        await supabase
          .from('contract_templates')
          .update({
            title: tTitle || trimmedTitle,
            content: tContent ?? '',
            updated_at: new Date().toISOString(),
          })
          .eq('lang', lang)
          .eq('version', VERSION);
      }
      // Public web sözleşme QR URL’si revizyonu: her kayıtta değişsin (QR yenilensin)
      const { error: bumpErr } = await supabase.rpc('bump_contract_public_revision');
      if (bumpErr) {
        Alert.alert('Uyarı', `Kayıt tamamlandı; QR revizyonu güncellenemedi: ${bumpErr.message}`);
      } else {
        Alert.alert('Kaydedildi', 'Türkçe ve tüm diller güncellendi.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Hata', msg || 'Beklenmeyen hata.');
    }
    setSaving(false);
  };

  const headerOffset = (Platform.OS === 'ios' ? 44 : 56) + insets.top;

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
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 24) + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={true}
          nestedScrollEnabled={Platform.OS === 'android'}
        >
          <Text style={styles.pageTitle}>Kurallar sözleşmesi</Text>
          <Text style={styles.pageSubtitle}>Misafirin kabul ettiği ana metni buradan düzenleyin.</Text>
          <Text style={styles.label}>Başlık</Text>
          <View collapsable={false}>
            <TextInput
              style={styles.titleInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Konaklama Sözleşmesi ve Otel Kuralları"
              placeholderTextColor="#94a3b8"
            />
          </View>
          <View style={styles.contentHeaderRow}>
            <Text style={styles.label}>İçerik (düz metin)</Text>
            <TouchableOpacity
              style={styles.smallActionBtn}
              onPress={() => setContent('')}
              disabled={saving}
            >
              <Text style={styles.smallActionText}>Tümünü sil</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.pasteHint}>Yapıştırmak için alanda uzun basın → Yapıştır</Text>
          <View collapsable={false}>
            <AutoGrowMultilineInput
              style={styles.contentInput}
              value={content}
              onChangeText={setContent}
              minHeight={320}
              lineHeight={20}
              placeholder="Sözleşme metnini buraya yazın."
              placeholderTextColor="#94a3b8"
              selectTextOnFocus
            />
          </View>
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={saveAndTranslate}
            disabled={saving}
          >
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
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  pageSubtitle: { fontSize: 13, color: '#64748b', marginBottom: 16 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loading: { fontSize: 14, color: '#64748b' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 48 },
  label: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 6 },
  contentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 6,
  },
  smallActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#e5f2ff',
  },
  smallActionText: { fontSize: 11, fontWeight: '600', color: '#1d4ed8' },
  pasteHint: { fontSize: 12, color: '#64748b', marginBottom: 8 },
  titleInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  addImageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1a365d',
    borderRadius: 10,
    backgroundColor: '#f0f9ff',
  },
  addImageBtnText: { fontSize: 15, fontWeight: '600', color: '#1a365d' },
  contentInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 320,
    backgroundColor: '#fff',
  },
  saveBtn: {
    marginTop: 24,
    backgroundColor: '#1a365d',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.7 },
  btnSpinner: { marginVertical: 4 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
