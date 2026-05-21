import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { supabase, supabaseUrl } from '@/lib/supabase';
import { QrHubSection } from '@/components/admin/QrHubSection';
import {
  buildPublicContractUrl,
  buildPublicMaliyeUrl,
  buildPublicMenuUrl,
  fetchPublicAppOriginFromSettings,
  invalidatePublicAppOriginCache,
} from '@/lib/appPublicUrl';
import { DEFAULT_PUBLIC_APP_ORIGIN, APP_PUBLIC_BASE_URL_SETTING_KEY } from '@/constants/appOrigin';
import { resolvePublicAppOrigin } from '@/lib/appPublicUrl';

function safePublicOrigin(origin?: string | null): string {
  const o = (origin ?? '').trim();
  if (o) return o.replace(/\/$/, '');
  return resolvePublicAppOrigin(null);
}
import { PUBLIC_CONTRACT_PATH, PUBLIC_MALIYE_PATH } from '@/constants/publicWebPaths';
import { FIXED_MALIYE_QR_TOKEN } from '@/constants/maliyeQr';
import { createMaliyeToken, createOrRotateFixedMaliyeToken } from '@/lib/maliyeAccess';
import { useAdminOrgStore } from '@/stores/adminOrgStore';

function defaultContractBase(publicOrigin?: string | null): string {
  const base = safePublicOrigin(publicOrigin);
  const fromEnv = process.env.EXPO_PUBLIC_PUBLIC_CONTRACT_URL?.replace(/\/$/, '').replace(/\?.*$/, '');
  if (fromEnv && !fromEnv.includes('valoria.app') && !fromEnv.includes('vercel.app')) {
    return fromEnv.replace(/\/guest\/sign-one\/?$/i, `/${PUBLIC_CONTRACT_PATH}`);
  }
  return `${base}/${PUBLIC_CONTRACT_PATH}`;
}

function defaultCheckinBase(publicOrigin?: string | null): string {
  return safePublicOrigin(publicOrigin);
}

function defaultMaliyeBase(publicOrigin?: string | null): string {
  return `${safePublicOrigin(publicOrigin)}/${PUBLIC_MALIYE_PATH}`;
}

