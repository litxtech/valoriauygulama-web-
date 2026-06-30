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
  RefreshControl,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { pickDocumentSafe } from '@/lib/documentPickerSafe';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { DEFAULT_METHODOLOGY_SUMMARY } from '@/lib/carbonConstants';
import { uploadBufferToPublicBucket } from '@/lib/storagePublicUpload';
import { uriToArrayBuffer, getMimeAndExt } from '@/lib/uploadMedia';
import { prepareCrossPlatformUploadImageUri } from '@/lib/crossPlatformImage';

type CarbonInputRow = {
  month_start: string;
  electricity_kwh: number;
  water_m3: number;
  gas_m3: number;
  waste_kg: number;
  occupancy_nights_override: number | null;
  electricity_factor: number;
  water_factor: number;
  gas_factor: number;
  waste_factor: number;
  notes: string | null;
  methodology_version: string | null;
  methodology_summary: string | null;
  electricity_factor_source: string | null;
  water_factor_source: string | null;
  gas_factor_source: string | null;
  waste_factor_source: string | null;
  data_collection_notes: string | null;
  prepared_by_name: string | null;
  verification_notes: string | null;
};

type EvidenceRow = {
  id: string;
  month_start: string;
  storage_path: string;
  public_url: string;
  file_label: string | null;
  mime_type: string | null;
  created_at: string;
};

type HistoryRow = {
  id: string;
  changed_at: string;
  changed_by: string | null;
};

function toMonthStart(monthInput: string): string | null {
  const v = monthInput.trim();
  if (!/^\d{4}-\d{2}$/.test(v)) return null;
  return `${v}-01`;
}

