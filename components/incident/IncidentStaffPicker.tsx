import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { adminTheme } from '@/constants/adminTheme';
import { fetchActiveOrgStaff, type OrgStaffOption } from '@/lib/notificationTemplateRecipients';
import { SMART_OPS_ROLE_LABELS } from '@/lib/smartOps';

type Props = {
  organizationId: string | null;
  selectedStaffIds: string[];
  onChange: (staffIds: string[]) => void;
  disabled?: boolean;
};

function roleLabel(role: string | null, department: string | null): string {
  if (role && SMART_OPS_ROLE_LABELS[role]) return SMART_OPS_ROLE_LABELS[role];
  if (department) return department;
  return role ?? 'Personel';
}

export function IncidentStaffPicker({ organizationId, selectedStaffIds, onChange, disabled }: Props) {
  const [loading, setLoading] = useState(false);
  const [staffOptions, setStaffOptions] = useState<OrgStaffOption[]>([]);

  const load = useCallback(async () => {
    if (!organizationId) {
      setStaffOptions([]);
      return;
    }
    setLoading(true);
    try {
      setStaffOptions(await fetchActiveOrgStaff(organizationId));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (staffId: string) => {
    if (disabled) return;
    if (selectedStaffIds.includes(staffId)) {
      onChange(selectedStaffIds.filter((id) => id !== staffId));
    } else {
      onChange([...selectedStaffIds, staffId]);
    }
  };

  if (!organizationId) {
    return <Text style={styles.hint}>Organizasyon bilgisi gerekli.</Text>;
  }

  if (loading) {
    return <ActivityIndicator size="small" color={adminTheme.colors.primary} style={styles.loader} />;
  }

  if (staffOptions.length === 0) {
    return <Text style={styles.hint}>Bu işletmede aktif personel bulunamadı.</Text>;
  }

  return (
    <View>
      <Text style={styles.hint}>
        {selectedStaffIds.length > 0
          ? `${selectedStaffIds.length} personel seçildi`
          : 'İlgili personeli seçin (bildirim ve takip için)'}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipWrap}>
        {staffOptions.map((s) => {
          const active = selectedStaffIds.includes(s.id);
          const label = (s.full_name ?? 'İsimsiz').trim();
          const sub = roleLabel(s.role, s.department);
          return (
            <TouchableOpacity
              key={s.id}
              style={[styles.chip, active && styles.chipActive, disabled && styles.chipDisabled]}
              onPress={() => toggle(s.id)}
              disabled={disabled}
              activeOpacity={0.85}
            >
              <Text style={[styles.chipTitle, active && styles.chipTitleActive]} numberOfLines={1}>
                {label}
              </Text>
              <Text style={[styles.chipSub, active && styles.chipSubActive]} numberOfLines={1}>
                {sub}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { marginVertical: 8 },
  hint: { fontSize: 12, color: adminTheme.colors.textMuted, marginBottom: 6 },
  chipWrap: { gap: 8, paddingVertical: 2 },
  chip: {
    minWidth: 110,
    maxWidth: 160,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  chipDisabled: { opacity: 0.55 },
  chipTitle: { fontSize: 12, fontWeight: '800', color: adminTheme.colors.text },
  chipTitleActive: { color: '#fff' },
  chipSub: { marginTop: 2, fontSize: 10, fontWeight: '600', color: adminTheme.colors.textMuted },
  chipSubActive: { color: 'rgba(255,255,255,0.85)' },
});