export default function QrHubPage() {
  const { organizations, loadOrganizations } = useAdminOrgStore();
  const [loading, setLoading] = useState(true);

  const [publicBaseUrl, setPublicBaseUrl] = useState(DEFAULT_PUBLIC_APP_ORIGIN);
  const [menuOrgId, setMenuOrgId] = useState<string>('');
  const [contractBase, setContractBase] = useState('');
  const [checkinBase, setCheckinBase] = useState('');
  const [maliyeBase, setMaliyeBase] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  const [maliyePin, setMaliyePin] = useState('');
  const [maliyeDuration, setMaliyeDuration] = useState('24 hours');
  const [maliyeLastUrl, setMaliyeLastUrl] = useState('');
  const [maliyeBusy, setMaliyeBusy] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    const origin = await fetchPublicAppOriginFromSettings(true);
    setPublicBaseUrl(origin);

    const { data } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['contract_qr_base_url', 'checkin_qr_base_url', 'maliye_qr_base_url']);
    const map: Record<string, string> = {};
    (data ?? []).forEach((r: { key: string; value: unknown }) => {
      if (r.value != null && String(r.value).trim()) map[r.key] = String(r.value).trim();
    });
    setContractBase(map.contract_qr_base_url || defaultContractBase(origin));
    setCheckinBase(map.checkin_qr_base_url || defaultCheckinBase(origin));
    setMaliyeBase(
      map.maliye_qr_base_url?.replace(/\/functions\/v1\/public-maliye\/?$/i, `/${PUBLIC_MALIYE_PATH}`) ||
        defaultMaliyeBase(origin)
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadOrganizations(true);
    void loadSettings();
  }, [loadOrganizations, loadSettings]);

  useEffect(() => {
    if (menuOrgId || organizations.length === 0) return;
    const hotel = organizations.find((o) => o.kind === 'hotel') ?? organizations[0];
    if (hotel) setMenuOrgId(hotel.id);
  }, [organizations, menuOrgId]);

  const selectedOrg = useMemo(
    () => organizations.find((o) => o.id === menuOrgId) ?? null,
    [organizations, menuOrgId]
  );

  const menuUrl = selectedOrg?.slug ? buildPublicMenuUrl(selectedOrg.slug, publicBaseUrl) : '';

  const contractQrUrl = buildPublicContractUrl(undefined, publicBaseUrl);
  const checkinQrSample = checkinBase.trim()
    ? `${checkinBase.replace(/\/$/, '')}/guest?token=ORNEK-TOKEN`
    : `${defaultCheckinBase(publicBaseUrl)}/guest?token=ORNEK-TOKEN`;

  const maliyeQrUrl = buildPublicMaliyeUrl(
    FIXED_MALIYE_QR_TOKEN,
    maliyeBase.trim() ? maliyeBase.replace(/\?.*$/, '').replace(/\/$/, '') : safePublicOrigin(publicBaseUrl)
  );

  const saveSetting = async (key: string, value: string, label: string) => {
    setSaving(key);
    const { error } = await supabase.from('app_settings').upsert(
      { key, value: value.trim() || null, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
    setSaving(null);
    if (error) Alert.alert('Hata', error.message);
    else Alert.alert('Kaydedildi', `${label} güncellendi.`);
  };

  const createMaliyeFixed = async () => {
    if (maliyePin.trim().length < 4) {
      Alert.alert('PIN', 'En az 4 karakter girin.');
      return;
    }
    setMaliyeBusy(true);
    const res = await createOrRotateFixedMaliyeToken(maliyePin.trim(), maliyeDuration.trim() || '5 years');
    setMaliyeBusy(false);
    if (res.error) {
      Alert.alert('Hata', res.error.message ?? 'Token oluşturulamadı.');
      return;
    }
    setMaliyeLastUrl(maliyeQrUrl);
    Alert.alert('Tamam', 'Sabit maliye QR güncellendi.');
  };

  const createMaliyeExtra = async () => {
    if (maliyePin.trim().length < 4) {
      Alert.alert('PIN', 'En az 4 karakter girin.');
      return;
    }
    setMaliyeBusy(true);
    const res = await createMaliyeToken(maliyePin.trim(), maliyeDuration.trim() || '24 hours');
    setMaliyeBusy(false);
    if (res.error || !res.data) {
      Alert.alert('Hata', res.error?.message ?? 'Token üretilemedi.');
      return;
    }
    const row = Array.isArray(res.data) ? res.data[0] : res.data;
    const url = buildPublicMaliyeUrl((row as { token: string }).token, maliyeBase.replace(/\?.*$/, ''));
    setMaliyeLastUrl(url);
    Alert.alert('Tamam', 'Ek maliye linki oluşturuldu.');
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a365d" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>QR Merkezi</Text>
      <Text style={styles.pageSub}>
        Canlı site: valoria.tr — personel yemek ekleyince menü push olmadan anlık güncellenir (Supabase Realtime).
      </Text>

      <View style={styles.siteCard}>
        <Text style={styles.siteCardTitle}>Canlı site adresi</Text>
        <Text style={styles.siteCardHint}>
          Menü QR: {publicBaseUrl || '…'}/menü/{'{işletme-slug}'}
        </Text>
        <TextInput
          style={styles.input}
          value={publicBaseUrl}
          onChangeText={setPublicBaseUrl}
          placeholder="https://valoria.tr"
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={styles.siteSaveBtn}
          onPress={async () => {
            setSaving(APP_PUBLIC_BASE_URL_SETTING_KEY);
            const { error } = await supabase.from('app_settings').upsert(
              {
                key: APP_PUBLIC_BASE_URL_SETTING_KEY,
                value: publicBaseUrl.trim() || DEFAULT_PUBLIC_APP_ORIGIN,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'key' }
            );
            setSaving(null);
            invalidatePublicAppOriginCache();
            if (error) Alert.alert('Hata', error.message);
            else Alert.alert('Kaydedildi', 'Canlı site URL güncellendi. Vercel’de valoria.tr domain bağlı olmalı.');
          }}
          disabled={saving === APP_PUBLIC_BASE_URL_SETTING_KEY}
        >
          <Text style={styles.siteSaveBtnText}>
            {saving === APP_PUBLIC_BASE_URL_SETTING_KEY ? 'Kaydediliyor…' : 'Canlı site URL kaydet'}
          </Text>
        </TouchableOpacity>
      </View>

      <QrHubSection
        variant="menu"
        title="Otel mutfağı menüsü"
        description="Misafir uygulama indirmeden tarayıcıda menüyü görür. Personel/admin yemek ekleyince anlık yansır."
        url={menuUrl}
        urlLabel="Menü adresi (sabit)"
      >
        <Text style={styles.fieldLabel}>İşletme</Text>
        <View style={styles.orgRow}>
          {organizations.map((o) => (
            <TouchableOpacity
              key={o.id}
              style={[styles.orgChip, menuOrgId === o.id && styles.orgChipOn]}
              onPress={() => setMenuOrgId(o.id)}
            >
              <Text style={[styles.orgChipText, menuOrgId === o.id && styles.orgChipTextOn]} numberOfLines={1}>
                {o.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {!selectedOrg?.slug ? (
          <Text style={styles.warn}>Seçili işletmede slug yok; organizations tablosunu kontrol edin.</Text>
        ) : null}
      </QrHubSection>

      <QrHubSection
        variant="contract"
        title="Misafir sözleşmesi"
        description="Tüm sözleşme QR’ları tek adrese gider. Base URL değişince kaydedin."
        url={contractQrUrl}
        urlLabel="Sözleşme QR (sabit tam URL)"
        urlEditable
        onUrlChange={setContractBase}
        onSaveUrl={() => saveSetting('contract_qr_base_url', contractBase, 'Sözleşme base URL')}
        savingUrl={saving === 'contract_qr_base_url'}
      >
        <Text style={styles.fieldLabel}>Base URL (kayıt)</Text>
        <TextInput
          style={styles.input}
          value={contractBase}
          onChangeText={setContractBase}
          placeholder={defaultContractBase(publicBaseUrl)}
          autoCapitalize="none"
        />
        <Text style={styles.hint}>Örnek tam URL: {contractQrUrl}</Text>
      </QrHubSection>

      <QrHubSection
        title="Check-in QR (oda)"
        description="Oda bazlı token odalar ekranından üretilir. Burada yalnızca check-in base URL ayarlanır."
        url={checkinQrSample}
        urlLabel="Örnek check-in URL"
        urlEditable
        onUrlChange={setCheckinBase}
        onSaveUrl={() => saveSetting('checkin_qr_base_url', checkinBase, 'Check-in base URL')}
        savingUrl={saving === 'checkin_qr_base_url'}
      />

      <QrHubSection
        variant="maliye"
        title="Maliye evrak portalı"
        description="valoria.tr/maliye — PIN ile denetim portalı (Edge API gömülü)."
        url={maliyeLastUrl || maliyeQrUrl}
        urlLabel="Maliye QR adresi"
        urlEditable
        onUrlChange={setMaliyeBase}
        onSaveUrl={() => saveSetting('maliye_qr_base_url', maliyeBase, 'Maliye base URL')}
        savingUrl={saving === 'maliye_qr_base_url'}
      >
        <Text style={styles.fieldLabel}>Denetim PIN</Text>
        <TextInput
          style={styles.input}
          value={maliyePin}
          onChangeText={setMaliyePin}
          secureTextEntry
          placeholder="En az 4 karakter"
        />
        <Text style={styles.fieldLabel}>Süre (ör. 24 hours, 1 year)</Text>
        <TextInput style={styles.input} value={maliyeDuration} onChangeText={setMaliyeDuration} autoCapitalize="none" />
        <View style={styles.maliyeBtnRow}>
          <TouchableOpacity style={styles.btnPurple} onPress={createMaliyeFixed} disabled={maliyeBusy}>
            <Text style={styles.btnWhite}>Sabit maliye QR</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnBlue} onPress={createMaliyeExtra} disabled={maliyeBusy}>
            <Text style={styles.btnWhite}>Ek token + link</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>Sabit token: {FIXED_MALIYE_QR_TOKEN}</Text>
      </QrHubSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pageTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  pageSub: { fontSize: 14, color: '#64748b', lineHeight: 20, marginTop: 6, marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  hint: { fontSize: 11, color: '#64748b', lineHeight: 16, marginBottom: 4 },
  warn: { fontSize: 12, color: '#b45309', marginTop: 6 },
  orgRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  orgChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
    maxWidth: '48%',
  },
  orgChipOn: { backgroundColor: '#1a365d' },
  orgChipText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  orgChipTextOn: { color: '#fff' },
  maliyeBtnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  btnPurple: { flex: 1, minWidth: 140, backgroundColor: '#7c3aed', padding: 12, borderRadius: 10, alignItems: 'center' },
  btnBlue: { flex: 1, minWidth: 140, backgroundColor: '#1d4ed8', padding: 12, borderRadius: 10, alignItems: 'center' },
  btnWhite: { color: '#fff', fontWeight: '700' },
  siteCard: {
    backgroundColor: '#ecfdf5',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#6ee7b7',
  },
  siteCardTitle: { fontSize: 16, fontWeight: '800', color: '#065f46' },
  siteCardHint: { fontSize: 12, color: '#047857', marginTop: 4, marginBottom: 10 },
  siteSaveBtn: {
    marginTop: 8,
    backgroundColor: '#059669',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  siteSaveBtnText: { color: '#fff', fontWeight: '700' },
});
