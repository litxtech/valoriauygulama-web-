import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
  Pressable,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { adminTheme } from '@/constants/adminTheme';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { organizationKindLabel } from '@/lib/organizationKinds';

type Props = {
  canUseAll: boolean;
  ownOrganizationId?: string | null;
  /** Verilirse global store yerine bu değer kullanılır (ör. onay merkezi). */
  value?: string | 'all';
  onChange?: (id: string | 'all') => void;
  /** Bekleyen kaydı olan işletmeler — satır üzerinde sayı rozeti */
  pendingCounts?: Record<string, number>;
  /** Kart/etiket olmadan yalnızca tetikleyici — dar başlıklar için */
  compact?: boolean;
};

const SHEET_MAX = Math.round(Dimensions.get('window').height * 0.62);

export function AdminOrganizationPicker({
  canUseAll,
  ownOrganizationId,
  value,
  onChange,
  pendingCounts,
  compact = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const {
    organizations,
    selectedOrganizationId: storeOrgId,
    setSelectedOrganizationId,
    hydrateSelectedOrganization,
    orgHydrated,
    loadOrganizations,
    loading,
    loadError,
    loadedAt,
  } = useAdminOrgStore();

  const selectedOrganizationId = value ?? storeOrgId;
  const pickOrg = onChange ?? setSelectedOrganizationId;

  const refresh = useCallback(
    (force = false) => {
      void loadOrganizations(force);
    },
    [loadOrganizations]
  );

  useEffect(() => {
    // Boş / hatalı / süresi dolmuş → yükle (boş başarıyı uzun süre kilitleme)
    if (organizations.length > 0 && loadedAt && Date.now() - loadedAt < 120_000 && !loadError) {
      return;
    }
    refresh(false);
  }, [refresh, organizations.length, loadedAt, loadError]);

  useEffect(() => {
    if (value != null || onChange) return;
    if (orgHydrated) return;
    void hydrateSelectedOrganization({ canUseAll, ownOrganizationId });
  }, [canUseAll, ownOrganizationId, value, onChange, orgHydrated, hydrateSelectedOrganization]);

  useEffect(() => {
    if (value != null || onChange || orgHydrated) return;
    if (!canUseAll && ownOrganizationId && storeOrgId !== ownOrganizationId) {
      setSelectedOrganizationId(ownOrganizationId);
    }
  }, [
    canUseAll,
    ownOrganizationId,
    storeOrgId,
    setSelectedOrganizationId,
    value,
    onChange,
    orgHydrated,
  ]);

  const options = useMemo(() => {
    if (!canUseAll) {
      if (!ownOrganizationId) return organizations;
      return organizations.filter((o) => o.id === ownOrganizationId);
    }
    return organizations;
  }, [canUseAll, organizations, ownOrganizationId]);

  const totalPending = useMemo(() => {
    if (!pendingCounts) return 0;
    return Object.values(pendingCounts).reduce((s, n) => s + n, 0);
  }, [pendingCounts]);

  const selectedLabel = useMemo(() => {
    if (selectedOrganizationId === 'all') {
      return totalPending > 0 ? `Tüm işletmeler · ${totalPending}` : 'Tüm işletmeler';
    }
    const o = options.find((x) => x.id === selectedOrganizationId) ?? organizations.find((x) => x.id === selectedOrganizationId);
    if (!o) return loading ? 'Yükleniyor…' : 'İşletme seç';
    const k = organizationKindLabel(o.kind);
    const pending = pendingCounts?.[o.id] ?? 0;
    const base = k === 'Otel' && o.kind === 'hotel' ? o.name : `${o.name} · ${k}`;
    return pending > 0 ? `${base} · ${pending}` : base;
  }, [
    selectedOrganizationId,
    options,
    organizations,
    loading,
    pendingCounts,
    totalPending,
  ]);

  const chipLabel = (name: string, kind?: string | null) => {
    const k = organizationKindLabel(kind);
    if (k === 'Otel' && kind === 'hotel') return name;
    return `${name} · ${k}`;
  };

  // Tek işletme + all yok → yer kaplamasın
  if (compact && !canUseAll && options.length <= 1 && !loadError) return null;
  if (options.length === 0 && !canUseAll && !loading && !loadError) return null;

  const selectAndClose = (id: string | 'all') => {
    pickOrg(id);
    setOpen(false);
  };

  const openSheet = () => {
    setOpen(true);
    if (!organizations.length || loadError) {
      refresh(true);
    }
  };

  return (
    <View style={compact ? styles.wrapCompact : styles.wrap}>
      <TouchableOpacity
        style={[styles.trigger, compact && styles.triggerCompact]}
        onPress={openSheet}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel="İşletme seç"
      >
        <View style={[styles.triggerIcon, compact && styles.triggerIconCompact]}>
          <Ionicons name="business" size={compact ? 14 : 16} color="#c2410c" />
        </View>
        <View style={styles.triggerBody}>
          {compact ? null : <Text style={styles.triggerEyebrow}>İşletme</Text>}
          <Text style={[styles.triggerTitle, compact && styles.triggerTitleCompact]} numberOfLines={1}>
            {selectedLabel}
          </Text>
        </View>
        {loading && !open ? (
          <ActivityIndicator size="small" color={adminTheme.colors.accent} />
        ) : (
          <Ionicons name="chevron-down" size={18} color={adminTheme.colors.textMuted} />
        )}
      </TouchableOpacity>

      {loadError && options.length === 0 ? (
        <TouchableOpacity style={styles.errorRow} onPress={() => refresh(true)} activeOpacity={0.85}>
          <Ionicons name="warning-outline" size={14} color="#b45309" />
          <Text style={styles.errorText} numberOfLines={1}>
            Liste yüklenemedi — tekrar dene
          </Text>
        </TouchableOpacity>
      ) : null}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Kapat" />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 14), maxHeight: SHEET_MAX }]}>
            <View style={styles.handle} />
            <View style={styles.sheetHead}>
              <View>
                <Text style={styles.sheetTitle}>İşletme seç</Text>
                <Text style={styles.sheetSub}>Son seçim korunur; değiştirene kadar aynı kalır</Text>
              </View>
              <TouchableOpacity
                style={styles.refreshBtn}
                onPress={() => refresh(true)}
                hitSlop={8}
                accessibilityLabel="Yenile"
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#7c3aed" />
                ) : (
                  <Ionicons name="refresh" size={18} color="#7c3aed" />
                )}
              </TouchableOpacity>
            </View>

            {loadError ? (
              <View style={styles.sheetError}>
                <Text style={styles.sheetErrorText}>{loadError}</Text>
                <TouchableOpacity onPress={() => refresh(true)}>
                  <Text style={styles.sheetErrorAction}>Tekrar dene</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetList}
            >
              {canUseAll ? (
                <TouchableOpacity
                  style={[styles.row, selectedOrganizationId === 'all' && styles.rowOn]}
                  onPress={() => selectAndClose('all')}
                  activeOpacity={0.88}
                >
                  <View style={[styles.rowIcon, selectedOrganizationId === 'all' && styles.rowIconOn]}>
                    <Ionicons
                      name="apps-outline"
                      size={18}
                      color={selectedOrganizationId === 'all' ? '#fff' : '#64748b'}
                    />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={[styles.rowTitle, selectedOrganizationId === 'all' && styles.rowTitleOn]}>
                      Tüm işletmeler
                    </Text>
                    <Text style={styles.rowMeta}>
                      {options.length} kayıt{totalPending > 0 ? ` · ${totalPending} bekleyen` : ''}
                    </Text>
                  </View>
                  {selectedOrganizationId === 'all' ? (
                    <Ionicons name="checkmark-circle" size={22} color="#7c3aed" />
                  ) : null}
                </TouchableOpacity>
              ) : null}

              {loading && options.length === 0 ? (
                <View style={styles.emptyLoad}>
                  <ActivityIndicator color="#7c3aed" />
                  <Text style={styles.emptyLoadText}>İşletmeler yükleniyor…</Text>
                </View>
              ) : null}

              {!loading && options.length === 0 ? (
                <View style={styles.emptyLoad}>
                  <Ionicons name="business-outline" size={28} color={adminTheme.colors.textMuted} />
                  <Text style={styles.emptyLoadText}>Gösterilecek işletme yok</Text>
                  <TouchableOpacity style={styles.retryBtn} onPress={() => refresh(true)}>
                    <Text style={styles.retryBtnText}>Yenile</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {options.map((o) => {
                const pending = pendingCounts?.[o.id] ?? 0;
                const active = selectedOrganizationId === o.id;
                return (
                  <TouchableOpacity
                    key={o.id}
                    style={[styles.row, active && styles.rowOn]}
                    onPress={() => selectAndClose(o.id)}
                    activeOpacity={0.88}
                  >
                    <View style={[styles.rowIcon, active && styles.rowIconOn]}>
                      <Ionicons name="business-outline" size={18} color={active ? '#fff' : '#64748b'} />
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={[styles.rowTitle, active && styles.rowTitleOn]} numberOfLines={1}>
                        {chipLabel(o.name, o.kind)}
                      </Text>
                      {pending > 0 ? (
                        <Text style={styles.rowPending}>{pending} bekleyen</Text>
                      ) : (
                        <Text style={styles.rowMeta}>{organizationKindLabel(o.kind)}</Text>
                      )}
                    </View>
                    {active ? <Ionicons name="checkmark-circle" size={22} color="#7c3aed" /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 10,
  },
  wrapCompact: {
    marginBottom: 0,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.borderLight,
    ...(Platform.OS === 'ios' ? adminTheme.shadow.sm : { elevation: 1 }),
  },
  triggerCompact: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  triggerIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  triggerIconCompact: {
    width: 28,
    height: 28,
    borderRadius: 8,
  },
  triggerBody: { flex: 1, minWidth: 0 },
  triggerEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: adminTheme.colors.textMuted,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  triggerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: adminTheme.colors.text,
  },
  triggerTitleCompact: { fontSize: 13 },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  errorText: { flex: 1, fontSize: 11, fontWeight: '600', color: '#b45309' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e2e8f0',
    marginBottom: 12,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: adminTheme.colors.text },
  sheetSub: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 3, maxWidth: 280 },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f3ff',
  },
  sheetError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#fffbeb',
    marginBottom: 10,
  },
  sheetErrorText: { flex: 1, fontSize: 12, color: '#92400e', fontWeight: '600' },
  sheetErrorAction: { fontSize: 12, fontWeight: '800', color: '#7c3aed' },
  sheetList: { paddingBottom: 8, gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rowOn: {
    backgroundColor: '#f5f3ff',
    borderColor: '#ddd6fe',
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconOn: { backgroundColor: '#7c3aed' },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text },
  rowTitleOn: { color: '#5b21b6' },
  rowMeta: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 2 },
  rowPending: { fontSize: 11, fontWeight: '700', color: '#b45309', marginTop: 2 },
  emptyLoad: { alignItems: 'center', paddingVertical: 28, gap: 10 },
  emptyLoadText: { fontSize: 13, color: adminTheme.colors.textMuted, fontWeight: '600' },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#ede9fe',
  },
  retryBtnText: { fontSize: 13, fontWeight: '800', color: '#6d28d9' },
});
