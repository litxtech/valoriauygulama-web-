import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  criticalityLabel,
  fetchParentRelationsForAsset,
  fetchRelatedAssets,
  fetchTechAssetDetail,
  fetchTechMaintenanceLogs,
  normalizePhotoUrls,
  type TechAssetDetail,
  type TechParentRelation,
  type TechRelatedAsset,
} from '@/lib/technicalAssets';
import { canOperateTechnicalAssets, hasTechnicalAssetsStaffAccess } from '@/lib/staffPermissions';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';

export default function TechnicalAssetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [asset, setAsset] = useState<TechAssetDetail | null>(null);
  const [related, setRelated] = useState<TechRelatedAsset[]>([]);
  const [parents, setParents] = useState<TechParentRelation[]>([]);
  const [logs, setLogs] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canOperate = canOperateTechnicalAssets(staff);
  const allowed = hasTechnicalAssetsStaffAccess(staff);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    const { data, error: e } = await fetchTechAssetDetail(id);
    if (e) {
      setError(e);
      setAsset(null);
      return;
    }
    if (!data) {
      setError('Kayıt bulunamadı.');
      setAsset(null);
      return;
    }
    setAsset(data);
    // Detay kartını hızlı aç; ilişkiler ve loglar arka planda gelsin.
    Promise.all([fetchRelatedAssets(id), fetchParentRelationsForAsset(id), fetchTechMaintenanceLogs(id)])
      .then(([rel, par, lg]) => {
        setRelated(rel);
        setParents(par);
        setLogs(lg);
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!allowed) {
      router.replace('/staff/technical-assets');
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, load, router]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!allowed) return null;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a365d" />
      </View>
    );
  }

  if (error || !asset) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={40} color="#e11d48" />
        <Text style={styles.errTitle}>{error ?? 'Bulunamadı'}</Text>
        <TouchableOpacity style={styles.btnGhost} onPress={() => router.back()}>
          <Text style={styles.btnGhostText}>Geri</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const photos = normalizePhotoUrls(asset.photo_urls);
  const locLine = [asset.buildingName, asset.locationName].filter(Boolean).join(' / ');
  const critical = asset.criticality === 'critical';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {critical ? (
        <View style={styles.criticalBanner}>
          <Ionicons name="warning" size={22} color="#fff" />
          <Text style={styles.criticalText}>KRİTİK VARLIK — Yetkisiz müdahale etmeyin.</Text>
        </View>
      ) : null}

      <Text style={styles.title}>{asset.name}</Text>
      <Text style={styles.code}>Kod: {asset.asset_code}</Text>
      <Text style={styles.meta}>
        {asset.category_label} · {criticalityLabel(asset.criticality)} · Durum: {asset.status}
      </Text>
      {locLine ? <Text style={styles.loc}>📍 {locLine}</Text> : null}

      {photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
          {photos.map((uri) => (
            <Image key={uri} source={{ uri }} style={styles.photo} />
          ))}
        </ScrollView>
      ) : null}

      <Section title="Ne işe yarar?" body={asset.function_text} />
      <Section title="Kapatılırsa / devre dışı kalırsa" body={asset.if_closed_effects} />
      <Section title="Etkilediği alanlar" body={asset.affected_areas} />
      <Section title="Acil durumda yapılacaklar" body={asset.emergency_action} />
      <Section title="Uyarılar" body={asset.warning_text} />
      <Section title="Kim kapatabilir / kim açabilir" body={[asset.who_can_close, asset.who_can_open].filter(Boolean).join('\n')} />
      {asset.label_tagline ? <Section title="Etiket özeti" body={asset.label_tagline} /> : null}
      {asset.description ? <Section title="Ek not" body={asset.description} /> : null}

      {parents.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Üst bağlantılar (sizi etkileyen)</Text>
          {parents.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={styles.relRow}
              onPress={() => r.parent_asset && router.push(`/staff/technical-assets/${r.parent_asset.id}`)}
              disabled={!r.parent_asset}
            >
              <Ionicons name="arrow-up-outline" size={18} color="#64748b" />
              <Text style={styles.relText}>
                {r.parent_asset ? `${r.parent_asset.name} (${r.parent_asset.asset_code})` : '—'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {related.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Bağlı / etkilenen parçalar</Text>
          {related.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={styles.relRow}
              onPress={() => r.related_asset && router.push(`/staff/technical-assets/${r.related_asset.id}`)}
              disabled={!r.related_asset}
            >
              <Ionicons name="link-outline" size={18} color="#64748b" />
              <Text style={styles.relText}>
                {r.related_asset ? `${r.related_asset.name} (${r.related_asset.asset_code})` : '—'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {logs.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Son müdahaleler</Text>
          {(logs as { id: string; action_type: string; note: string | null; created_at: string; staff_name?: string | null }[]).map((l) => (
            <View key={l.id} style={styles.logRow}>
              <Text style={styles.logDate}>
                {new Date(l.created_at).toLocaleString('tr-TR')}
                {l.staff_name ? ` · ${l.staff_name}` : ''}
              </Text>
              <Text style={styles.logAction}>{l.action_type}</Text>
              {l.note ? <Text style={styles.logNote}>{l.note}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      {canOperate ? (
        <View style={styles.operateBlock}>
          <Text style={styles.operateTitle}>Hızlı durum</Text>
          <View style={styles.statusRow}>
            {(['active', 'maintenance', 'fault', 'inactive'] as const).map((st) => (
              <TouchableOpacity
                key={st}
                style={[styles.statusChip, asset.status === st && styles.statusChipOn]}
                onPress={async () => {
                  const { error: uerr } = await supabase
                    .from('tech_assets')
                    .update({ status: st, updated_by_staff_id: staff?.id ?? null })
                    .eq('id', asset.id);
                  if (!uerr) await load();
                }}
              >
                <Text style={[styles.statusChipText, asset.status === st && styles.statusChipTextOn]}>{st}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={styles.secondaryFault}
            onPress={() => router.push({ pathname: '/staff/technical-assets/faults/new', params: { assetId: asset.id } })}
          >
            <Ionicons name="warning-outline" size={20} color="#b45309" />
            <Text style={styles.secondaryFaultText}>Bu varlık için arıza bildir</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push({ pathname: '/staff/technical-assets/log', params: { assetId: asset.id } })}
          >
            <Ionicons name="add-circle-outline" size={22} color="#fff" />
            <Text style={styles.primaryBtnText}>Müdahale kaydı ekle</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push('/staff/technical-assets/scan')}>
        <Text style={styles.secondaryBtnText}>Başka QR tara</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.homeBtn} onPress={() => router.replace('/staff/(tabs)/index')}>
        <Ionicons name="home-outline" size={18} color="#1a365d" />
        <Text style={styles.homeBtnText}>Ana sayfa</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Section({ title, body }: { title: string; body: string | null | undefined }) {
  if (!body?.trim()) return null;
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{title}</Text>
      <Text style={styles.blockBody}>{body.trim()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#f8fafc' },
  errTitle: { marginTop: 12, fontSize: 16, color: '#64748b', textAlign: 'center' },
  btnGhost: { marginTop: 20, paddingVertical: 12, paddingHorizontal: 20 },
  btnGhostText: { color: '#1a365d', fontWeight: '700' },
  criticalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#b91c1c',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  criticalText: { flex: 1, color: '#fff', fontWeight: '800', fontSize: 14 },
  title: { fontSize: 22, fontWeight: '900', color: '#0f172a' },
  code: { fontSize: 14, fontFamily: 'monospace', color: '#475569', marginTop: 6 },
  meta: { fontSize: 14, color: '#64748b', marginTop: 8 },
  loc: { fontSize: 15, color: '#334155', marginTop: 10, fontWeight: '600' },
  photoRow: { marginTop: 16, marginBottom: 8 },
  photo: { width: 200, height: 140, borderRadius: 10, marginRight: 10, backgroundColor: '#e2e8f0' },
  block: { marginTop: 18, backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  blockTitle: { fontSize: 15, fontWeight: '800', color: '#1a365d', marginBottom: 8 },
  blockBody: { fontSize: 14, color: '#334155', lineHeight: 21 },
  relRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  relText: { flex: 1, fontSize: 14, color: '#0f172a' },
  logRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  logDate: { fontSize: 12, color: '#94a3b8' },
  logAction: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginTop: 2 },
  logNote: { fontSize: 13, color: '#475569', marginTop: 4 },
  primaryBtn: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a365d',
    paddingVertical: 16,
    borderRadius: 14,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  secondaryBtn: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#1a365d', fontWeight: '700', fontSize: 15 },
  homeBtn: {
    marginTop: 8,
    marginBottom: 8,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  homeBtnText: { color: '#1a365d', fontWeight: '800', fontSize: 14 },
  operateBlock: { marginTop: 8 },
  operateTitle: { fontSize: 14, fontWeight: '800', color: '#334155', marginBottom: 10 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
  },
  statusChipOn: { backgroundColor: '#1a365d' },
  statusChipText: { fontSize: 12, fontWeight: '700', color: '#475569', textTransform: 'capitalize' },
  statusChipTextOn: { color: '#fff' },
  secondaryFault: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fcd34d',
    backgroundColor: '#fffbeb',
  },
  secondaryFaultText: { color: '#b45309', fontWeight: '800', fontSize: 14 },
});
