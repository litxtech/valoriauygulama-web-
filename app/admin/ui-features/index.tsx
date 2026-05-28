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
  type OrganizationUiFeaturesConfig,
} from '@/lib/organizationUiFeatures';
import { useOrganizationUiFeaturesStore } from '@/stores/organizationUiFeaturesStore';

const PLACEMENTS: AppFeaturePlacement[] = ['tab', 'profile', 'hamburger', 'header_left', 'header_right'];

export default function AdminUiFeaturesScreen() {
  const { staff, canUseAll, orgScoped, canQuery } = useAdminOrganizationQueryScope();
  const insets = useSafeAreaInsets();
  const reloadStore = useOrganizationUiFeaturesStore((s) => s.load);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<OrganizationUiFeaturesConfig | null>(null);
  const [audience, setAudience] = useState<AppFeatureAudience>('staff');
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

  const entries = useMemo(() => {
    const list = catalogForAudience(audience);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((e) => e.labelTr.toLowerCase().includes(q) || e.id.toLowerCase().includes(q));
  }, [audience, query]);

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

        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Özellik ara..."
          placeholderTextColor={adminTheme.colors.textMuted}
        />

        {entries.map((entry) => {
          const fc = config?.features[entry.id];
          const enabled = fc?.enabled ?? entry.defaultEnabled;
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
