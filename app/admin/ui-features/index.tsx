import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import {
  APP_FEATURE_CATALOG,
  PLACEMENT_LABELS_TR,
  catalogForAudience,
  type AppFeatureAudience,
  type AppFeaturePlacement,
} from '@/lib/appFeatureCatalog';
import {
  mergeOrganizationUiFeatures,
  normalizeOrganizationUiFeatures,
  resolveFeatureEnabled,
  type OrganizationUiFeaturesConfig,
} from '@/lib/organizationUiFeatures';
import { useOrganizationUiFeaturesStore } from '@/stores/organizationUiFeaturesStore';

const PLACEMENTS: AppFeaturePlacement[] = ['tab', 'profile', 'hamburger', 'header_left', 'header_right'];

type FeatureStatusFilter = 'enabled' | 'disabled';

export default function AdminUiFeaturesScreen() {
  const router = useRouter();
  const { staff, canUseAll, orgScoped, canQuery } = useAdminOrganizationQueryScope();
  const insets = useSafeAreaInsets();
  const reloadStore = useOrganizationUiFeaturesStore((s) => s.load);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<OrganizationUiFeaturesConfig | null>(null);
  const [audience, setAudience] = useState<AppFeatureAudience>('staff');
  const [statusFilter, setStatusFilter] = useState<FeatureStatusFilter>('enabled');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!canQuery || !orgScoped) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('organizations')
      .select('ui_features')
      .eq('id', orgScoped)
      .maybeSingle();
    if (error) {
      Alert.alert('Hata', error.message);
      setConfig(mergeOrganizationUiFeatures(null));
    } else {
      setConfig(mergeOrganizationUiFeatures(normalizeOrganizationUiFeatures(data?.ui_features)));
    }
    setLoading(false);
  }, [canQuery, orgScoped]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const audienceCatalog = useMemo(() => catalogForAudience(audience), [audience]);

  const statusCounts = useMemo(() => {
    let enabled = 0;
    let disabled = 0;
    for (const entry of audienceCatalog) {
      if (resolveFeatureEnabled(config, entry.id)) enabled += 1;
      else if (!entry.locked) disabled += 1;
    }
    return { enabled, disabled };
  }, [audienceCatalog, config]);

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return audienceCatalog.filter((entry) => {
      const enabled = resolveFeatureEnabled(config, entry.id);
      if (statusFilter === 'enabled' && !enabled) return false;
      if (statusFilter === 'disabled' && (enabled || entry.locked)) return false;
      if (!q) return true;
      return entry.labelTr.toLowerCase().includes(q) || entry.id.toLowerCase().includes(q);
    });
  }, [audienceCatalog, config, query, statusFilter]);

  const setEnabled = (id: string, enabled: boolean) => {
    setConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        features: {
          ...prev.features,
          [id]: { ...prev.features[id], enabled },
        },
      };
    });
  };

  const togglePlacement = (id: string, placement: AppFeaturePlacement) => {
    const def = APP_FEATURE_CATALOG.find((e) => e.id === id);
    if (!def || def.locked) return;
    setConfig((prev) => {
      if (!prev) return prev;
      const current = prev.features[id]?.placements ?? [...def.defaultPlacements];
      const next = current.includes(placement)
        ? current.filter((p) => p !== placement)
        : [...current, placement];
      return {
        ...prev,
        features: {
          ...prev.features,
          [id]: { ...prev.features[id], placements: next },
        },
      };
    });
  };

  const save = async () => {
    if (!orgScoped || !config) return;
    setSaving(true);
    const { error } = await supabase
      .from('organizations')
      .update({ ui_features: config })
      .eq('id', orgScoped);
    setSaving(false);
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    await reloadStore(orgScoped);
    Alert.alert('Kaydedildi', 'Özellik görünürlüğü güncellendi. Personel ve misafir uygulaması yenilendiğinde yansır.');
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}>
        <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={staff?.organization_id} />
        {!orgScoped ? (
          <Text style={styles.intro}>Liste için üstten bir işletme seçin veya personel kaydınıza işletme atayın.</Text>
        ) : null}
        <Text style={styles.intro}>
          Kapalı özellikler personel ve misafir ekranlarında görünmez. Yerleşim: alt sekme, profil menüsü, hamburger veya üst çubuk.
        </Text>

        <TouchableOpacity
          style={styles.hamburgerLink}
          onPress={() => router.push('/admin/hamburger-menu' as never)}
          activeOpacity={0.88}
        >
          <View style={styles.hamburgerLinkIcon}>
            <Ionicons name="menu-outline" size={22} color={adminTheme.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.hamburgerLinkTitle}>Personel hamburger menü tasarımı</Text>
            <Text style={styles.hamburgerLinkSub}>Sıra, renk, üst buton ve canlı önizleme</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={adminTheme.colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.audienceRow}>
          {(['staff', 'customer'] as const).map((a) => (
            <TouchableOpacity
              key={a}
              style={[styles.audienceChip, audience === a && styles.audienceChipActive]}
              onPress={() => setAudience(a)}
            >
              <Text style={[styles.audienceChipText, audience === a && styles.audienceChipTextActive]}>
                {a === 'staff' ? 'Personel uygulaması' : 'Misafir uygulaması'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.statusRow}>
          {(
            [
              { id: 'enabled' as const, label: 'Açık', count: statusCounts.enabled },
              { id: 'disabled' as const, label: 'Kapalı', count: statusCounts.disabled },
            ] as const
          ).map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.statusChip, statusFilter === tab.id && styles.statusChipActive]}
              onPress={() => setStatusFilter(tab.id)}
            >
              <Text style={[styles.statusChipText, statusFilter === tab.id && styles.statusChipTextActive]}>
                {tab.label}
              </Text>
              <View style={[styles.statusBadge, statusFilter === tab.id && styles.statusBadgeActive]}>
                <Text style={[styles.statusBadgeText, statusFilter === tab.id && styles.statusBadgeTextActive]}>
                  {tab.count}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Özellik ara..."
          placeholderTextColor={adminTheme.colors.textMuted}
        />

        {entries.length === 0 ? (
          <Text style={styles.emptyHint}>
            {query.trim()
              ? 'Arama sonucu bulunamadı.'
              : statusFilter === 'enabled'
                ? 'Bu uygulamada açık özellik yok.'
                : 'Kapalı özellik yok — tüm kapatılabilir öğeler açık.'}
          </Text>
        ) : null}

        {entries.map((entry) => {
          const fc = config?.features[entry.id];
          const enabled = resolveFeatureEnabled(config, entry.id);
          const placements = fc?.placements ?? entry.defaultPlacements;
          return (
            <View key={entry.id} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{entry.labelTr}</Text>
                  <Text style={styles.cardId}>{entry.id}</Text>
                </View>
                {entry.locked ? (
                  <View style={styles.lockedBadge}>
                    <Text style={styles.lockedText}>Sabit</Text>
                  </View>
                ) : (
                  <Switch
                    value={enabled}
                    onValueChange={(v) => setEnabled(entry.id, v)}
                    trackColor={{ false: adminTheme.colors.border, true: adminTheme.colors.primary }}
                  />
                )}
              </View>
              {enabled && !entry.locked ? (
                <View style={styles.placementRow}>
                  {entry.defaultPlacements.map((p) => {
                    const active = placements.includes(p);
                    return (
                      <TouchableOpacity
                        key={p}
                        style={[styles.placeChip, active && styles.placeChipActive]}
                        onPress={() => togglePlacement(entry.id, p)}
                      >
                        <Text style={[styles.placeChipText, active && styles.placeChipTextActive]}>
                          {PLACEMENT_LABELS_TR[p]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : enabled && entry.locked ? (
                <Text style={styles.lockedHint}>Bu öğe her zaman açıktır.</Text>
              ) : (
                <Text style={styles.offHint}>Kapalı — uygulamada hiçbir yerde görünmez.</Text>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving} activeOpacity={0.88}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="save-outline" size={20} color="#fff" />
              <Text style={styles.saveBtnText}>Kaydet</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: adminTheme.colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16 },
  intro: { fontSize: 14, color: adminTheme.colors.textSecondary, lineHeight: 20, marginBottom: 16 },
  hamburgerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: adminTheme.colors.borderLight,
  },
  hamburgerLinkIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hamburgerLinkTitle: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  hamburgerLinkSub: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 3, lineHeight: 17 },
  audienceRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  audienceChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    alignItems: 'center',
  },
  audienceChipActive: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  audienceChipText: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.text },
  audienceChipTextActive: { color: '#fff' },
  statusRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statusChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  statusChipActive: { backgroundColor: adminTheme.colors.surface, borderColor: adminTheme.colors.primary },
  statusChipText: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.textSecondary },
  statusChipTextActive: { color: adminTheme.colors.primary },
  statusBadge: {
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: adminTheme.colors.borderLight,
    alignItems: 'center',
  },
  statusBadgeActive: { backgroundColor: adminTheme.colors.primary },
  statusBadgeText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textSecondary },
  statusBadgeTextActive: { color: '#fff' },
  emptyHint: {
    fontSize: 14,
    color: adminTheme.colors.textMuted,
    textAlign: 'center',
    paddingVertical: 24,
    lineHeight: 20,
  },
  search: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 14,
    color: adminTheme.colors.text,
  },
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.borderLight,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  cardId: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 2 },
  lockedBadge: { backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  lockedText: { fontSize: 11, fontWeight: '600', color: adminTheme.colors.textMuted },
  placementRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  placeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  placeChipActive: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  placeChipText: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textSecondary },
  placeChipTextActive: { color: '#fff' },
  lockedHint: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 8 },
  offHint: { fontSize: 12, color: '#b45309', marginTop: 8 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: adminTheme.colors.background,
    borderTopWidth: 1,
    borderTopColor: adminTheme.colors.borderLight,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: adminTheme.colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
