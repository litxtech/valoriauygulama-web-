import { useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
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
};

export function AdminOrganizationPicker({
  canUseAll,
  ownOrganizationId,
  value,
  onChange,
  pendingCounts,
}: Props) {
  const {
    organizations,
    selectedOrganizationId: storeOrgId,
    setSelectedOrganizationId,
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
    if (!canUseAll && ownOrganizationId && storeOrgId !== ownOrganizationId) {
      setSelectedOrganizationId(ownOrganizationId);
    }
  }, [canUseAll, ownOrganizationId, storeOrgId, setSelectedOrganizationId, value, onChange]);

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

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>İşletme seç</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {canUseAll ? (
          <TouchableOpacity
            style={[styles.chip, selectedOrganizationId === 'all' && styles.chipActive]}
            onPress={() => pickOrg('all')}
          >
            <Text style={[styles.chipText, selectedOrganizationId === 'all' && styles.chipTextActive]}>
              Tüm işletmeler{totalPending > 0 ? ` (${totalPending})` : ''}
            </Text>
          </TouchableOpacity>
        ) : null}
        {options.map((o) => {
          const pending = pendingCounts?.[o.id] ?? 0;
          return (
            <TouchableOpacity
              key={o.id}
              style={[styles.chip, selectedOrganizationId === o.id && styles.chipActive]}
              onPress={() => pickOrg(o.id)}
            >
              <Text style={[styles.chipText, selectedOrganizationId === o.id && styles.chipTextActive]}>
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
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    color: adminTheme.colors.textMuted,
    marginBottom: 8,
    fontWeight: '600',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: adminTheme.colors.accent,
    borderColor: adminTheme.colors.accent,
  },
  chipText: {
    color: adminTheme.colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#fff',
  },
});
