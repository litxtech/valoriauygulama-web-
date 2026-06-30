import { useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { organizationKindLabel } from '@/lib/organizationKinds';

type Props = {
  canUseAll: boolean;
  ownOrganizationId?: string | null;
  /** Verilirse global store yerine bu değer kullanılır (ör. onay merkezi). */
  value?: string | 'all';
  onChange?: (id: string | 'all') => void;
  /** Bekleyen kaydı olan işletmeler — chip üzerinde sayı rozeti */
  pendingCounts?: Record<string, number>;
  /** Kart/etiket olmadan yalnızca chip satırı — dar başlıklar için */
  compact?: boolean;
};

export function AdminOrganizationPicker({
  canUseAll,
  ownOrganizationId,
  value,
  onChange,
  pendingCounts,
  compact = false,
}: Props) {
  const {
    organizations,
    selectedOrganizationId: storeOrgId,
    setSelectedOrganizationId,
    hydrateSelectedOrganization,
    orgHydrated,
    loadOrganizations,
    loadedAt,
  } = useAdminOrgStore();

  const selectedOrganizationId = value ?? storeOrgId;
  const pickOrg = onChange ?? setSelectedOrganizationId;

  useEffect(() => {
    if (organizations.length > 0 && loadedAt && Date.now() - loadedAt < 120_000) return;
    loadOrganizations();
  }, [loadOrganizations, organizations.length, loadedAt]);

  useEffect(() => {
    if (value != null || onChange) return;
    if (orgHydrated) return;
    void hydrateSelectedOrganization({ canUseAll, ownOrganizationId });
  }, [
    canUseAll,
    ownOrganizationId,
    value,
    onChange,
    orgHydrated,
    hydrateSelectedOrganization,
  ]);

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

  const chipLabel = (name: string, kind?: string | null) => {
    const k = organizationKindLabel(kind);
    if (k === 'Otel' && kind === 'hotel') return name;
    return `${name} · ${k}`;
  };

  if (options.length === 0 && !canUseAll) return null;
  // Dar görünümde tek işletme varsa picker'ı tamamen gizle (yer kazandırır).
  if (compact && !canUseAll && options.length <= 1) return null;

  return (
    <View style={compact ? styles.wrapCompact : styles.wrap}>
      {compact ? null : (
        <View style={styles.headRow}>
          <View style={styles.headIconWrap}>
            <Ionicons name="business-outline" size={15} color={adminTheme.colors.accent} />
          </View>
          <Text style={styles.label}>İşletme</Text>
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {canUseAll ? (
          <TouchableOpacity
            style={[compact ? styles.chipCompact : styles.chip, selectedOrganizationId === 'all' && styles.chipActive]}
            onPress={() => pickOrg('all')}
            activeOpacity={0.85}
          >
            <Text style={[compact ? styles.chipTextCompact : styles.chipText, selectedOrganizationId === 'all' && styles.chipTextActive]}>
              Tümü{totalPending > 0 ? ` · ${totalPending}` : ''}
            </Text>
          </TouchableOpacity>
        ) : null}
        {options.map((o) => {
          const pending = pendingCounts?.[o.id] ?? 0;
          const active = selectedOrganizationId === o.id;
          return (
            <TouchableOpacity
              key={o.id}
              style={[compact ? styles.chipCompact : styles.chip, active && styles.chipActive]}
              onPress={() => pickOrg(o.id)}
              activeOpacity={0.85}
            >
              <Text style={[compact ? styles.chipTextCompact : styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                {chipLabel(o.name, o.kind)}
                {pending > 0 ? ` · ${pending}` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 14,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.borderLight,
    ...(Platform.OS === 'ios' ? adminTheme.shadow.sm : { elevation: 2 }),
  },
  wrapCompact: {
    marginBottom: 0,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  headIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    color: adminTheme.colors.text,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    maxWidth: 220,
  },
  chipCompact: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    maxWidth: 200,
  },
  chipActive: {
    backgroundColor: adminTheme.colors.primary,
    borderColor: adminTheme.colors.primary,
  },
  chipText: {
    color: adminTheme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  chipTextCompact: {
    color: adminTheme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  chipTextActive: {
    color: '#fff',
  },
});
