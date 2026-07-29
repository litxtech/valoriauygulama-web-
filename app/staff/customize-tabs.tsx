import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
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
  collectTabPinCandidates,
  resolveShortcutItems,
  seedDefaultTabPinsIfNeeded,
} from '@/lib/staffTabCustomization';
import type { StaffHamburgerMenuItem } from '@/lib/staffHamburgerTypes';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import { hapticSelection } from '@/lib/hapticsSafe';

export default function StaffCustomizeTabsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = usePersonelDesign();
  const staff = useAuthStore((s) => s.staff);
  const orgUiConfig = useOrganizationUiFeaturesStore((s) => s.config);
  const accent = colors.indigo;

  const hydratePins = useStaffTabPinsStore((s) => s.hydrate);
  const pinnedIds = useStaffTabPinsStore((s) => s.pinnedIds);
  const hydrated = useStaffTabPinsStore((s) => s.hydrated);
  const togglePin = useStaffTabPinsStore((s) => s.togglePin);
  const movePin = useStaffTabPinsStore((s) => s.movePin);
  const setPinnedOrder = useStaffTabPinsStore((s) => s.setPinnedOrder);

  const [seedDone, setSeedDone] = useState(false);

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
    ],
    [t]
  );

  const available = useMemo(
    () => collectTabPinCandidates(menuLayout, extras),
    [menuLayout, extras]
  );
  const pinned = useMemo(
    () => resolveShortcutItems(available, pinnedIds),
    [available, pinnedIds]
  );
  const addable = useMemo(() => availableToAdd(available, pinnedIds), [available, pinnedIds]);

  useEffect(() => {
    if (!staff?.id || !hydrated || seedDone || !available.length) return;
    let cancelled = false;
    void (async () => {
      await seedDefaultTabPinsIfNeeded({
        staffId: staff.id,
        pinnedIds,
        available,
        setPinnedOrder,
      });
      if (!cancelled) setSeedDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [staff?.id, hydrated, seedDone, available, pinnedIds, setPinnedOrder]);

  const onToggle = useCallback(
    async (itemId: string, adding: boolean) => {
      if (!staff?.id) return;
      if (adding && pinnedIds.length >= STAFF_TAB_MAX_PINS) {
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
    [staff?.id, pinnedIds.length, togglePin, t]
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

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionLabel, { color: colors.text }]}>
          {t('staffTabPinsYours')} ({pinned.length}/{STAFF_TAB_MAX_PINS})
        </Text>
        {pinned.length === 0 ? (
          <Text style={[styles.emptyHint, { color: colors.subtext, marginBottom: 16 }]}>
            {t('staffTabPinsEmptyHint')}
          </Text>
        ) : (
          <View style={styles.editList}>
            {pinned.map((item, index) => (
              <View
                key={item.id}
                style={[styles.editRow, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
              >
                <View style={[styles.iconWrapSm, { backgroundColor: `${item.accent}18` }]}>
                  <Ionicons name={item.icon} size={18} color={item.accent} />
                </View>
                <Text style={[styles.editLabel, { color: colors.text }]} numberOfLines={1}>
                  {item.label}
                </Text>
                <TouchableOpacity
                  onPress={() => void onMove(item.id, -1)}
                  disabled={index === 0}
                  style={[styles.iconBtn, index === 0 && styles.iconBtnDisabled]}
                  hitSlop={8}
                >
                  <Ionicons name="chevron-up" size={18} color={colors.subtext} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void onMove(item.id, 1)}
                  disabled={index === pinned.length - 1}
                  style={[
                    styles.iconBtn,
                    index === pinned.length - 1 && styles.iconBtnDisabled,
                  ]}
                  hitSlop={8}
                >
                  <Ionicons name="chevron-down" size={18} color={colors.subtext} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void onToggle(item.id, false)}
                  style={styles.removeBtn}
                  hitSlop={8}
                >
                  <Text style={styles.removeBtnText}>{t('staffTabPinsRemove')}</Text>
                </TouchableOpacity>
              </View>
            ))}
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
        ) : (
          <View style={styles.editList}>
            {addable.map((item) => (
              <View
                key={item.id}
                style={[styles.editRow, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
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
