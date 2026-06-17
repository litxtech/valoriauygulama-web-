import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import {
  mergeOrganizationUiFeatures,
  normalizeOrganizationUiFeatures,
  type OrganizationUiFeaturesConfig,
} from '@/lib/organizationUiFeatures';
import {
  DEFAULT_HAMBURGER_SECTION_ORDER,
  deriveDefaultHamburgerLayout,
  moveInList,
  swapInList,
  type StaffHamburgerLayoutConfig,
} from '@/lib/staffHamburgerLayoutConfig';
import { defaultStaffHamburgerTheme, hamburgerThemeColorErrors, themeToPayload } from '@/lib/staffHamburgerTheme';
import { HamburgerMenuDesignPanel } from '@/components/admin/hamburgerMenu/HamburgerMenuDesignPanel';
import { HamburgerMenuLivePreview } from '@/components/admin/hamburgerMenu/HamburgerMenuLivePreview';
import {
  STAFF_HAMBURGER_HUB_ITEM_IDS,
  buildStaffHamburgerMenuLayout,
  buildStaffHamburgerMenuSections,
  type StaffHamburgerStaff,
} from '@/lib/staffHamburgerMenu';
import { STAFF_MENU_CATALOG, STAFF_MENU_SECTION_LABELS_TR, normalizeHiddenMenuItemIds } from '@/lib/staffMenuCatalog';
import { useOrganizationUiFeaturesStore } from '@/stores/organizationUiFeaturesStore';

type PreviewStaffRow = {
  id: string;
  full_name: string | null;
  role: string;
  department: string | null;
  app_permissions: Record<string, boolean> | null;
  hidden_menu_item_ids: unknown;
};

const PRIMARY_OPTIONS: { id: string | null; label: string }[] = [
  { id: 'emergency', label: 'Acil durum (varsayılan)' },
  { id: 'kitchen_ops', label: 'Mutfak operasyonları' },
  { id: null, label: 'Üst buton yok' },
];

const HUB_LABELS: Record<string, string> = {
  payments_hub: 'Tahsilat merkezi',
  fnb_hub: 'F&B Merkezi',
  admin_tab: 'Yönetim sekmesi',
  kitchen_ops: 'Mutfak operasyonları',
};

function staffFromRow(row: PreviewStaffRow): StaffHamburgerStaff {
  return {
    role: row.role,
    department: row.department,
    app_permissions: row.app_permissions ?? undefined,
    hidden_menu_item_ids: normalizeHiddenMenuItemIds(row.hidden_menu_item_ids),
    kbs_access_enabled: true,
  };
}

function catalogLabel(itemId: string, runtimeLabel?: string) {
  return STAFF_MENU_CATALOG.find((e) => e.id === itemId)?.labelTr ?? runtimeLabel ?? itemId;
}

