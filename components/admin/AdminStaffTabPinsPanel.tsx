import { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import { moveInList } from '@/lib/staffHamburgerLayoutConfig';
import { STAFF_MENU_CATALOG } from '@/lib/staffMenuCatalog';
import { STAFF_TAB_MAX_PINS } from '@/stores/staffTabPinsStore';
import { DEFAULT_TAB_PIN_IDS } from '@/lib/staffTabCustomization';
import type { StaffTabPinsConfig } from '@/lib/staffTabPinsConfig';
import type { StaffHamburgerMenuItem } from '@/lib/staffHamburgerTypes';

type Props = {
  tabPins: StaffTabPinsConfig;
  onChange: (next: StaffTabPinsConfig) => void;
  /** Önizleme personeline göre eklenebilir adaylar */
  candidates: StaffHamburgerMenuItem[];
};

function labelFor(id: string, runtimeLabel?: string) {
  return STAFF_MENU_CATALOG.find((e) => e.id === id)?.labelTr ?? runtimeLabel ?? id;
}

/**
 * Admin: işletme geneli alt sekme varsayılanları + kilitli kısayollar.
 */
export function AdminStaffTabPinsPanel({ tabPins, onChange, candidates }: Props) {
  const defaultIds = tabPins.defaultIds?.length
    ? tabPins.defaultIds
    : [...DEFAULT_TAB_PIN_IDS];
  const lockedSet = useMemo(() => new Set(tabPins.lockedIds ?? []), [tabPins.lockedIds]);
  const defaultSet = useMemo(() => new Set(defaultIds), [defaultIds]);

  const candidateById = useMemo(() => {
    const m = new Map<string, StaffHamburgerMenuItem>();
    for (const c of candidates) m.set(c.id, c);
    return m;
  }, [candidates]);

  const setDefaults = (ids: string[]) => {
    const next = ids.slice(0, STAFF_TAB_MAX_PINS);
    onChange({
      ...tabPins,
      defaultIds: next.length ? next : undefined,
      lockedIds: (tabPins.lockedIds ?? []).filter((id) => next.includes(id) || lockedSet.has(id)),
    });
  };

  const toggleDefault = (id: string) => {
    if (defaultSet.has(id)) {
      const nextDefaults = defaultIds.filter((x) => x !== id);
      onChange({
        defaultIds: nextDefaults.length ? nextDefaults : undefined,
        lockedIds: (tabPins.lockedIds ?? []).filter((x) => x !== id),
      });
      return;
    }
    if (defaultIds.length >= STAFF_TAB_MAX_PINS) return;
    onChange({
      ...tabPins,
      defaultIds: [...defaultIds, id],
    });
  };

  const toggleLock = (id: string) => {
    const locked = new Set(tabPins.lockedIds ?? []);
    if (locked.has(id)) locked.delete(id);
    else {
      locked.add(id);
      if (!defaultSet.has(id) && defaultIds.length < STAFF_TAB_MAX_PINS) {
        onChange({
          defaultIds: [...defaultIds, id],
          lockedIds: [...locked],
        });
        return;
      }
    }
    onChange({
      ...tabPins,
      lockedIds: locked.size ? [...locked] : undefined,
    });
  };

  const moveDefault = (id: string, dir: -1 | 1) => {
    setDefaults(moveInList(defaultIds, id, dir));
  };

  const addable = candidates.filter((c) => !defaultSet.has(c.id));

  return (
    <View>
      <Text style={styles.intro}>
        Personel alt menüsüne (tab bar) hangi özelliklerin varsayılan geleceğini ve hangilerinin
        kilitli kalacağını buradan ayarlayın. En fazla {STAFF_TAB_MAX_PINS} sekme.
      </Text>

      <Text style={styles.blockTitle}>
        Varsayılan sekmeler ({defaultIds.length}/{STAFF_TAB_MAX_PINS})
      </Text>
      {defaultIds.length === 0 ? (
        <Text style={styles.empty}>Henüz varsayılan yok — aşağıdaki listeden ekleyin.</Text>
      ) : (
        defaultIds.map((id, idx) => {
          const locked = lockedSet.has(id);
          return (
            <View key={id} style={styles.row}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {labelFor(id, candidateById.get(id)?.label)}
                </Text>
                {locked ? <Text style={styles.lockHint}>Kilitli — personel kaldıramaz</Text> : null}
              </View>
              <View style={styles.rowActions}>
                <TouchableOpacity
                  onPress={() => moveDefault(id, -1)}
                  disabled={idx === 0}
                  style={[styles.iconBtn, idx === 0 && styles.iconBtnDisabled]}
                >
                  <Ionicons name="chevron-up" size={18} color={adminTheme.colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => moveDefault(id, 1)}
                  disabled={idx >= defaultIds.length - 1}
                  style={[
                    styles.iconBtn,
                    idx >= defaultIds.length - 1 && styles.iconBtnDisabled,
                  ]}
                >
                  <Ionicons name="chevron-down" size={18} color={adminTheme.colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => toggleLock(id)}
                  style={[styles.lockBtn, locked && styles.lockBtnOn]}
                >
                  <Ionicons
                    name={locked ? 'lock-closed' : 'lock-open-outline'}
                    size={16}
                    color={locked ? '#fff' : adminTheme.colors.primary}
                  />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => toggleDefault(id)} style={styles.removeBtn}>
                  <Text style={styles.removeBtnText}>Çıkar</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      <Text style={styles.blockTitle}>Eklenebilir özellikler</Text>
      <Text style={styles.hint}>
        Önizleme personelinin yetkisine göre listelenir. Özelliği ekleyince tüm yeni personel
        varsayılanında görünür.
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {addable.length === 0 ? (
          <Text style={styles.empty}>Eklenecek aday kalmadı veya önizleme personeli seçin.</Text>
        ) : (
          addable.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.chip}
              onPress={() => toggleDefault(item.id)}
              disabled={defaultIds.length >= STAFF_TAB_MAX_PINS}
            >
              <Ionicons name="add" size={14} color={adminTheme.colors.primary} />
              <Text style={styles.chipText}>{item.label}</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.resetBtn}
        onPress={() =>
          onChange({
            defaultIds: [...DEFAULT_TAB_PIN_IDS],
            lockedIds: undefined,
          })
        }
      >
        <Text style={styles.resetBtnText}>Sistem varsayılanına dön</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: {
    fontSize: 14,
    color: adminTheme.colors.textMuted,
    lineHeight: 20,
    marginBottom: 14,
  },
  blockTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: adminTheme.colors.text,
    marginTop: 8,
    marginBottom: 10,
  },
  hint: {
    fontSize: 12,
    color: adminTheme.colors.textMuted,
    marginBottom: 10,
    lineHeight: 17,
  },
  empty: { fontSize: 13, color: adminTheme.colors.textMuted, marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: adminTheme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    gap: 8,
  },
  rowLabel: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.text },
  lockHint: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 2 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { padding: 6 },
  iconBtnDisabled: { opacity: 0.35 },
  lockBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.primary,
  },
  lockBtnOn: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  removeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
  },
  removeBtnText: { fontSize: 12, fontWeight: '700', color: '#B91C1C' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.text },
  resetBtn: {
    marginTop: 16,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  resetBtnText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textMuted },
});
