import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { useOrganizationUiFeaturesStore } from '@/stores/organizationUiFeaturesStore';
import { useStaffTabPinsStore, STAFF_TAB_MAX_PINS } from '@/stores/staffTabPinsStore';
import { buildStaffHamburgerMenuLayout } from '@/lib/staffHamburgerMenu';
import {
  availableToAdd,
  buildStaffCoreTabPinExtras,
  buildStaffOpsTabPinExtras,
  collectTabPinCandidates,
  filterTabPinItemsByQuery,
  resolveShortcutItems,
  seedDefaultTabPinsIfNeeded,
} from '@/lib/staffTabCustomization';
import { isOrgTabPinLocked, mergePinnedIdsWithOrgLocks } from '@/lib/staffTabPinsConfig';
import type { StaffHamburgerMenuItem } from '@/lib/staffHamburgerTypes';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import { hapticSelection } from '@/lib/hapticsSafe';
import { canStaffUseIdCapture } from '@/lib/kbsMrzAccess';

export default function StaffCustomizeTabsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = usePersonelDesign();
  const staff = useAuthStore((s) => s.staff);
  const orgUiConfig = useOrganizationUiFeaturesStore((s) => s.config);
  const accent = colors.indigo;
  const canIdCapture = canStaffUseIdCapture(staff);
  const isAdmin = staff?.role === 'admin';

  const hydratePins = useStaffTabPinsStore((s) => s.hydrate);
  const pinnedIds = useStaffTabPinsStore((s) => s.pinnedIds);
  const hydrated = useStaffTabPinsStore((s) => s.hydrated);
  const togglePin = useStaffTabPinsStore((s) => s.togglePin);
  const movePin = useStaffTabPinsStore((s) => s.movePin);
  const setPinnedOrder = useStaffTabPinsStore((s) => s.setPinnedOrder);

  const [seedDone, setSeedDone] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!staff?.id) return;
    void hydratePins(staff.id);
  }, [staff?.id, hydratePins]);

  const menuLayout = useMemo(() => {
    if (!staff) return null;
    return buildStaffHamburgerMenuLayout(
      t,
      {
        role: staff.role,
        app_permissions: staff.app_permissions,
        hidden_menu_item_ids: staff.hidden_menu_item_ids,
        kbs_access_enabled: staff.kbs_access_enabled,
        department: staff.department,
      },
      orgUiConfig
    );
  }, [
    t,
    staff?.role,
    staff?.app_permissions,
    staff?.hidden_menu_item_ids,
    staff?.kbs_access_enabled,
    staff?.department,
    orgUiConfig,
  ]);

  const extras = useMemo<StaffHamburgerMenuItem[]>(
    () => [
      {
        id: 'tasks',
        label: t('tasks'),
        href: '/staff/tasks',
        icon: 'checkbox-outline',
        accent: '#2563eb',
      },
      {
        id: 'acceptances',
        label: t('acceptances'),
        href: '/staff/(tabs)/acceptances',
        icon: 'document-text-outline',
        accent: '#7c3aed',
      },
      ...buildStaffCoreTabPinExtras(t, { canIdCapture, isAdmin: Boolean(isAdmin) }),
      ...buildStaffOpsTabPinExtras(staff),
    ],
    [t, canIdCapture, isAdmin, staff]
  );

  const available = useMemo(
    () => collectTabPinCandidates(menuLayout, extras),
    [menuLayout, extras]
  );
  const availableIdSet = useMemo(() => new Set(available.map((i) => i.id)), [available]);
  const effectivePinnedIds = useMemo(
    () => mergePinnedIdsWithOrgLocks(pinnedIds, orgUiConfig?.tabPins, availableIdSet),
    [pinnedIds, orgUiConfig?.tabPins, availableIdSet]
  );
  const pinned = useMemo(
    () => resolveShortcutItems(available, effectivePinnedIds),
    [available, effectivePinnedIds]
  );
  const addable = useMemo(
    () => availableToAdd(available, effectivePinnedIds),
    [available, effectivePinnedIds]
  );

  const filteredPinned = useMemo(
    () => filterTabPinItemsByQuery(pinned, searchQuery),
    [pinned, searchQuery]
  );
  const filteredAddable = useMemo(
    () => filterTabPinItemsByQuery(addable, searchQuery),
    [addable, searchQuery]
  );

  useEffect(() => {
    if (!staff?.id || !hydrated || !available.length) return;
    if (effectivePinnedIds.join() === pinnedIds.join()) return;
    void setPinnedOrder(staff.id, effectivePinnedIds);
  }, [staff?.id, hydrated, available.length, effectivePinnedIds, pinnedIds, setPinnedOrder]);

  useEffect(() => {
    if (!staff?.id || !hydrated || seedDone || !available.length) return;
    let cancelled = false;
    void (async () => {
      await seedDefaultTabPinsIfNeeded({
        staffId: staff.id,
        pinnedIds,
        available,
        setPinnedOrder,
        orgDefaultIds: orgUiConfig?.tabPins?.defaultIds,
      });
      if (!cancelled) setSeedDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    staff?.id,
    hydrated,
    seedDone,
    available,
    pinnedIds,
    setPinnedOrder,
    orgUiConfig?.tabPins?.defaultIds,
  ]);

  const onToggle = useCallback(
    async (itemId: string, adding: boolean) => {
      if (!staff?.id) return;
      if (!adding && isOrgTabPinLocked(orgUiConfig?.tabPins, itemId)) {
        Alert.alert(t('error'), 'Bu sekme işletme tarafından kilitli; kaldırılamaz.');
        return;
      }
      if (adding && effectivePinnedIds.length >= STAFF_TAB_MAX_PINS) {
        Alert.alert(t('staffTabPinsFull'));
        return;
      }
      const ok = await togglePin(staff.id, itemId);
      if (adding && !ok) {
        Alert.alert(t('staffTabPinsFull'));
        return;
      }
      hapticSelection();
    },
    [staff?.id, effectivePinnedIds.length, togglePin, t, orgUiConfig?.tabPins]
  );

  const onMove = useCallback(
    async (itemId: string, direction: -1 | 1) => {
      if (!staff?.id) return;
      await movePin(staff.id, itemId, direction);
      hapticSelection();
    },
    [staff?.id, movePin]
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.pageBg, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.cardBg }]}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>{t('staffTabCustomizeTitle')}</Text>
          <Text style={[styles.sub, { color: colors.subtext }]}>
            {t('staffTabCustomizeSubtitle')}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.searchWrap,
          { backgroundColor: colors.cardBg, borderColor: colors.cardBorder },
        ]}
      >
        <Ionicons name="search-outline" size={18} color={colors.subtext} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('staffMenuSearch')}
          placeholderTextColor={colors.subtext}
          style={[styles.searchInput, { color: colors.text }]}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        {searchQuery.length > 0 ? (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.subtext} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.sectionLabel, { color: colors.text }]}>
          {t('staffTabPinsYours')} ({pinned.length}/{STAFF_TAB_MAX_PINS})
        </Text>
        {pinned.length === 0 ? (
          <Text style={[styles.emptyHint, { color: colors.subtext, marginBottom: 16 }]}>
            {t('staffTabPinsEmptyHint')}
          </Text>
        ) : filteredPinned.length === 0 ? (
          <Text style={[styles.emptyHint, { color: colors.subtext, marginBottom: 16 }]}>
            {t('staffMenuSearchEmpty')}
          </Text>
        ) : (
          <View style={styles.editList}>
            {filteredPinned.map((item) => {
              const index = pinned.findIndex((p) => p.id === item.id);
              const locked = isOrgTabPinLocked(orgUiConfig?.tabPins, item.id);
              return (
                <View
                  key={item.id}
                  style={[
                    styles.editRow,
                    { backgroundColor: colors.cardBg, borderColor: colors.cardBorder },
                  ]}
                >
                  <View style={[styles.iconWrapSm, { backgroundColor: `${item.accent}18` }]}>
                    <Ionicons name={item.icon} size={18} color={item.accent} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.editLabel, { color: colors.text }]} numberOfLines={1}>
                      {item.label}
                    </Text>
                    {locked ? (
                      <Text style={{ fontSize: 11, color: colors.subtext, marginTop: 2 }}>
                        İşletme kilitli
                      </Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    onPress={() => void onMove(item.id, -1)}
                    disabled={index <= 0 || locked}
                    style={[styles.iconBtn, (index <= 0 || locked) && styles.iconBtnDisabled]}
                    hitSlop={8}
                  >
                    <Ionicons name="chevron-up" size={18} color={colors.subtext} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void onMove(item.id, 1)}
                    disabled={locked || index < 0 || index >= pinned.length - 1}
                    style={[
                      styles.iconBtn,
                      (locked || index < 0 || index >= pinned.length - 1) && styles.iconBtnDisabled,
                    ]}
                    hitSlop={8}
                  >
                    <Ionicons name="chevron-down" size={18} color={colors.subtext} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void onToggle(item.id, false)}
                    style={[styles.removeBtn, locked && { opacity: 0.4 }]}
                    hitSlop={8}
                    disabled={locked}
                  >
                    <Text style={styles.removeBtnText}>
                      {locked ? 'Kilitli' : t('staffTabPinsRemove')}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        <Text style={[styles.sectionLabel, { color: colors.text, marginTop: 8 }]}>
          {t('staffTabPinsAvailable')}
        </Text>
        {addable.length === 0 ? (
          <Text style={[styles.emptyHint, { color: colors.subtext }]}>
            {pinned.length >= STAFF_TAB_MAX_PINS
              ? t('staffTabPinsFull')
              : t('staffMenuSearchEmpty')}
          </Text>
        ) : filteredAddable.length === 0 ? (
          <Text style={[styles.emptyHint, { color: colors.subtext }]}>
            {t('staffMenuSearchEmpty')}
          </Text>
        ) : (
          <View style={styles.editList}>
            {filteredAddable.map((item) => (
              <View
                key={item.id}
                style={[
                  styles.editRow,
                  { backgroundColor: colors.cardBg, borderColor: colors.cardBorder },
                ]}
              >
                <View style={[styles.iconWrapSm, { backgroundColor: `${item.accent}18` }]}>
                  <Ionicons name={item.icon} size={18} color={item.accent} />
                </View>
                <Text style={[styles.editLabel, { color: colors.text }]} numberOfLines={1}>
                  {item.label}
                </Text>
                <TouchableOpacity
                  onPress={() => void onToggle(item.id, true)}
                  style={[styles.addBtn, { backgroundColor: `${accent}18` }]}
                  hitSlop={8}
                >
                  <Text style={[styles.addBtnText, { color: accent }]}>{t('staffTabPinsAdd')}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  scroll: { paddingHorizontal: 16 },
  sectionLabel: { fontSize: 14, fontWeight: '800', marginBottom: 10 },
  emptyHint: { fontSize: 13, lineHeight: 18 },
  editList: { gap: 8, marginBottom: 16 },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  iconWrapSm: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editLabel: { flex: 1, fontWeight: '700', fontSize: 14 },
  iconBtn: { padding: 4 },
  iconBtnDisabled: { opacity: 0.3 },
  removeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
  },
  removeBtnText: { color: '#dc2626', fontWeight: '800', fontSize: 12 },
  addBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addBtnText: { fontWeight: '800', fontSize: 12 },
});
