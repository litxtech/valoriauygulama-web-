import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { createMaliyeToken, createOrRotateFixedMaliyeToken } from '@/lib/maliyeAccess';
import { supabase } from '@/lib/supabase';
import { FIXED_MALIYE_QR_TOKEN, FIXED_MALIYE_QR_URL_FALLBACK } from '@/constants/maliyeQr';
import * as Clipboard from 'expo-clipboard';

const supabaseOrigin = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const defaultLivePortalBase = supabaseOrigin
  ? `${supabaseOrigin}/functions/v1/public-maliye`
  : '';

export default function AdminMaliyeHome() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [durationText, setDurationText] = useState('24 hours');
  const [creating, setCreating] = useState(false);
  const [creatingFixed, setCreatingFixed] = useState(false);
  const [lastUrl, setLastUrl] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [savingBase, setSavingBase] = useState(false);

  useEffect(() => {
    supabase
      .from('app_settings')
      .select('key, value')
      .eq('key', 'maliye_qr_base_url')
      .maybeSingle()
      .then(({ data }) => {
        const val = data?.value ? String(data.value) : '';
        if (val) setBaseUrl(val);
      });
  }, []);

  const createToken = async () => {
    if (pin.trim().length < 4) {
      Alert.alert('PIN gerekli', 'PIN en az 4 karakter olmalı.');
      return;
    }
    setCreating(true);
    const res = await createMaliyeToken(pin.trim(), durationText.trim() || '24 hours');
    setCreating(false);
    if (res.error || !res.data) {
      Alert.alert('Hata', res.error?.message ?? 'Token üretilemedi.');
      return;
    }
    const row = Array.isArray(res.data) ? res.data[0] : res.data;
    const base =
      (baseUrl || '').trim() ||
      (process.env.EXPO_PUBLIC_SUPABASE_URL
        ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/public-maliye`
        : FIXED_MALIYE_QR_URL_FALLBACK.replace(/\?.*$/, ''));
    const url = `${base}?token=${row.token}`;
    setLastUrl(url);
    Alert.alert('Hazır', 'Yeni maliye QR linki oluşturuldu.');
  };

  const createFixedToken = async () => {
    if (pin.trim().length < 4) {
      Alert.alert('PIN gerekli', 'PIN en az 4 karakter olmalı.');
      return;
    }
    setCreatingFixed(true);
    const res = await createOrRotateFixedMaliyeToken(pin.trim(), durationText.trim() || '5 years');
    setCreatingFixed(false);
    if (res.error || !res.data) {
      Alert.alert('Hata', res.error?.message ?? 'Sabit token oluşturulamadı.');
      return;
    }
    const base = (baseUrl || '').trim() || (process.env.EXPO_PUBLIC_SUPABASE_URL
      ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/public-maliye`
      : FIXED_MALIYE_QR_URL_FALLBACK.replace(/\?.*$/, ''));
    const url = `${base}?token=${FIXED_MALIYE_QR_TOKEN}`;
    setLastUrl(url);
    Alert.alert('Hazır', 'Sabit maliye QR oluşturuldu/güncellendi.');
  };

  const saveBaseUrl = async () => {
    setSavingBase(true);
    const val = baseUrl.trim() || null;
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'maliye_qr_base_url', value: val, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setSavingBase(false);
    if (error) return Alert.alert('Hata', error.message);
    Alert.alert('Kaydedildi', 'Maliye QR base URL kaydedildi.');
  };

  const copyLastUrl = async () => {
    if (!lastUrl) return;
    await Clipboard.setStringAsync(lastUrl);
    Alert.alert('Kopyalandi', 'Uretilen QR linki panoya alindi.');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Maliye QR Evrak Merkezi</Text>
      <Text style={styles.sub}>
        Denetim evraklari, gunluk musteri listesi, PIN ile acilan portal. Misafir sozlesmesi (netlify-contract) ile hicbir ilgisi yok; ayri Vercel projesi: klasor netlify-maliye.
      </Text>

      <View style={styles.warnBox}>
        <Text style={styles.warnTitle}>Sozlesme sayfasi aciliyorsa</Text>
        <Text style={styles.warnText}>
          Sozlesme Vercel adresi (ornek: valoriahotel-el4r.vercel.app) netlify-contract kokudur; orada maliye yok. Maliye icin Vercelde ayri proje ac, Root Directory netlify-maliye, cikan yeni xxx.vercel.app adresini asagidaki taban URL olarak kaydet veya QRda kullan.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Maliye portal taban URL (QR hedefi)</Text>
        <Text style={styles.hint}>
          Edge API: {'\n'}
          {defaultLivePortalBase || 'https://PROJE_REF.supabase.co/functions/v1/public-maliye'}
          {'\n\n'}Bos birakirsaniz QR bu adresi kullanir. Statik maliye sitesi icin Vercel ayri proje acin, Root Directory netlify-maliye; QR tabani ornek: https://MALIYE-PROJE.vercel.app (kök /, token sorguda).
        </Text>
        <TextInput
          value={baseUrl}
          onChangeText={setBaseUrl}
          placeholder={defaultLivePortalBase || 'https://PROJE_REF.supabase.co/functions/v1/public-maliye'}
          style={styles.input}
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.secondaryBtn} onPress={saveBaseUrl} disabled={savingBase}>
          {savingBase ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Portal Adresini Kaydet</Text>}
        </TouchableOpacity>
        <Text style={styles.label}>Denetim PIN Kodu</Text>
        <TextInput value={pin} onChangeText={setPin} secureTextEntry placeholder="En az 4 karakter" style={styles.input} />
        <Text style={styles.info}>
          Tek/sabit QR token: {FIXED_MALIYE_QR_TOKEN}
        </Text>
        <TouchableOpacity style={styles.fixedBtn} onPress={createFixedToken} disabled={creatingFixed}>
          {creatingFixed ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Sabit Denetim QR Olustur/Guncelle</Text>}
        </TouchableOpacity>
        <Text style={styles.label}>Erisim suresi (serbest yazi)</Text>
        <TextInput
          value={durationText}
          onChangeText={setDurationText}
          placeholder="Orn: 12 hours / 7 days / 1 month / 6 months"
          style={styles.input}
          autoCapitalize="none"
        />
        <View style={styles.presetRow}>
          {['12 hours', '24 hours', '7 days', '1 month', '3 months', '6 months', '1 year'].map((preset) => (
            <TouchableOpacity key={preset} style={styles.presetBtn} onPress={() => setDurationText(preset)}>
              <Text style={styles.presetText}>{preset}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.primaryBtn} onPress={createToken} disabled={creating}>
          {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Ek QR Token Uret</Text>}
        </TouchableOpacity>
        {lastUrl ? (
          <>
            <Text style={styles.url}>{lastUrl}</Text>
            <TouchableOpacity style={styles.copyBtn} onPress={copyLastUrl}>
              <Text style={styles.primaryBtnText}>Uretilen Linki Aninda Kopyala</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>

      <TouchableOpacity style={styles.navBtn} onPress={() => router.push('/admin/maliye/documents')}>
        <Text style={styles.navText}>Evrak Siralama ve Cekmeceler</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.navBtn} onPress={() => router.push('/admin/maliye/forms')}>
        <Text style={styles.navText}>Gunluk Musteri Formlari</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.navBtn} onPress={() => router.push('/admin/maliye/access')}>
        <Text style={styles.navText}>PIN ve Erisim Tokenlari</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.navBtn} onPress={() => router.push('/admin/maliye/logs')}>
        <Text style={styles.navText}>Denetim Erisim Loglari</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, gap: 10 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  sub: { color: '#475569' },
  warnBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 10,
    padding: 12,
    marginBottom: 4,
  },
  warnTitle: { fontSize: 13, fontWeight: '800', color: '#991b1b', marginBottom: 6 },
  warnText: { fontSize: 12, lineHeight: 18, color: '#7f1d1d' },
  hint: { color: '#64748b', fontSize: 12, lineHeight: 18, marginBottom: 4 },
  card: { backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', gap: 6 },
  label: { fontWeight: '700', color: '#334155' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, backgroundColor: '#fff' },
  primaryBtn: { marginTop: 8, backgroundColor: '#1d4ed8', borderRadius: 10, padding: 12, alignItems: 'center' },
  secondaryBtn: { marginTop: 8, backgroundColor: '#0f766e', borderRadius: 10, padding: 12, alignItems: 'center' },
  fixedBtn: { marginTop: 8, backgroundColor: '#7c3aed', borderRadius: 10, padding: 12, alignItems: 'center' },
  copyBtn: { marginTop: 6, backgroundColor: '#0369a1', borderRadius: 10, padding: 12, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  info: { marginTop: 6, color: '#475569', fontSize: 12 },
  url: { marginTop: 8, color: '#0f766e', fontSize: 12 },
  navBtn: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', padding: 14 },
  navText: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  presetBtn: { backgroundColor: '#eef2ff', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: '#c7d2fe' },
  presetText: { color: '#3730a3', fontSize: 12, fontWeight: '700' },
});