export default function AdminHamburgerMenuScreen() {
  const { t } = useTranslation();
  const { staff, canUseAll, orgScoped, canQuery } = useAdminOrganizationQueryScope();
  const insets = useSafeAreaInsets();
  const reloadStore = useOrganizationUiFeaturesStore((s) => s.load);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullConfig, setFullConfig] = useState<OrganizationUiFeaturesConfig | null>(null);
  const [layout, setLayout] = useState<StaffHamburgerLayoutConfig>({});
  const [previewStaffId, setPreviewStaffId] = useState<string | null>(null);
  const [staffOptions, setStaffOptions] = useState<PreviewStaffRow[]>([]);
  const [activeTab, setActiveTab] = useState<'layout' | 'design'>('layout');

  const load = useCallback(async () => {
    if (!canQuery || !orgScoped) {
      setLoading(false);
      return;
    }
    const [{ data: orgData, error: orgErr }, { data: staffRows, error: staffErr }] = await Promise.all([
      supabase.from('organizations').select('ui_features').eq('id', orgScoped).maybeSingle(),
      supabase
        .from('staff')
        .select('id, full_name, role, department, app_permissions, hidden_menu_item_ids')
        .eq('organization_id', orgScoped)
        .is('deleted_at', null)
        .order('full_name'),
    ]);
    if (orgErr || staffErr) {
      Alert.alert('Hata', orgErr?.message ?? staffErr?.message ?? 'Yüklenemedi');
      setFullConfig(mergeOrganizationUiFeatures(null));
      setLayout({});
      setLoading(false);
      return;
    }
    const merged = mergeOrganizationUiFeatures(normalizeOrganizationUiFeatures(orgData?.ui_features));
    setFullConfig(merged);
    if (merged.hamburger?.sectionOrder?.length || merged.hamburger?.itemOrder?.length) {
      setLayout(merged.hamburger);
    } else {
      setLayout({});
    }
    const rows = (staffRows ?? []) as PreviewStaffRow[];
    setStaffOptions(rows);
    const defaultPreview = staff?.id && rows.some((r) => r.id === staff.id) ? staff.id : rows[0]?.id ?? null;
    setPreviewStaffId((prev) => prev ?? defaultPreview);
    setLoading(false);
  }, [canQuery, orgScoped, staff?.id]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const previewStaff = useMemo(
    () => staffOptions.find((r) => r.id === previewStaffId) ?? null,
    [previewStaffId, staffOptions]
  );

  const previewOrgConfig = useMemo(
    (): OrganizationUiFeaturesConfig | null =>
      fullConfig ? { ...fullConfig, hamburger: layout } : null,
    [fullConfig, layout]
  );

  /** Düzenleyicide gizli öğeler de listede kalsın (sadece sıra uygulanır) */
  const editorOrgConfig = useMemo((): OrganizationUiFeaturesConfig | null => {
    if (!fullConfig) return null;
    return {
      ...fullConfig,
      hamburger: {
        ...layout,
        hiddenItemIds: [],
      },
    };
  }, [fullConfig, layout]);

  const previewMenu = useMemo(() => {
    if (!previewStaff) return null;
    return buildStaffHamburgerMenuLayout(t, staffFromRow(previewStaff), previewOrgConfig);
  }, [previewStaff, previewOrgConfig, t]);

  const editorMenu = useMemo(() => {
    if (!previewStaff) return null;
    return buildStaffHamburgerMenuLayout(t, staffFromRow(previewStaff), editorOrgConfig);
  }, [previewStaff, editorOrgConfig, t]);

  useEffect(() => {
    if (!previewStaff || loading || !fullConfig) return;
    setLayout((prev) => {
      if (prev.sectionOrder?.length || prev.itemOrder?.length) return prev;
      if (fullConfig.hamburger?.sectionOrder?.length || fullConfig.hamburger?.itemOrder?.length) {
        return { ...fullConfig.hamburger };
      }
      const sections = buildStaffHamburgerMenuSections(t, staffFromRow(previewStaff), fullConfig);
      return deriveDefaultHamburgerLayout(sections);
    });
  }, [previewStaff, loading, fullConfig, t]);

  const sectionOrder = layout.sectionOrder?.length ? layout.sectionOrder : [...DEFAULT_HAMBURGER_SECTION_ORDER];
  const itemOrder = layout.itemOrder ?? [];
  const hiddenSet = useMemo(() => new Set(layout.hiddenItemIds ?? []), [layout.hiddenItemIds]);

  const sectionsForEditor = useMemo(() => {
    if (!editorMenu) return [];
    const runtimeSections = editorMenu.sections;
    const byId = new Map(runtimeSections.map((s) => [s.id, s]));
    return sectionOrder
      .map((sid) => byId.get(sid as (typeof runtimeSections)[number]['id']))
      .filter(Boolean)
      .map((section) => {
        const ids = section!.items.map((i) => i.id);
        const orderedIds = [...ids].sort((a, b) => {
          const ra = itemOrder.indexOf(a);
          const rb = itemOrder.indexOf(b);
          return (ra >= 0 ? ra : 9999) - (rb >= 0 ? rb : 9999);
        });
        return {
          ...section!,
          items: orderedIds.map((id) => section!.items.find((i) => i.id === id)!).filter(Boolean),
        };
      });
  }, [editorMenu, sectionOrder, itemOrder]);

  const toggleOrgHidden = (itemId: string) => {
    setLayout((prev) => {
      const hidden = new Set(prev.hiddenItemIds ?? []);
      if (hidden.has(itemId)) hidden.delete(itemId);
      else hidden.add(itemId);
      return { ...prev, hiddenItemIds: [...hidden] };
    });
  };

  const moveSection = (sectionId: string, dir: -1 | 1) => {
    setLayout((prev) => ({
      ...prev,
      sectionOrder: moveInList(prev.sectionOrder?.length ? prev.sectionOrder : [...DEFAULT_HAMBURGER_SECTION_ORDER], sectionId, dir),
    }));
  };

  const moveItem = (sectionId: string, itemId: string, dir: -1 | 1) => {
    const section = sectionsForEditor.find((s) => s.id === sectionId);
    if (!section) return;
    const ids = section.items.map((i) => i.id);
    const idx = ids.indexOf(itemId);
    const targetIdx = idx + dir;
    if (idx < 0 || targetIdx < 0 || targetIdx >= ids.length) return;
    const targetId = ids[targetIdx];
    setLayout((prev) => {
      const baseOrder = prev.itemOrder?.length ? [...prev.itemOrder] : sectionsForEditor.flatMap((s) => s.items.map((i) => i.id));
      return { ...prev, itemOrder: swapInList(baseOrder, itemId, targetId) };
    });
  };

  const moveHub = (hubId: string, dir: -1 | 1) => {
    setLayout((prev) => {
      const base = prev.hubItemIds?.length ? [...prev.hubItemIds] : [...STAFF_HAMBURGER_HUB_ITEM_IDS];
      return { ...prev, hubItemIds: moveInList(base, hubId, dir) };
    });
  };

  const save = async () => {
    if (!orgScoped || !fullConfig) return;
    const themeErrors = hamburgerThemeColorErrors(layout.theme ?? {});
    if (themeErrors.length) {
      Alert.alert('Renk hatası', themeErrors.join('\n'));
      return;
    }
    setSaving(true);
    const nextLayout: StaffHamburgerLayoutConfig = {
      ...layout,
      theme: themeToPayload(layout.theme ?? defaultStaffHamburgerTheme()),
    };
    const nextConfig: OrganizationUiFeaturesConfig = { ...fullConfig, hamburger: nextLayout };
    const { error } = await supabase.from('organizations').update({ ui_features: nextConfig }).eq('id', orgScoped);
    setSaving(false);
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    setFullConfig(nextConfig);
    setLayout(nextLayout);
    await reloadStore(orgScoped);
    Alert.alert(
      'Kaydedildi',
      'Hamburger menü düzeni güncellendi. Açık personel uygulamalarına anlık yansır (build gerekmez).'
    );
  };

  const resetLayout = () => {
    if (!previewStaff) return;
    const sections = buildStaffHamburgerMenuSections(t, staffFromRow(previewStaff), previewOrgConfig);
    setLayout({ ...deriveDefaultHamburgerLayout(sections), theme: defaultStaffHamburgerTheme() });
  };

  const setTheme = (theme: StaffHamburgerLayoutConfig['theme']) => {
    setLayout((prev) => ({ ...prev, theme }));
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
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}>
        <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={staff?.organization_id} />
        {!orgScoped ? (
          <Text style={styles.intro}>Üstten işletme seçin.</Text>
        ) : (
          <>
            <Text style={styles.intro}>
              Personel hamburger menüsünün sırasını, renklerini ve düzenini buradan yönetin. Değişiklikler build almadan
              anlık yansır.
            </Text>

            <TouchableOpacity
              style={styles.uiFeaturesLink}
              onPress={() => router.push('/admin/ui-features' as never)}
              activeOpacity={0.88}
            >
              <Ionicons name="options-outline" size={20} color={adminTheme.colors.primary} />
              <Text style={styles.uiFeaturesLinkText}>Özellik görünürlüğü ayarlarına dön</Text>
              <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.textMuted} />
            </TouchableOpacity>

            <View style={styles.tabRow}>
              {(
                [
                  ['layout', 'Düzen & gizleme'],
                  ['design', 'Tasarım & renkler'],
                ] as const
              ).map(([id, label]) => (
                <TouchableOpacity
                  key={id}
                  style={[styles.tabBtn, activeTab === id && styles.tabBtnActive]}
                  onPress={() => setActiveTab(id)}
                >
                  <Text style={[styles.tabBtnText, activeTab === id && styles.tabBtnTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.blockTitle}>Canlı önizleme</Text>
            <HamburgerMenuLivePreview themeConfig={layout.theme} menuLayout={previewMenu} />

            <Text style={styles.blockTitle}>Önizleme personeli</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {staffOptions.map((row) => (
                <TouchableOpacity
                  key={row.id}
                  style={[styles.chip, previewStaffId === row.id && styles.chipActive]}
                  onPress={() => setPreviewStaffId(row.id)}
                >
                  <Text style={[styles.chipText, previewStaffId === row.id && styles.chipTextActive]}>
                    {row.full_name?.trim() || row.role}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {activeTab === 'design' ? (
              <HamburgerMenuDesignPanel theme={layout.theme ?? defaultStaffHamburgerTheme()} onChange={setTheme} />
            ) : (
              <>
            <Text style={styles.blockTitle}>Üst birincil buton</Text>
            <View style={styles.chipRowWrap}>
              {PRIMARY_OPTIONS.map((opt) => {
                const active =
                  (layout.primaryItemId === undefined && opt.id === 'emergency') ||
                  layout.primaryItemId === opt.id;
                return (
                  <TouchableOpacity
                    key={String(opt.id)}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setLayout((prev) => ({ ...prev, primaryItemId: opt.id }))}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.blockTitle}>Hub kart sırası</Text>
            {(layout.hubItemIds?.length ? layout.hubItemIds : [...STAFF_HAMBURGER_HUB_ITEM_IDS]).map((hubId, idx, arr) => (
              <View key={hubId} style={styles.row}>
                <Text style={styles.rowLabel}>{HUB_LABELS[hubId] ?? hubId}</Text>
                <View style={styles.rowActions}>
                  <TouchableOpacity style={styles.iconBtn} disabled={idx === 0} onPress={() => moveHub(hubId, -1)}>
                    <Ionicons name="chevron-up" size={20} color={adminTheme.colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    disabled={idx === arr.length - 1}
                    onPress={() => moveHub(hubId, 1)}
                  >
                    <Ionicons name="chevron-down" size={20} color={adminTheme.colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <Text style={styles.blockTitle}>Menü bölümleri ve öğeler</Text>
            {sectionsForEditor.map((section, sIdx) => (
              <View key={section.id} style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>
                    {STAFF_MENU_SECTION_LABELS_TR[section.id as keyof typeof STAFF_MENU_SECTION_LABELS_TR] ??
                      section.title}
                  </Text>
                  <View style={styles.rowActions}>
                    <TouchableOpacity style={styles.iconBtn} disabled={sIdx === 0} onPress={() => moveSection(section.id, -1)}>
                      <Ionicons name="chevron-up" size={20} color={adminTheme.colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      disabled={sIdx === sectionsForEditor.length - 1}
                      onPress={() => moveSection(section.id, 1)}
                    >
                      <Ionicons name="chevron-down" size={20} color={adminTheme.colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
                {section.items.map((item, iIdx) => {
                  const orgHidden = hiddenSet.has(item.id);
                  return (
                    <View key={item.id} style={[styles.row, orgHidden && styles.rowHidden]}>
                      <View style={styles.rowMain}>
                        <Text style={styles.rowLabel}>{catalogLabel(item.id, item.label)}</Text>
                        <Text style={styles.rowMeta}>{item.id}</Text>
                      </View>
                      <View style={styles.rowActions}>
                        <TouchableOpacity
                          style={[styles.hideBtn, orgHidden && styles.hideBtnActive]}
                          onPress={() => toggleOrgHidden(item.id)}
                        >
                          <Ionicons name={orgHidden ? 'eye-off' : 'eye-outline'} size={18} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.iconBtn}
                          disabled={iIdx === 0}
                          onPress={() => moveItem(section.id, item.id, -1)}
                        >
                          <Ionicons name="arrow-up" size={18} color={adminTheme.colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.iconBtn}
                          disabled={iIdx === section.items.length - 1}
                          onPress={() => moveItem(section.id, item.id, 1)}
                        >
                          <Ionicons name="arrow-down" size={18} color={adminTheme.colors.primary} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}

            {previewMenu?.primary ? (
              <View style={styles.previewBox}>
                <Text style={styles.previewTitle}>Önizleme — üst buton</Text>
                <Text style={styles.previewItem}>{catalogLabel(previewMenu.primary.id, previewMenu.primary.label)}</Text>
              </View>
            ) : null}

            <TouchableOpacity style={styles.linkBtn} onPress={() => router.push('/admin/staff/list')}>
              <Ionicons name="people-outline" size={18} color={adminTheme.colors.primary} />
              <Text style={styles.linkBtnText}>Kullanıcı bazlı menü gizleme (personel listesi)</Text>
            </TouchableOpacity>
              </>
            )}
          </>
        )}
      </ScrollView>

      {orgScoped ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={resetLayout}>
            <Text style={styles.secondaryBtnText}>Varsayılana dön</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={() => void save()} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Kaydet</Text>}
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  scroll: { padding: 16, gap: 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  intro: { color: adminTheme.colors.textMuted, fontSize: 14, lineHeight: 20 },
  uiFeaturesLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.borderLight,
  },
  uiFeaturesLinkText: { flex: 1, fontSize: 14, fontWeight: '600', color: adminTheme.colors.text },
  tabRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  tabBtnActive: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  tabBtnText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.text },
  tabBtnTextActive: { color: '#fff' },
  blockTitle: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text, marginTop: 8 },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  chipActive: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  chipText: { color: adminTheme.colors.text, fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  sectionCard: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.border,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: adminTheme.colors.border,
  },
  rowHidden: { opacity: 0.45 },
  rowMain: { flex: 1, paddingRight: 8 },
  rowLabel: { fontSize: 14, color: adminTheme.colors.text, fontWeight: '500' },
  rowMeta: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 2 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { padding: 6 },
  hideBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: adminTheme.colors.textMuted,
  },
  hideBtnActive: { backgroundColor: '#b45309' },
  previewBox: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  previewTitle: { fontSize: 12, color: adminTheme.colors.textMuted, marginBottom: 4 },
  previewItem: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.text },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  linkBtnText: { color: adminTheme.colors.primary, fontSize: 14, fontWeight: '600' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: adminTheme.colors.border,
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  secondaryBtnText: { color: adminTheme.colors.text, fontWeight: '600' },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: adminTheme.colors.primary,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
