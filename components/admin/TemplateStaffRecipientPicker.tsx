import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme as T } from '@/constants/adminTheme';
import {
  fetchActiveOrgStaff,
  type OrgStaffOption,
} from '@/lib/notificationTemplateRecipients';
import { SMART_OPS_ROLE_LABELS } from '@/lib/smartOps';

type Props = {
  organizationId: string | null;
  excludedStaffIds: string[];
  onToggleExclude: (staffId: string) => void;
  targetRole?: string;
  disabled?: boolean;
};

function roleLabel(role: string | null, department: string | null): string {
  if (role && SMART_OPS_ROLE_LABELS[role]) return SMART_OPS_ROLE_LABELS[role];
  if (department) return department;
  return role ?? 'Personel';
}

export function TemplateStaffRecipientPicker({
  organizationId,
  excludedStaffIds,
  onToggleExclude,
  targetRole = 'all_staff',
  disabled,
}: Props) {
  const [expanded, setExpanded] = useState(false);
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
    if (!organizationId) {
      setStaffOptions([]);
      return;
    }
    void load();
  }, [organizationId, load]);

  const excludedSet = useMemo(() => new Set(excludedStaffIds), [excludedStaffIds]);
  const totalStaff = staffOptions.length;
  const recipientCount = staffOptions.filter((s) => !excludedSet.has(s.id)).length;
  const excludedCount = excludedStaffIds.length;

  const summaryText = !organizationId
    ? 'İşletme seçin'
    : loading
      ? 'Personel listesi yükleniyor…'
      : totalStaff === 0
        ? 'Bu işletmede aktif personel yok'
        : excludedCount > 0
          ? `${recipientCount} / ${totalStaff} personel alacak (${excludedCount} hariç)`
          : `Tüm aktif personel (${totalStaff} kişi)`;

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={styles.toggle}
        onPress={() => setExpanded((v) => !v)}
        disabled={disabled || !organizationId}
        activeOpacity={0.85}
      >
        <View style={styles.toggleText}>
          <Text style={styles.label}>Alıcı personel (gerçek çalışan listesi)</Text>
          <Text style={styles.sub}>{summaryText}</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={T.colors.textMuted} />
      </TouchableOpacity>

      {expanded && organizationId ? (
        loading ? (
          <ActivityIndicator color={T.colors.accent} style={styles.loader} />
        ) : staffOptions.length === 0 ? (
          <Text style={styles.empty}>Aktif personel bulunamadı.</Text>
        ) : (
          <>
            <Text style={styles.hint}>
              Aşağıdaki {totalStaff} kişiden bildirim gitmesini istemediğinize dokunun. Varsayılan: hepsi
              alır.
            </Text>
            <View style={styles.chipRow}>
              {staffOptions.map((s) => {
                const excluded = excludedSet.has(s.id);
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.chip, excluded && styles.chipExcluded]}
                    onPress={() => !disabled && onToggleExclude(s.id)}
                    disabled={disabled}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name={excluded ? 'close-circle' : 'checkmark-circle'}
                      size={16}
                      color={excluded ? T.colors.error : T.colors.success}
                    />
                    <View style={styles.chipTextWrap}>
                      <Text style={[styles.chipName, excluded && styles.chipNameExcluded]}>
                        {s.full_name ?? 'Personel'}
                      </Text>
                      <Text style={styles.chipRole}>{roleLabel(s.role, s.department)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            {targetRole !== 'all_staff' ? (
              <Text style={styles.roleNote}>
                Rol filtresi: {SMART_OPS_ROLE_LABELS[targetRole] ?? targetRole}
              </Text>
            ) : null}
          </>
        )
      ) : (
        <Text style={styles.hint}>Listeyi görmek ve kişi çıkarmak için dokunun.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  toggleText: { flex: 1 },
  label: { fontSize: 12, fontWeight: '700', color: T.colors.textSecondary },
  sub: { fontSize: 13, color: T.colors.text, marginTop: 2, fontWeight: '600' },
  hint: { fontSize: 12, color: T.colors.textMuted, marginBottom: 8, marginTop: 4 },
  empty: { fontSize: 13, color: T.colors.textMuted, fontStyle: 'italic' },
  loader: { marginVertical: 10, alignSelf: 'flex-start' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: T.colors.surfaceSecondary,
    maxWidth: '100%',
  },
  chipExcluded: {
    borderColor: T.colors.errorLight,
    backgroundColor: T.colors.errorLight,
    opacity: 0.92,
  },
  chipTextWrap: { flexShrink: 1 },
  chipName: { fontSize: 13, fontWeight: '700', color: T.colors.text },
  chipNameExcluded: { textDecorationLine: 'line-through', color: T.colors.textMuted },
  chipRole: { fontSize: 11, color: T.colors.textMuted, marginTop: 1 },
  roleNote: { fontSize: 11, color: T.colors.textMuted, marginTop: 8 },
});
