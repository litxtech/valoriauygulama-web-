import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import { staffAppPermissionsBySection } from '@/lib/staffAppPermissionsCatalog';

type Props = {
  permissions: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
  /** Onay ekranı gibi kompakt checkbox stili */
  variant?: 'toggle' | 'checkbox';
};

export function StaffAppPermissionsEditor({ permissions, onChange, variant = 'toggle' }: Props) {
  const sections = staffAppPermissionsBySection();

  const toggle = (key: string) => {
    onChange({ ...permissions, [key]: !permissions[key] });
  };

  if (variant === 'checkbox') {
    return (
      <View style={styles.wrap}>
        {sections.map((sec) => (
          <View key={sec.section} style={styles.section}>
            <Text style={styles.sectionTitle}>{sec.title}</Text>
            {sec.items.map((p) => (
              <TouchableOpacity key={p.key} style={styles.checkRow} onPress={() => toggle(p.key)} activeOpacity={0.8}>
                <Text style={styles.checkbox}>{permissions[p.key] ? '☑' : '☐'}</Text>
                <View style={styles.checkBody}>
                  <Text style={styles.checkLabel}>{p.label}</Text>
                  {p.description ? <Text style={styles.checkDesc}>{p.description}</Text> : null}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {sections.map((sec) => (
        <View key={sec.section} style={styles.section}>
          <Text style={styles.sectionTitle}>{sec.title}</Text>
          {sec.items.map((p) => (
            <TouchableOpacity key={p.key} style={styles.row} onPress={() => toggle(p.key)} activeOpacity={0.85}>
              <Ionicons
                name={permissions[p.key] ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={permissions[p.key] ? adminTheme.colors.primary : adminTheme.colors.textMuted}
              />
              <View style={styles.rowBody}>
                <Text style={styles.rowLabel}>{p.label}</Text>
                {p.description ? <Text style={styles.rowDesc}>{p.description}</Text> : null}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  section: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.md,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    padding: 12,
    gap: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: adminTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: adminTheme.colors.borderLight,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.text },
  rowDesc: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2, lineHeight: 17 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6 },
  checkbox: { fontSize: 18, width: 24 },
  checkBody: { flex: 1 },
  checkLabel: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.text },
  checkDesc: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
});
