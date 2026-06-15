import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import ViewShot from 'react-native-view-shot';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import type { QRCodeRef } from '@/components/DesignableQR';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { canAccessTechnicalAssetsAdminRoutes } from '@/lib/staffPermissions';
import {
  fetchRelatedAssets,
  fetchTechAssetDetail,
  TECH_CATEGORY_GROUPS,
  type TechAssetDetail,
  type TechAssetRow,
  type TechAssetStatus,
  type TechBuildingRow,
  type TechLocationRow,
  type TechRelatedAsset,
} from '@/lib/technicalAssets';
import { notifyTechAssetStatusChanged } from '@/lib/technicalAssetNotifications';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';

const STATUSES = ['active', 'inactive', 'maintenance', 'fault'] as const;
const CRIT = ['low', 'medium', 'high', 'critical'] as const;

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export default function AdminTechnicalAssetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const ok = canAccessTechnicalAssetsAdminRoutes(staff);
  const orgId = staff?.organization_id;
  const qrShotRef = useRef<ViewShot>(null);
  const qrSvgRef = useRef<QRCodeRef>(null);

  const [asset, setAsset] = useState<TechAssetDetail | null>(null);
  const [related, setRelated] = useState<TechRelatedAsset[]>([]);
  const [buildings, setBuildings] = useState<TechBuildingRow[]>([]);
  const [locations, setLocations] = useState<TechLocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [relId, setRelId] = useState('');

  const [name, setName] = useState('');
  const [assetCode, setAssetCode] = useState('');
  const [catGroup, setCatGroup] = useState('');
  const [catLabel, setCatLabel] = useState('');
  const [criticality, setCriticality] = useState('medium');
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [functionText, setFunctionText] = useState('');
  const [ifClosed, setIfClosed] = useState('');
  const [affected, setAffected] = useState('');
  const [emergency, setEmergency] = useState('');
  const [warnings, setWarnings] = useState('');
  const [whoClose, setWhoClose] = useState('');
  const [whoOpen, setWhoOpen] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [photosRaw, setPhotosRaw] = useState('');
  const [usageGuideText, setUsageGuideText] = useState('');
  const [usageGuideVideoUrl, setUsageGuideVideoUrl] = useState('');
  const [usageVideoUploading, setUsageVideoUploading] = useState(false);

  const locFiltered = useMemo(() => locations.filter((l) => l.building_id === buildingId), [locations, buildingId]);

  const applyAssetToForm = useCallback((a: TechAssetDetail) => {
    const row = a as TechAssetRow;
    setName(row.name);
    setAssetCode(row.asset_code);
    setCatGroup(row.category_group);
    setCatLabel(row.category_label);
    setCriticality(row.criticality);
    setBuildingId(row.building_id);
    setLocationId(row.location_id);
    setFunctionText(row.function_text ?? '');
    setIfClosed(row.if_closed_effects ?? '');
    setAffected(row.affected_areas ?? '');
    setEmergency(row.emergency_action ?? '');
    setWarnings(row.warning_text ?? '');
    setWhoClose(row.who_can_close ?? '');
    setWhoOpen(row.who_can_open ?? '');
    setTagline(row.label_tagline ?? '');
    setDescription(row.description ?? '');
    const pu = row.photo_urls;
    setPhotosRaw(Array.isArray(pu) ? (pu as string[]).join('\n') : '');
    setUsageGuideText(row.usage_guide_text ?? '');
    setUsageGuideVideoUrl(row.usage_guide_video_url ?? '');
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await fetchTechAssetDetail(id);
    setAsset(data);
    if (data) applyAssetToForm(data);
    const rel = await fetchRelatedAssets(id);
    setRelated(rel);
    const [b, loc] = await Promise.all([
      supabase.from('tech_buildings').select('*').order('name'),
      supabase.from('tech_locations').select('*').order('name'),
    ]);
    setBuildings((b.data as TechBuildingRow[]) ?? []);
    setLocations((loc.data as TechLocationRow[]) ?? []);
  }, [applyAssetToForm, id]);

  useEffect(() => {
    if (!ok) {
      router.replace('/admin');
      return;
    }
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load, ok, router]);

  useEffect(() => {
    if (!locFiltered.length) {
      setLocationId(null);
      return;
    }
    if (!locationId || !locFiltered.some((l) => l.id === locationId)) {
      setLocationId(locFiltered[0].id);
    }
  }, [buildingId, locFiltered, locationId]);

  const printLabel = async () => {
    if (!asset) return;
    let imgSrc = '';
    try {
      const uri = await qrShotRef.current?.capture?.();
      if (uri) imgSrc = uri;
    } catch {
      imgSrc = '';
    }
    if (!imgSrc) {
      const dataEnc = encodeURIComponent(asset.qr_payload);
      imgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${dataEnc}`;
    }
    const title = esc(String(asset.name).toUpperCase());
    const code = esc(asset.asset_code);
    const tag = asset.label_tagline ? esc(asset.label_tagline) : '';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
      body { font-family: system-ui, sans-serif; padding: 12px; color: #111; }
      .box { border: 2px solid #000; max-width: 420px; padding: 14px; }
      h1 { font-size: 15px; margin: 0 0 8px; }
      .code { font: 700 13px monospace; margin: 0 0 10px; }
      .tag { font-size: 11px; margin: 8px 0; line-height: 1.35; }
      .hint { font-size: 10px; color: #333; margin-top: 8px; }
    </style></head><body><div class="box"><h1>${title}</h1><p class="code">Kod: ${code}</p>${tag ? `<p class="tag">${tag}</p>` : ''}<img width="220" height="220" src="${imgSrc}" alt="QR"/><p class="hint">QR okut — Detay / acil talimat uygulamada.</p></div></body></html>`;
    try {
      await Print.printAsync({ html });
    } catch (e: unknown) {
      Alert.alert('Yazdırma', e instanceof Error ? e.message : 'Yazdırılamadı');
    }
  };

  const downloadQrPng = async () => {
    if (!asset) return;
    if (Platform.OS === 'web') {
      Alert.alert('Bilgi', "Web'de QR'ı indirmek için görüntüye sağ tıklayıp «Resmi farklı kaydet» kullanın.");
      return;
    }
    try {
      const canShare = await Sharing.isAvailableAsync();
      // 1) En stabil yol: ViewShot'tan png dosyası alıp doğrudan paylaş.
      const shotUri = await qrShotRef.current?.capture?.();
      if (shotUri) {
        if (canShare) {
          await Sharing.shareAsync(shotUri, {
            mimeType: 'image/png',
            dialogTitle: `Teknik varlık QR — ${asset.name}`,
          });
        } else {
          Alert.alert('Kaydedildi', shotUri);
        }
        return;
      }

      // 2) Fallback: SVG'den base64 al, dosyaya yaz.
      const ref = qrSvgRef.current;
      if (!ref?.toDataURL) {
        Alert.alert('Hata', 'QR görseli alınamadı.');
        return;
      }
      const raw = await new Promise<string | null>((resolve) => {
        try {
          ref.toDataURL((data: string) => resolve(typeof data === 'string' ? data : null));
        } catch {
          resolve(null);
        }
      });
      if (!raw) {
        Alert.alert('Hata', 'QR verisi üretilemedi.');
        return;
      }
      let base64 = raw.trim();
      if (base64.startsWith('data:')) {
        const comma = base64.indexOf(',');
        base64 = comma >= 0 ? base64.slice(comma + 1) : '';
      }
      base64 = base64.replace(/\s/g, '');
      if (base64.length < 80) {
        Alert.alert('Hata', 'QR verisi geçersiz.');
        return;
      }
      const cacheDir = FileSystem.cacheDirectory;
      if (!cacheDir) {
        Alert.alert('Hata', 'Cihazda geçici dosya dizini bulunamadı.');
        return;
      }
      const safeCode = String(asset.asset_code).replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 48);
      const filename = `valoria-teknik-varlik-${safeCode}-${Date.now()}.png`;
      const path = `${cacheDir}${filename}`;
      await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (canShare) {
        await Sharing.shareAsync(path, {
          mimeType: 'image/png',
          dialogTitle: `Teknik varlık QR — ${asset.name}`,
        });
      } else {
        Alert.alert('Kaydedildi', path);
      }
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'QR indirilemedi.');
    }
  };

  const cycleStatus = async () => {
    if (!asset || !staff) return;
    const prev = asset.status as TechAssetStatus;
    const i = STATUSES.indexOf(asset.status as (typeof STATUSES)[number]);
    const next = STATUSES[(i + 1) % STATUSES.length] as TechAssetStatus;
    const { error } = await supabase
      .from('tech_assets')
      .update({ status: next, updated_by_staff_id: staff.id })
      .eq('id', asset.id);
    if (error) Alert.alert('Hata', error.message);
    else {
      const { data: detail } = await fetchTechAssetDetail(asset.id);
      if (detail) {
        void notifyTechAssetStatusChanged({
          organizationId: detail.organization_id,
          asset: detail,
          previousStatus: prev,
          newStatus: next,
          updatedByStaffId: staff.id,
        });
      }
      await load();
    }
  };

  const saveFields = async () => {
    if (!asset || !locationId || !buildingId) {
      Alert.alert('Eksik', 'Bina ve lokasyon seçili olmalı.');
      return;
    }
    const urls = photosRaw
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    setSaving(true);
    try {
      const { error } = await supabase
        .from('tech_assets')
        .update({
          name: name.trim(),
          asset_code: assetCode.trim(),
          category_group: catGroup.trim(),
          category_label: catLabel.trim(),
          building_id: buildingId,
          location_id: locationId,
          function_text: functionText.trim() || null,
          if_closed_effects: ifClosed.trim() || null,
          affected_areas: affected.trim() || null,
          emergency_action: emergency.trim() || null,
          warning_text: warnings.trim() || null,
          who_can_close: whoClose.trim() || null,
          who_can_open: whoOpen.trim() || null,
          label_tagline: tagline.trim() || null,
          description: description.trim() || null,
          photo_urls: urls,
          usage_guide_text: usageGuideText.trim() || null,
          usage_guide_video_url: usageGuideVideoUrl.trim() || null,
          criticality,
          updated_by_staff_id: staff?.id ?? null,
        })
        .eq('id', asset.id);
      if (error) Alert.alert('Hata', error.message);
      else {
        Alert.alert('Kaydedildi', 'Varlık güncellendi.');
        await load();
      }
    } finally {
      setSaving(false);
    }
  };

  const addRelation = async () => {
    if (!asset || !orgId || !relId.trim()) return;
    const rid = relId.trim();
    if (rid === asset.id) {
      Alert.alert('Geçersiz', 'Kendi kendine bağlanamaz.');
      return;
    }
    const { error } = await supabase.from('tech_asset_relations').insert({
      organization_id: orgId,
      asset_id: asset.id,
      related_asset_id: rid,
      relation_type: 'affects',
    });
    if (error) Alert.alert('Hata', error.message);
    else {
      setRelId('');
      await load();
    }
  };

  const removeRelation = (relTableId: string) => {
    Alert.alert('İlişkiyi kaldır', 'Bu bağlantı silinsin mi?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('tech_asset_relations').delete().eq('id', relTableId);
          if (error) Alert.alert('Hata', error.message);
          else await load();
        },
      },
    ]);
  };

  const pickUsageVideo = async () => {
    const granted = await ensureMediaLibraryPermission({
      title: 'Galeri',
      message: 'Kullanım videosu seçmek için galeri erişimi gerekir.',
      settingsMessage: 'Ayarlardan galeri iznini açın.',
    });
    if (!granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 0.85,
      videoMaxDuration: 600,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setUsageVideoUploading(true);
    try {
      const org = orgId ?? 'org';
      const { publicUrl } = await uploadUriToPublicBucket({
        bucketId: 'tech-assets',
        uri: result.assets[0].uri,
        kind: 'video',
        subfolder: `usage-guides/${org}/${asset?.id ?? 'draft'}`,
      });
      setUsageGuideVideoUrl(publicUrl);
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Video yüklenemedi.');
    } finally {
      setUsageVideoUploading(false);
    }
  };

  const deleteAsset = () => {
    if (!asset) return;
    Alert.alert('Sil', 'Bu teknik varlığı silmek istediğinize emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('tech_assets').delete().eq('id', asset.id);
          if (error) Alert.alert('Hata', error.message);
          else router.replace('/admin/technical-assets/assets');
        },
      },
    ]);
  };

  if (!ok) return null;

  if (loading || !asset) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a365d" />
      </View>
    );
  }

  const locLine = [asset.buildingName, asset.locationName].filter(Boolean).join(' / ');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{asset.name}</Text>
      <Text style={styles.code}>{asset.asset_code}</Text>
      {locLine ? <Text style={styles.loc}>{locLine}</Text> : null}

      <View style={styles.qrBox}>
        <ViewShot ref={qrShotRef} options={{ format: 'png', quality: 0.95 }} style={{ backgroundColor: '#fff', padding: 8 }}>
          <QRCode
            value={asset.qr_payload}
            size={200}
            backgroundColor="#fff"
            color="#000"
            getRef={(r) => {
              qrSvgRef.current = r as QRCodeRef;
            }}
          />
        </ViewShot>
        <Text style={styles.qrHint}>{asset.qr_payload}</Text>
      </View>

      <View style={styles.qrActions}>
        <TouchableOpacity style={styles.btnDownload} onPress={downloadQrPng} activeOpacity={0.85}>
          <Ionicons name="download-outline" size={20} color="#1a365d" />
          <Text style={styles.btnDownloadText}>PNG indir</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnPrint} onPress={printLabel} activeOpacity={0.85}>
          <Ionicons name="print-outline" size={20} color="#fff" />
          <Text style={styles.btnPrintText}>Yazdır</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.qrActionHint}>Yazdır: etiket düzeni (QR cihazda üretilir; olmazsa ağ görseli kullanılır).</Text>

      <TouchableOpacity style={styles.btnSecondary} onPress={cycleStatus}>
        <Text style={styles.btnSecondaryText}>Durum: {asset.status} (döngü)</Text>
      </TouchableOpacity>

      <Text style={styles.section}>Kayıt düzenle</Text>
      <Text style={styles.label}>Ad</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholderTextColor="#a0aec0" />
      <Text style={styles.label}>Kod</Text>
      <TextInput style={styles.input} value={assetCode} onChangeText={setAssetCode} autoCapitalize="characters" placeholderTextColor="#a0aec0" />
      <Text style={styles.label}>Ana kategori</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
        {TECH_CATEGORY_GROUPS.map((c) => (
          <TouchableOpacity key={c.value} style={[styles.chip, catGroup === c.value && styles.chipOn]} onPress={() => setCatGroup(c.value)}>
            <Text style={[styles.chipText, catGroup === c.value && styles.chipTextOn]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Text style={styles.label}>Alt kategori etiketi</Text>
      <TextInput style={styles.input} value={catLabel} onChangeText={setCatLabel} placeholderTextColor="#a0aec0" />
      <Text style={styles.label}>Kritiklik</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
        {CRIT.map((c) => (
          <TouchableOpacity key={c} style={[styles.chip, criticality === c && styles.chipOn]} onPress={() => setCriticality(c)}>
            <Text style={[styles.chipText, criticality === c && styles.chipTextOn]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Text style={styles.label}>Bina</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
        {buildings.map((b) => (
          <TouchableOpacity key={b.id} style={[styles.chip, buildingId === b.id && styles.chipOn]} onPress={() => setBuildingId(b.id)}>
            <Text style={[styles.chipText, buildingId === b.id && styles.chipTextOn]}>{b.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Text style={styles.label}>Lokasyon</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
        {locFiltered.map((l) => (
          <TouchableOpacity key={l.id} style={[styles.chip, locationId === l.id && styles.chipOn]} onPress={() => setLocationId(l.id)}>
            <Text style={[styles.chipText, locationId === l.id && styles.chipTextOn]}>{l.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Text style={styles.label}>Ne işe yarar?</Text>
      <TextInput style={[styles.input, styles.tall]} value={functionText} onChangeText={setFunctionText} multiline placeholderTextColor="#a0aec0" />
      <Text style={styles.label}>Kapatılırsa</Text>
      <TextInput style={[styles.input, styles.tall]} value={ifClosed} onChangeText={setIfClosed} multiline placeholderTextColor="#a0aec0" />
      <Text style={styles.label}>Etkilenen alanlar</Text>
      <TextInput style={[styles.input, styles.tall]} value={affected} onChangeText={setAffected} multiline placeholderTextColor="#a0aec0" />
      <Text style={styles.label}>Acil</Text>
      <TextInput style={[styles.input, styles.tall]} value={emergency} onChangeText={setEmergency} multiline placeholderTextColor="#a0aec0" />
      <Text style={styles.label}>Uyarılar</Text>
      <TextInput style={[styles.input, styles.tall]} value={warnings} onChangeText={setWarnings} multiline placeholderTextColor="#a0aec0" />
      <Text style={styles.label}>Kim kapatabilir</Text>
      <TextInput style={styles.input} value={whoClose} onChangeText={setWhoClose} placeholderTextColor="#a0aec0" />
      <Text style={styles.label}>Kim açabilir</Text>
      <TextInput style={styles.input} value={whoOpen} onChangeText={setWhoOpen} placeholderTextColor="#a0aec0" />
      <Text style={styles.label}>Etiket kısa satır</Text>
      <TextInput style={styles.input} value={tagline} onChangeText={setTagline} placeholderTextColor="#a0aec0" />
      <Text style={styles.label}>Ek not</Text>
      <TextInput style={[styles.input, styles.tall]} value={description} onChangeText={setDescription} multiline placeholderTextColor="#a0aec0" />
      <Text style={styles.label}>Fotoğraf URL (satır / virgül)</Text>
      <TextInput style={[styles.input, styles.tall]} value={photosRaw} onChangeText={setPhotosRaw} multiline placeholderTextColor="#a0aec0" />

      <Text style={[styles.section, { marginTop: 20 }]}>Nasıl kullanılır (personel)</Text>
      <Text style={styles.label}>Talimat metni</Text>
      <TextInput
        style={[styles.input, styles.tall]}
        value={usageGuideText}
        onChangeText={setUsageGuideText}
        multiline
        placeholder="Örn. kazan açma, basınç kontrolü, güvenlik adımları…"
        placeholderTextColor="#a0aec0"
      />
      <Text style={styles.label}>Eğitim videosu</Text>
      {usageGuideVideoUrl.trim() ? (
        <Text style={styles.videoUrl} numberOfLines={2}>
          {usageGuideVideoUrl.trim()}
        </Text>
      ) : (
        <Text style={styles.videoEmpty}>Henüz video yok.</Text>
      )}
      <View style={styles.videoActions}>
        <TouchableOpacity
          style={[styles.usageVideoBtn, usageVideoUploading && { opacity: 0.6 }]}
          onPress={pickUsageVideo}
          disabled={usageVideoUploading}
        >
          {usageVideoUploading ? (
            <ActivityIndicator color="#1a365d" />
          ) : (
            <>
              <Ionicons name="videocam-outline" size={20} color="#1a365d" />
              <Text style={styles.btnSecondaryText}>Video seç / yükle</Text>
            </>
          )}
        </TouchableOpacity>
        {usageGuideVideoUrl.trim() ? (
          <TouchableOpacity style={styles.btnClearVideo} onPress={() => setUsageGuideVideoUrl('')}>
            <Text style={styles.btnClearVideoText}>Videoyu kaldır</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={saveFields} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Değişiklikleri kaydet</Text>}
      </TouchableOpacity>

      <Text style={[styles.section, { marginTop: 24 }]}>İlişkiler</Text>
      {related.map((r) => (
        <View key={r.id} style={styles.relRow}>
          <Text style={styles.relText}>
            {r.related_asset ? `${r.related_asset.name} (${r.related_asset.asset_code})` : '—'}
          </Text>
          <TouchableOpacity onPress={() => removeRelation(r.id)} hitSlop={10}>
            <Ionicons name="trash-outline" size={20} color="#e53e3e" />
          </TouchableOpacity>
        </View>
      ))}
      <Text style={styles.label}>İlişki ekle (hedef varlık uuid)</Text>
      <TextInput
        style={styles.input}
        value={relId}
        onChangeText={setRelId}
        placeholder="İliştirilecek varlık id"
        placeholderTextColor="#a0aec0"
        autoCapitalize="none"
      />
      <TouchableOpacity style={styles.btnSecondary} onPress={addRelation}>
        <Text style={styles.btnSecondaryText}>Bağla</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.danger} onPress={deleteAsset}>
        <Text style={styles.dangerText}>Varlığı sil</Text>
      </TouchableOpacity>
      {Platform.OS === 'ios' ? <View style={{ height: 24 }} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 20, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '900', color: '#1a202c', textAlign: 'center' },
  code: { fontSize: 14, fontFamily: 'monospace', color: '#4a5568', marginTop: 6 },
  loc: { fontSize: 14, color: '#2d3748', marginTop: 8, textAlign: 'center' },
  qrBox: { marginTop: 20, padding: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', alignSelf: 'stretch' },
  qrHint: { fontSize: 11, color: '#718096', marginTop: 10, textAlign: 'center' },
  qrActions: {
    marginTop: 16,
    flexDirection: 'row',
    alignSelf: 'stretch',
    gap: 10,
  },
  btnDownload: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#1a365d',
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnDownloadText: { color: '#1a365d', fontWeight: '800', fontSize: 14 },
  btnPrint: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a365d',
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnPrintText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  qrActionHint: { fontSize: 11, color: '#718096', marginTop: 8, textAlign: 'center', alignSelf: 'stretch', lineHeight: 16 },
  btnSecondary: {
    marginTop: 12,
    backgroundColor: '#edf2f7',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  btnSecondaryText: { color: '#1a365d', fontWeight: '700' },
  videoUrl: { fontSize: 11, color: '#475569', marginTop: 6, fontFamily: 'monospace' },
  videoEmpty: { fontSize: 13, color: '#94a3b8', marginTop: 6, fontStyle: 'italic' },
  videoActions: { marginTop: 10, gap: 8, alignSelf: 'stretch' },
  usageVideoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#edf2f7',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignSelf: 'stretch',
  },
  btnClearVideo: { alignSelf: 'center', paddingVertical: 8 },
  btnClearVideoText: { color: '#e53e3e', fontWeight: '700', fontSize: 14 },
  section: { alignSelf: 'stretch', marginTop: 20, fontWeight: '900', color: '#1a365d', fontSize: 16 },
  label: { alignSelf: 'stretch', marginTop: 12, fontSize: 12, fontWeight: '700', color: '#4a5568' },
  input: {
    alignSelf: 'stretch',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#1a202c',
    marginTop: 6,
  },
  tall: { minHeight: 80, textAlignVertical: 'top' },
  chipScroll: { marginTop: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginRight: 8,
  },
  chipOn: { backgroundColor: '#1a365d', borderColor: '#1a365d' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#4a5568' },
  chipTextOn: { color: '#fff' },
  saveBtn: { marginTop: 20, backgroundColor: '#b8860b', padding: 16, borderRadius: 12, alignItems: 'center', alignSelf: 'stretch' },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  relRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  relText: { flex: 1, fontSize: 14, color: '#2d3748', paddingRight: 8 },
  danger: { marginTop: 32, padding: 14, alignSelf: 'stretch' },
  dangerText: { color: '#e53e3e', fontWeight: '800', textAlign: 'center' },
});
