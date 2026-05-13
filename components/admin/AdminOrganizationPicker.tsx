import { useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { adminTheme } from '@/constants/adminTheme';
import { useAdminOrgStore } from '@/stores/adminOrgStore';

type Props = {
  canUseAll: boolean;
  ownOrganizationId?: string | null;
};

export function AdminOrganizationPicker({ canUseAll, ownOrganizationId }: Props) {
  const { organizations, selectedOrganizationId, setSelectedOrganizationId, loadOrganizations } = useAdminOrgStore();

  useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  useEffect(() => {
    if (!canUseAll && ownOrganizationId && selectedOrganizationId !== ownOrganizationId) {
      setSelectedOrganizationId(ownOrganizationId);
    }
  }, [canUseAll, ownOrganizationId, selectedOrganizationId, setSelectedOrganizationId]);

  const options = useMemo(() => {
    if (!canUseAll) {
      if (!ownOrganizationId) return organizations;
      return organizations.filter((o) => o.id === ownOrganizationId);
    }
    return organizations;
  }, [canUseAll, organizations, ownOrganizationId]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Otel Seç</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {canUseAll ? (
          <TouchableOpacity
            style={[styles.chip, selectedOrganizationId === 'all' && styles.chipActive]}
            onPress={() => setSelectedOrganizationId('all')}
          >
            <Text style={[styles.chipText, selectedOrganizationId === 'all' && styles.chipTextActive]}>
              Tüm Oteller
            </Text>
          </TouchableOpacity>
        ) : null}
        {options.map((o) => (
          <TouchableOpacity
            key={o.id}
            style={[styles.chip, selectedOrganizationId === o.id && styles.chipActive]}
            onPress={() => setSelectedOrganizationId(o.id)}
          >
            <Text style={[styles.chipText, selectedOrganizationId === o.id && styles.chipTextActive]}>
              {o.name}
            </Text>
          </TouchableOpacity>
        ))}
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

