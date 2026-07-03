import { useCallback, useState } from 'react';
import { useCachedList } from '@/hooks/useCachedList';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { canManageMissingItemsCatalog } from '@/lib/staffPermissions';
import { getMissingAreaMeta, type MissingItemArea } from '@/lib/missingItemsCatalog';
import {
  deleteMissingCatalogCategory,
  deleteMissingCatalogItem,
  fetchMissingItemCatalogForEditor,
  seedMissingItemCatalogFromDefaults,
  upsertMissingCatalogCategory,
  upsertMissingCatalogItem,
  type MissingCatalogEditorCategory,
} from '@/lib/missingItemsCatalogDb';

const ICON_OPTIONS = ['cube', 'bed', 'restaurant', 'nutrition', 'shirt', 'sparkles', 'wine', 'water', 'construct', 'business'] as const;

function parseArea(raw: string | string[] | undefined): MissingItemArea | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === 'kitchen' || v === 'hotel') return v;
  return null;
}

export default function MissingItemsCatalogEditorScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { staff } = useAuthStore();
  const { area: areaParam } = useLocalSearchParams<{ area: string }>();
  const area = parseArea(areaParam);
  const meta = area ? getMissingAreaMeta(area) : null;
  const canManage = canManageMissingItemsCatalog(staff);

  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [newCatTitle, setNewCatTitle] = useState('');
  const [newCatIcon, setNewCatIcon] = useState<(typeof ICON_OPTIONS)[number]>('cube');
  const [newItemLabels, setNewItemLabels] = useState<Record<string, string>>({});

  const fetchItems = useCallback(async () => {
    if (!area) return [];
    await seedMissingItemCatalogFromDefaults(area);
    const res = await fetchMissingItemCatalogForEditor(area);
    if (res.error) Alert.alert(t('error'), res.error);
    return res.data;
  }, [area, t]);

  const { items: categories, loading, load } = useCachedList<MissingCatalogEditorCategory>({
    cacheKey: area ? `missing-items-catalog:${area}` : 'missing-items-catalog:none',
    enabled: !!area && canManage,
    fetchItems,
  });

  if (!area || !meta) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>{t('missingItemsInvalidArea')}</Text>
      </View>
    );
  }

  if (!canManage) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>{t('missingItemsCatalogNoPermission')}</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>{t('missingItemsGoBack')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const addCategory = async () => {
    const title = newCatTitle.trim();
    if (!title) {
      Alert.alert(t('missingInfo'), t('missingItemsCatalogCategoryRequired'));
      return;
    }
    setSaving(true);
    const slug = `cat_${Date.now().toString(36)}`;
    const res = await upsertMissingCatalogCategory({
      area,
      slug,
      title,
      icon: newCatIcon,
      sortOrder: categories.length,
    });
    setSaving(false);
    if (res.error) {
      Alert.alert(t('error'), res.error);
      return;
    }
    setNewCatTitle('');
    void load();
  };

  const saveCategoryTitle = async (cat: MissingCatalogEditorCategory, title: string) => {
    const trimmed = title.trim();
    if (!trimmed || trimmed === cat.title) return;
    setSaving(true);
    const res = await upsertMissingCatalogCategory({
      area,
      slug: cat.id,
      title: trimmed,
      icon: cat.icon,
      sortOrder: categories.indexOf(cat),
      existingCategoryUuid: cat.dbId,
    });
    setSaving(false);
    if (res.error) Alert.alert(t('error'), res.error);
    else void load();
  };

  const removeCategory = (cat: MissingCatalogEditorCategory) => {
    Alert.alert(t('missingItemsCatalogDeleteCategory'), cat.title, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          const res = await deleteMissingCatalogCategory(cat.dbId);
          setSaving(false);
          if (res.error) Alert.alert(t('error'), res.error);
          else void load();
        },
      },
    ]);
  };

  const addItem = async (cat: MissingCatalogEditorCategory) => {
    const label = (newItemLabels[cat.dbId] ?? '').trim();
    if (!label) {
      Alert.alert(t('missingInfo'), t('missingItemsCatalogItemRequired'));
      return;
    }
    const itemKey = `item_${Date.now().toString(36)}`;
    setSaving(true);
    const res = await upsertMissingCatalogItem({
      categoryUuid: cat.dbId,
      itemKey,
      label,
      sortOrder: cat.items.length,
    });
    setSaving(false);
    if (res.error) {
      Alert.alert(t('error'), res.error);
      return;
    }
    setNewItemLabels((prev) => ({ ...prev, [cat.dbId]: '' }));
    void load();
  };

  const saveItemLabel = async (cat: MissingCatalogEditorCategory, itemDbId: string, label: string) => {
    const trimmed = label.trim();
    const item = cat.items.find((i) => i.dbId === itemDbId);
    if (!item || !trimmed || trimmed === item.label) return;
    setSaving(true);
    const res = await upsertMissingCatalogItem({
      categoryUuid: cat.dbId,
      itemKey: item.key,
      label: trimmed,
      sortOrder: cat.items.indexOf(item),
      existingItemUuid: itemDbId,
    });
    setSaving(false);
    if (res.error) Alert.alert(t('error'), res.error);
    else void load();
  };

  const removeItem = (cat: MissingCatalogEditorCategory, itemDbId: string, label: string) => {
    Alert.alert(t('missingItemsCatalogDeleteItem'), label, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          const res = await deleteMissingCatalogItem(itemDbId);
          setSaving(false);
          if (res.error) Alert.alert(t('error'), res.error);
          else void load();
        },
      },
    ]);
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.hero, { borderLeftColor: meta.color }]}>
        <Text style={styles.heroTitle}>{t('missingItemsCatalogEditorTitle', { area: meta.title })}</Text>
        <Text style={styles.heroSub}>{t('missingItemsCatalogEditorSub')}</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={meta.color} style={{ marginTop: 32 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.addCatCard}>
            <Text style={styles.sectionLabel}>{t('missingItemsCatalogNewCategory')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('missingItemsCatalogCategoryPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              value={newCatTitle}
              onChangeText={setNewCatTitle}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconRow}>
              {ICON_OPTIONS.map((icon) => (
                <TouchableOpacity
                  key={icon}
                  style={[styles.iconChip, newCatIcon === icon && { backgroundColor: meta.color, borderColor: meta.color }]}
                  onPress={() => setNewCatIcon(icon)}
                >
                  <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color={newCatIcon === icon ? '#fff' : theme.colors.textMuted} />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: meta.color }, saving && styles.disabled]}
              onPress={() => void addCategory()}
              disabled={saving}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.primaryBtnText}>{t('missingItemsCatalogAddCategory')}</Text>
            </TouchableOpacity>
          </View>

          {categories.map((cat) => {
            const isOpen = expanded[cat.dbId] ?? true;
            return (
              <View key={cat.dbId} style={styles.catCard}>
                <TouchableOpacity style={styles.catHeader} onPress={() => setExpanded((p) => ({ ...p, [cat.dbId]: !isOpen }))}>
                  <Ionicons name={cat.icon as keyof typeof Ionicons.glyphMap} size={20} color={meta.color} />
                  <Text style={styles.catTitle} numberOfLines={1}>
                    {cat.title}
                  </Text>
                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
                </TouchableOpacity>

                {isOpen ? (
                  <View style={styles.catBody}>
                    <Text style={styles.fieldLabel}>{t('missingItemsCatalogRenameCategory')}</Text>
                    <CatalogInlineInput initial={cat.title} onCommit={(v) => void saveCategoryTitle(cat, v)} />

                    <TouchableOpacity style={styles.dangerLink} onPress={() => removeCategory(cat)}>
                      <Text style={styles.dangerText}>{t('missingItemsCatalogDeleteCategory')}</Text>
                    </TouchableOpacity>

                    {cat.items.map((item) =>
                      item.dbId ? (
                        <View key={item.dbId} style={styles.itemRow}>
                          <CatalogInlineInput
                            initial={item.label}
                            onCommit={(v) => void saveItemLabel(cat, item.dbId!, v)}
                          />
                          <TouchableOpacity onPress={() => removeItem(cat, item.dbId!, item.label)} hitSlop={8}>
                            <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                          </TouchableOpacity>
                        </View>
                      ) : null
                    )}

                    <View style={styles.addItemRow}>
                      <TextInput
                        style={[styles.input, styles.itemInput]}
                        placeholder={t('missingItemsCatalogItemPlaceholder')}
                        placeholderTextColor={theme.colors.textMuted}
                        value={newItemLabels[cat.dbId] ?? ''}
                        onChangeText={(v) => setNewItemLabels((p) => ({ ...p, [cat.dbId]: v }))}
                      />
                      <TouchableOpacity
                        style={[styles.addItemBtn, { backgroundColor: meta.color }]}
                        onPress={() => void addItem(cat)}
                        disabled={saving}
                      >
                        <Ionicons name="add" size={22} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function CatalogInlineInput({ initial, onCommit }: { initial: string; onCommit: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={setValue}
      onBlur={() => onCommit(value)}
      placeholderTextColor={theme.colors.textMuted}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: theme.colors.textMuted, textAlign: 'center' },
  backBtn: { marginTop: 16 },
  backBtnText: { color: theme.colors.primary, fontWeight: '700' },
  hero: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.lg,
    borderLeftWidth: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  heroTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  heroSub: { fontSize: 13, color: theme.colors.textMuted, marginTop: 6, lineHeight: 18 },
  scroll: { padding: theme.spacing.lg, paddingBottom: 40 },
  addCatCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sectionLabel: { fontSize: 14, fontWeight: '700', marginBottom: 8, color: theme.colors.text },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 12,
    fontSize: 15,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    marginBottom: 10,
  },
  iconRow: { marginBottom: 12, maxHeight: 44 },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: 8,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  disabled: { opacity: 0.6 },
  catCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  catHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  catTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: theme.colors.text },
  catBody: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted, marginBottom: 6 },
  dangerLink: { marginVertical: 8 },
  dangerText: { color: theme.colors.error, fontWeight: '700', fontSize: 13 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  itemInput: { flex: 1, marginBottom: 0 },
  addItemRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 },
  addItemBtn: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