function toNumberOrZero(value: string): number {
  const n = Number(value.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function evidenceMime(uri: string): { mime: string; ext: string } {
  const lower = uri.toLowerCase();
  if (lower.includes('.pdf')) return { mime: 'application/pdf', ext: 'pdf' };
  return getMimeAndExt(uri, 'image');
}

export default function AdminCarbonScreen() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [electricity, setElectricity] = useState('');
  const [water, setWater] = useState('');
  const [gas, setGas] = useState('');
  const [waste, setWaste] = useState('');
  const [occupancyNights, setOccupancyNights] = useState('');
  const [electricityFactor, setElectricityFactor] = useState('0.42');
  const [waterFactor, setWaterFactor] = useState('0.30');
  const [gasFactor, setGasFactor] = useState('1.90');
  const [wasteFactor, setWasteFactor] = useState('0.50');
  const [notes, setNotes] = useState('');
  const [methodologyVersion, setMethodologyVersion] = useState('1.0');
  const [methodologySummary, setMethodologySummary] = useState(DEFAULT_METHODOLOGY_SUMMARY);
  const [electricitySource, setElectricitySource] = useState('');
  const [waterSource, setWaterSource] = useState('');
  const [gasSource, setGasSource] = useState('');
  const [wasteSource, setWasteSource] = useState('');
  const [dataCollectionNotes, setDataCollectionNotes] = useState('');
  const [preparedByName, setPreparedByName] = useState('');
  const [verificationNotes, setVerificationNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [evidence, setEvidence] = useState<EvidenceRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);

  const monthStart = useMemo(() => toMonthStart(month), [month]);

  const fillFromRow = (row: CarbonInputRow | null) => {
    if (!row) {
      setElectricity('');
      setWater('');
      setGas('');
      setWaste('');
      setOccupancyNights('');
      setElectricityFactor('0.42');
      setWaterFactor('0.30');
      setGasFactor('1.90');
      setWasteFactor('0.50');
      setNotes('');
      setMethodologyVersion('1.0');
      setMethodologySummary(DEFAULT_METHODOLOGY_SUMMARY);
      setElectricitySource('');
      setWaterSource('');
      setGasSource('');
      setWasteSource('');
      setDataCollectionNotes('');
      setPreparedByName(staff?.full_name?.trim() || '');
      setVerificationNotes('');
      return;
    }
    setElectricity(String(row.electricity_kwh ?? ''));
    setWater(String(row.water_m3 ?? ''));
    setGas(String(row.gas_m3 ?? ''));
    setWaste(String(row.waste_kg ?? ''));
    setOccupancyNights(row.occupancy_nights_override != null ? String(row.occupancy_nights_override) : '');
    setElectricityFactor(String(row.electricity_factor ?? 0.42));
    setWaterFactor(String(row.water_factor ?? 0.3));
    setGasFactor(String(row.gas_factor ?? 1.9));
    setWasteFactor(String(row.waste_factor ?? 0.5));
    setNotes(row.notes ?? '');
    setMethodologyVersion(row.methodology_version?.trim() || '1.0');
    setMethodologySummary(row.methodology_summary?.trim() || DEFAULT_METHODOLOGY_SUMMARY);
    setElectricitySource(row.electricity_factor_source ?? '');
    setWaterSource(row.water_factor_source ?? '');
    setGasSource(row.gas_factor_source ?? '');
    setWasteSource(row.waste_factor_source ?? '');
    setDataCollectionNotes(row.data_collection_notes ?? '');
    setPreparedByName(row.prepared_by_name?.trim() || staff?.full_name?.trim() || '');
    setVerificationNotes(row.verification_notes ?? '');
  };

  const loadEvidence = useCallback(async (ms: string) => {
    const { data, error } = await supabase
      .from('hotel_carbon_evidence')
      .select('id, month_start, storage_path, public_url, file_label, mime_type, created_at')
      .eq('month_start', ms)
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('carbon evidence', error.message);
      setEvidence([]);
      return;
    }
    setEvidence((data as EvidenceRow[]) ?? []);
  }, []);

  const loadHistory = useCallback(async (ms: string) => {
    const { data, error } = await supabase
      .from('hotel_carbon_monthly_history')
      .select('id, changed_at, changed_by')
      .eq('month_start', ms)
      .order('changed_at', { ascending: false })
      .limit(25);
    if (error) {
      console.warn('carbon history', error.message);
      setHistory([]);
      return;
    }
    setHistory((data as HistoryRow[]) ?? []);
  }, []);

  const load = useCallback(async () => {
    if (!monthStart) return;
    const { data, error } = await supabase
      .from('hotel_carbon_monthly_inputs')
      .select(
        'month_start, electricity_kwh, water_m3, gas_m3, waste_kg, occupancy_nights_override, electricity_factor, water_factor, gas_factor, waste_factor, notes, methodology_version, methodology_summary, electricity_factor_source, water_factor_source, gas_factor_source, waste_factor_source, data_collection_notes, prepared_by_name, verification_notes'
      )
      .eq('month_start', monthStart)
      .maybeSingle();
    if (error) {
      Alert.alert('Hata', error.message);
      fillFromRow(null);
      return;
    }
    fillFromRow((data as CarbonInputRow | null) ?? null);
    await Promise.all([loadEvidence(monthStart), loadHistory(monthStart)]);
  }, [monthStart, loadEvidence, loadHistory]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const save = async () => {
    if (!monthStart) {
      Alert.alert('Eksik bilgi', 'Ay formatı YYYY-MM olmalı (örn: 2026-03).');
      return;
    }
    setSaving(true);
    const { data: existingRow } = await supabase
      .from('hotel_carbon_monthly_inputs')
      .select('month_start')
      .eq('month_start', monthStart)
      .maybeSingle();

    const payload: Record<string, unknown> = {
      month_start: monthStart,
      electricity_kwh: toNumberOrZero(electricity),
      water_m3: toNumberOrZero(water),
      gas_m3: toNumberOrZero(gas),
      waste_kg: toNumberOrZero(waste),
      occupancy_nights_override: occupancyNights.trim() ? toNumberOrZero(occupancyNights) : null,
      electricity_factor: toNumberOrZero(electricityFactor),
      water_factor: toNumberOrZero(waterFactor),
      gas_factor: toNumberOrZero(gasFactor),
      waste_factor: toNumberOrZero(wasteFactor),
      notes: notes.trim() || null,
      methodology_version: methodologyVersion.trim() || '1.0',
      methodology_summary: methodologySummary.trim() || null,
      electricity_factor_source: electricitySource.trim() || null,
      water_factor_source: waterSource.trim() || null,
      gas_factor_source: gasSource.trim() || null,
      waste_factor_source: wasteSource.trim() || null,
      data_collection_notes: dataCollectionNotes.trim() || null,
      prepared_by_name: preparedByName.trim() || null,
      verification_notes: verificationNotes.trim() || null,
      updated_by: staff?.id ?? null,
    };
    if (!existingRow) payload.created_by = staff?.id ?? null;

    const { error } = await supabase.from('hotel_carbon_monthly_inputs').upsert(payload, { onConflict: 'month_start' });
    setSaving(false);
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    Alert.alert('Kaydedildi', 'Aylık karbon girdileri ve metodoloji güncellendi.');
    await load();
  };

  const pickAndUploadEvidence = async () => {
    if (!monthStart) {
      Alert.alert('Ay seçin', 'Önce geçerli bir ay (YYYY-MM) girin.');
      return;
    }
    const { data: monthRow } = await supabase
      .from('hotel_carbon_monthly_inputs')
      .select('month_start')
      .eq('month_start', monthStart)
      .maybeSingle();
    if (!monthRow) {
      Alert.alert('Önce kaydedin', 'Kanıt dosyası eklemek için bu ay için en az bir kez «Karbon girdisini kaydet» ile kayıt oluşturun.');
      return;
    }
    try {
      setUploadingEvidence(true);
      const res = await pickDocumentSafe({
        type: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const isPdf = !!asset.mimeType?.includes('pdf');
      const uri = isPdf ? asset.uri : await prepareCrossPlatformUploadImageUri(asset.uri);
      const { mime, ext } = isPdf ? { mime: 'application/pdf', ext: 'pdf' } : evidenceMime(uri);
      const buf = await uriToArrayBuffer(uri, { mediaKind: 'image' });
      const sub = `carbon/${monthStart.replace(/[^0-9-]/g, '')}`;
      const { publicUrl, path } = await uploadBufferToPublicBucket({
        bucketId: 'carbon-evidence',
        buffer: buf,
        contentType: mime,
        extension: ext,
        subfolder: sub,
      });
      const { error } = await supabase.from('hotel_carbon_evidence').insert({
        month_start: monthStart,
        storage_path: path,
        public_url: publicUrl,
        file_label: asset.name ?? null,
        mime_type: mime,
        created_by: staff?.id ?? null,
      });
      if (error) {
        Alert.alert('Hata', error.message);
        return;
      }
      await loadEvidence(monthStart);
    } catch (e) {
      Alert.alert('Yükleme', (e as Error)?.message ?? 'Dosya yüklenemedi');
    } finally {
      setUploadingEvidence(false);
    }
  };

  const deleteEvidence = (ev: EvidenceRow) => {
    Alert.alert('Kanıtı sil', 'Bu dosya kalıcı olarak silinsin mi?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          await supabase.storage.from('carbon-evidence').remove([ev.storage_path]);
          await supabase.from('hotel_carbon_evidence').delete().eq('id', ev.id);
          if (monthStart) await loadEvidence(monthStart);
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[adminTheme.colors.primary]} />}
    >
      <View style={styles.headerCard}>
        <Ionicons name="leaf-outline" size={22} color={adminTheme.colors.primary} />
        <Text style={styles.headerTitle}>Karbon girdileri</Text>
        <TouchableOpacity style={styles.reportBtn} onPress={() => router.push('/admin/carbon/report')} activeOpacity={0.8}>
          <Ionicons name="stats-chart-outline" size={16} color={adminTheme.colors.primary} />
          <Text style={styles.reportBtnText}>Rapor</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.headerHint}>
        Aylık tesis tüketimi ve emisyon katsayıları kayıt altına alınır; misafir payı konaklama gecesine göre otomatik dağıtılır. Denetim için
        katsayı kaynağı ve kanıt dosyası ekleyin.
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color={adminTheme.colors.primary} style={{ marginTop: 24 }} />
      ) : (
        <View style={styles.form}>
          <Text style={styles.label}>Ay (YYYY-MM)</Text>
          <TextInput
            style={styles.input}
            value={month}
            onChangeText={setMonth}
            placeholder="2026-03"
            placeholderTextColor={adminTheme.colors.textMuted}
          />

          <Text style={styles.sectionTitle}>Aylık tüketim</Text>
          <Text style={styles.label}>Elektrik (kWh)</Text>
          <TextInput style={styles.input} value={electricity} onChangeText={setElectricity} keyboardType="decimal-pad" />

          <Text style={styles.label}>Su (m³)</Text>
          <TextInput style={styles.input} value={water} onChangeText={setWater} keyboardType="decimal-pad" />

          <Text style={styles.label}>Doğalgaz (m³)</Text>
          <TextInput style={styles.input} value={gas} onChangeText={setGas} keyboardType="decimal-pad" />

          <Text style={styles.label}>Atık (kg)</Text>
          <TextInput style={styles.input} value={waste} onChangeText={setWaste} keyboardType="decimal-pad" />

          <Text style={styles.sectionTitle}>Dağıtım</Text>
          <Text style={styles.label}>Toplam konaklama gecesi (opsiyonel)</Text>
          <TextInput
            style={styles.input}
            value={occupancyNights}
            onChangeText={setOccupancyNights}
            keyboardType="decimal-pad"
            placeholder="Boş: sistem guests kayıtlarından hesaplar"
            placeholderTextColor={adminTheme.colors.textMuted}
          />

          <Text style={styles.sectionTitle}>Emisyon katsayıları (kg CO₂ birim başına)</Text>
          <Text style={styles.label}>Elektrik faktörü</Text>
          <TextInput style={styles.input} value={electricityFactor} onChangeText={setElectricityFactor} keyboardType="decimal-pad" />

          <Text style={styles.label}>Su faktörü</Text>
          <TextInput style={styles.input} value={waterFactor} onChangeText={setWaterFactor} keyboardType="decimal-pad" />

          <Text style={styles.label}>Doğalgaz faktörü</Text>
          <TextInput style={styles.input} value={gasFactor} onChangeText={setGasFactor} keyboardType="decimal-pad" />

          <Text style={styles.label}>Atık faktörü</Text>
          <TextInput style={styles.input} value={wasteFactor} onChangeText={setWasteFactor} keyboardType="decimal-pad" />

          <Text style={styles.sectionTitle}>Metodoloji ve kaynaklar</Text>
          <Text style={styles.label}>Metodoloji sürümü</Text>
          <TextInput style={styles.input} value={methodologyVersion} onChangeText={setMethodologyVersion} placeholder="1.0" />

          <Text style={styles.label}>Metodoloji özeti (rapor ve misafir ekranı)</Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={methodologySummary}
            onChangeText={setMethodologySummary}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />

          <Text style={styles.label}>Elektrik katsayısı kaynağı</Text>
          <TextInput
            style={styles.input}
            value={electricitySource}
            onChangeText={setElectricitySource}
            placeholder="Örn: TBMP 2024 şebeke emisyon faktörü"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
          <Text style={styles.label}>Su katsayısı kaynağı</Text>
          <TextInput style={styles.input} value={waterSource} onChangeText={setWaterSource} placeholderTextColor={adminTheme.colors.textMuted} />
          <Text style={styles.label}>Doğalgaz katsayısı kaynağı</Text>
          <TextInput style={styles.input} value={gasSource} onChangeText={setGasSource} placeholderTextColor={adminTheme.colors.textMuted} />
          <Text style={styles.label}>Atık katsayısı kaynağı</Text>
          <TextInput style={styles.input} value={wasteSource} onChangeText={setWasteSource} placeholderTextColor={adminTheme.colors.textMuted} />

          <Text style={styles.label}>Veri toplama (fatura / sayaç)</Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={dataCollectionNotes}
            onChangeText={setDataCollectionNotes}
            multiline
            numberOfLines={3}
            placeholder="Örn: Elektrik EPDK faturası Mart kesimi"
            placeholderTextColor={adminTheme.colors.textMuted}
          />

          <Text style={styles.label}>İç doğrulama / kontrol notu</Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={verificationNotes}
            onChangeText={setVerificationNotes}
            multiline
            numberOfLines={2}
            placeholderTextColor={adminTheme.colors.textMuted}
          />

          <Text style={styles.label}>Raporu hazırlayan (ad soyad)</Text>
          <TextInput
            style={styles.input}
            value={preparedByName}
            onChangeText={setPreparedByName}
            placeholderTextColor={adminTheme.colors.textMuted}
          />

          <Text style={styles.label}>Genel not</Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            placeholder="Örn: Fatura gecikmeli geldi, tahmini değer girildi."
            placeholderTextColor={adminTheme.colors.textMuted}
          />

          <Text style={styles.sectionTitle}>Kanıt dosyaları (fatura / PDF / foto)</Text>
          <TouchableOpacity
            style={[styles.evidenceBtn, uploadingEvidence && { opacity: 0.7 }]}
            onPress={pickAndUploadEvidence}
            disabled={uploadingEvidence}
          >
            {uploadingEvidence ? (
              <ActivityIndicator color={adminTheme.colors.primary} />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={20} color={adminTheme.colors.primary} />
                <Text style={styles.evidenceBtnText}>Dosya yükle</Text>
              </>
            )}
          </TouchableOpacity>
          {evidence.length === 0 ? (
            <Text style={styles.evidenceEmpty}>Bu ay için kanıt yok.</Text>
          ) : (
            evidence.map((ev) => (
              <View key={ev.id} style={styles.evidenceRow}>
                <TouchableOpacity
                  style={{ flex: 1 }}
                  onPress={() => Linking.openURL(ev.public_url).catch(() => {})}
                  disabled={Platform.OS === 'web'}
                >
                  <Text style={styles.evidenceName} numberOfLines={1}>
                    {ev.file_label || ev.public_url}
                  </Text>
                  <Text style={styles.evidenceMeta}>{ev.mime_type || '—'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteEvidence(ev)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash-outline" size={20} color="#b91c1c" />
                </TouchableOpacity>
              </View>
            ))
          )}

          <Text style={styles.sectionTitle}>Denetim geçmişi (bu ay)</Text>
          {history.length === 0 ? (
            <Text style={styles.evidenceEmpty}>Henüz kayıt yok (ilk kayıttan sonra oluşur).</Text>
          ) : (
            history.map((h) => (
              <Text key={h.id} style={styles.historyLine}>
                •{' '}
                {new Date(h.changed_at).toLocaleString('tr-TR', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                — sürüm kaydı saklandı
              </Text>
            ))
          )}

          <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Karbon girdisini kaydet</Text>}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 36 },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    padding: 12,
  },
  reportBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  reportBtnText: { color: adminTheme.colors.primary, fontSize: 12, fontWeight: '700' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text },
  headerHint: { marginTop: 10, color: adminTheme.colors.textSecondary, fontSize: 13, lineHeight: 18 },
  form: {
    marginTop: 14,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    padding: 14,
  },
  sectionTitle: {
    marginTop: 10,
    marginBottom: 8,
    color: adminTheme.colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  label: { color: adminTheme.colors.textSecondary, fontSize: 13, marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    color: adminTheme.colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  noteInput: { minHeight: 84, textAlignVertical: 'top' },
  saveBtn: {
    marginTop: 14,
    backgroundColor: adminTheme.colors.primary,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  evidenceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 8,
  },
  evidenceBtnText: { color: adminTheme.colors.primary, fontWeight: '700' },
  evidenceEmpty: { color: adminTheme.colors.textMuted, fontSize: 13, marginBottom: 8 },
  evidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.borderLight,
    gap: 8,
  },
  evidenceName: { color: adminTheme.colors.primary, fontSize: 14, fontWeight: '600' },
  evidenceMeta: { color: adminTheme.colors.textMuted, fontSize: 12 },
  historyLine: { color: adminTheme.colors.textSecondary, fontSize: 12, marginBottom: 4 },
});
