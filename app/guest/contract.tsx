import { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useGuestFlowStore } from '@/stores/guestFlowStore';
import { supabase } from '@/lib/supabase';
import { LANGUAGES, changeAppLanguage, type LangCode } from '@/i18n';
import { WebView } from 'react-native-webview';

export default function ContractScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { lang, setStep } = useGuestFlowStore();
  const [contractLang, setContractLang] = useState<string>(i18n.language || lang || 'tr');
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [translating, setTranslating] = useState(false);
  const translatedCache = useRef<Record<string, string>>({});
  const { height } = useWindowDimensions();

  const fetchContract = useCallback(async (lng: string) => {
    setLoading(true);
    const { data: v2 } = await supabase
      .from('contract_templates')
      .select('content')
      .eq('lang', lng)
      .eq('version', 2)
      .eq('is_active', true)
      .maybeSingle();
    let text = v2?.content?.trim() ?? '';
    if (!text) {
      const { data: v1 } = await supabase
        .from('contract_templates')
        .select('content')
        .eq('lang', lng)
        .eq('is_active', true)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      text = v1?.content?.trim() ?? '';
    }
    if (!text && lng !== 'tr') {
      if (translatedCache.current[lng]) {
        setContent(translatedCache.current[lng]);
        setLoading(false);
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
              text = translated;
            }
          }
        }
        if (!text) {
          const { data: trFallback } = await supabase
            .from('contract_templates')
            .select('content')
            .eq('lang', 'tr')
            .eq('is_active', true)
            .order('version', { ascending: false })
            .limit(1)
            .maybeSingle();
          text = trFallback?.content ?? '';
        }
      } catch (_) {}
      setTranslating(false);
    }
    setContent(text || t('contract'));
    setLoading(false);
  }, [t]);

  useEffect(() => {
    fetchContract(contractLang);
  }, [contractLang, fetchContract]);

  const onSelectLang = async (code: string) => {
    setContractLang(code);
    await changeAppLanguage(code as LangCode);
  };

  const accept = () => {
    setStep('form');
    router.replace('/guest/form');
  };

  const isLikelyHtml = (s: string) => /<[a-z][\s\S]*>/i.test(s);
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  const bodyForWebView = (raw: string) =>
    isLikelyHtml(raw) ? raw : escapeHtml(raw).replace(/\n/g, '<br/>');

  const htmlDoc = (body: string) => {
    const dir = contractLang === 'ar' ? ' dir="rtl"' : '';
    return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    body { margin: 0; padding: 12px; font-size: 15px; color: #1a202c; line-height: 1.5; }
    a { color: #3182ce; text-decoration: none; }
    a:active { opacity: 0.8; }
    h2,h3 { color: #1a365d; margin-top: 16px; margin-bottom: 8px; }
    .plain { white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body class="${isLikelyHtml(body) ? '' : 'plain'}"${dir}>${bodyForWebView(body)}</body>
</html>`;
  };

  const handleShouldStartLoad = (req: { url: string }) => {
    const u = req.url;
    if (u === 'about:blank' || u.startsWith('data:')) return true;
    Linking.openURL(u);
    return false;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('contract')}</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.langStrip}
        contentContainerStyle={styles.langStripContent}
      >
        {LANGUAGES.map(({ code, label }) => (
          <TouchableOpacity
            key={code}
            style={[styles.langBtn, contractLang === code && styles.langBtnActive, (loading || translating) && styles.langBtnDisabled]}
            onPress={() => onSelectLang(code)}
            disabled={loading || translating}
          >
            <Text style={[styles.langBtnText, contractLang === code && styles.langBtnTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading || translating ? (
        <Text style={styles.loading}>{translating ? `${t('loading')} / ${t('guestTranslating')}` : t('loading')}</Text>
      ) : (
        <>
          <View style={[styles.webWrap, { height: height * 0.45 }]}>
            <WebView
              source={{ html: htmlDoc(content) }}
              style={styles.webview}
              scrollEnabled
              onShouldStartLoadWithRequest={handleShouldStartLoad}
              originWhitelist={['*']}
            />
          </View>
          <View style={styles.footer}>
            <TouchableOpacity style={styles.button} onPress={accept}>
              <Text style={styles.buttonText}>{t('acceptContract')} – {t('next')}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a365d' },
  header: { paddingTop: 56, paddingHorizontal: 24, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '700', color: '#fff' },
  langStrip: { maxHeight: 44, marginBottom: 8 },
  langStripContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center', paddingVertical: 6 },
  langBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginRight: 8,
  },
  langBtnActive: { backgroundColor: '#ed8936' },
  langBtnDisabled: { opacity: 0.6 },
  langBtnText: { color: 'rgba(255,255,255,0.9)', fontSize: 13 },
  langBtnTextActive: { color: '#fff', fontWeight: '600' },
  loading: { color: '#fff', padding: 24 },
  webWrap: { marginHorizontal: 16, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff' },
  webview: { flex: 1 },
  footer: { padding: 24, paddingBottom: 48 },
  button: {
    backgroundColor: '#ed8936',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
