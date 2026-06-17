import { LinearGradient } from 'expo-linear-gradient';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  resolveStaffHamburgerTheme,
  type StaffHamburgerThemeConfig,
} from '@/lib/staffHamburgerTheme';
import type { StaffHamburgerMenuLayout } from '@/lib/staffHamburgerMenu';
import { STAFF_MENU_SECTION_LABELS_TR } from '@/lib/staffMenuCatalog';

type Props = {
  themeConfig: StaffHamburgerThemeConfig | undefined;
  menuLayout: StaffHamburgerMenuLayout | null;
};

export function HamburgerMenuLivePreview({ themeConfig, menuLayout }: Props) {
  const theme = resolveStaffHamburgerTheme(themeConfig);
  const drawerBg = theme.drawerBackground ?? '#fefcff';
  const text = theme.textColor ?? '#0f172a';
  const muted = theme.mutedTextColor ?? '#64748b';
  const cardBg = theme.cardBackground ?? '#ffffff';
  const cardBorder = theme.cardBorder ?? '#e2e8f0';
  const headerColors = (
    theme.headerStyle === 'minimal' || theme.headerStyle === 'solid'
      ? [theme.headerSolidColor, theme.headerSolidColor]
      : theme.headerGradient.length >= 2
        ? theme.headerGradient.slice(0, 2)
        : ['#6366f1', '#8b5cf6']
  ) as [string, string];

  const primary = menuLayout?.primary;
  const hubs = theme.showHubCards ? (menuLayout?.hubs ?? []).slice(0, 2) : [];
  const section = menuLayout?.sections?.[0];

  return (
    <View style={[styles.shell, { backgroundColor: drawerBg, borderColor: cardBorder, borderRadius: theme.drawerBorderRadius }]}>
      <LinearGradient colors={headerColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <View style={styles.avatar} />
        <View style={styles.headerTextCol}>
          <View style={[styles.line, styles.lineLg, { backgroundColor: theme.headerStyle === 'minimal' ? text : 'rgba(255,255,255,0.9)' }]} />
          <View style={[styles.line, styles.lineSm, { backgroundColor: theme.headerStyle === 'minimal' ? muted : 'rgba(255,255,255,0.65)' }]} />
        </View>
      </LinearGradient>

      <View style={styles.body}>
        {primary ? (
          <View style={[styles.primary, { backgroundColor: theme.primaryButtonColor }]}>
            <Ionicons name={primary.icon} size={14} color="#fff" />
            <Text style={styles.primaryText} numberOfLines={1}>
              {primary.label}
            </Text>
          </View>
        ) : null}

        {hubs.length > 0 ? (
          <View style={styles.hubRow}>
            {hubs.map((hub) => (
              <View key={hub.id} style={[styles.hub, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <Ionicons name={hub.icon} size={16} color={hub.accent} />
                <Text style={[styles.hubText, { color: text }]} numberOfLines={1}>
                  {hub.label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {section ? (
          <View style={styles.section}>
            {theme.showSectionLabels ? (
              <Text style={[styles.sectionTitle, { color: theme.sectionColors[section.id as keyof typeof theme.sectionColors] ?? '#6366f1' }]}>
                {section.title || STAFF_MENU_SECTION_LABELS_TR[section.id as keyof typeof STAFF_MENU_SECTION_LABELS_TR]}
              </Text>
            ) : null}
            <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              {(theme.layoutMode === 'grid'
                ? section.items.slice(0, 4)
                : theme.itemStyle === 'pill'
                  ? section.items.slice(0, 3)
                  : section.items.slice(0, 3)
              ).map((item) =>
                theme.layoutMode === 'grid' || theme.itemStyle === 'grid' ? (
                  <View key={item.id} style={[styles.gridItem, { borderColor: cardBorder }]}>
                    <Ionicons name={item.icon} size={14} color={item.accent} />
                    <Text style={[styles.gridText, { color: text }]} numberOfLines={1}>
                      {item.label}
                    </Text>
                  </View>
                ) : theme.itemStyle === 'pill' ? (
                  <View key={item.id} style={[styles.pill, { borderColor: `${item.accent}55`, backgroundColor: `${item.accent}18` }]}>
                    <Ionicons name={item.icon} size={12} color={item.accent} />
                    <Text style={[styles.pillText, { color: text }]} numberOfLines={1}>
                      {item.label}
                    </Text>
                  </View>
                ) : (
                  <View key={item.id} style={[styles.row, { borderBottomColor: cardBorder }]}>
                    <View style={[styles.rowIcon, { backgroundColor: `${item.accent}22` }]}>
                      <Ionicons name={item.icon} size={12} color={item.accent} />
                    </View>
                    <Text style={[styles.rowText, { color: text }]} numberOfLines={1}>
                      {item.label}
                    </Text>
                  </View>
                )
              )}
            </View>
          </View>
        ) : null}

        <Text style={[styles.meta, { color: muted }]}>
          {theme.preset} · {theme.layoutMode} · {theme.headerStyle} header
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  headerTextCol: { flex: 1, gap: 6 },
  line: { borderRadius: 4, height: 8 },
  lineLg: { width: '70%' },
  lineSm: { width: '45%', height: 6 },
  body: { padding: 12, gap: 10 },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 12, flex: 1 },
  hubRow: { flexDirection: 'row', gap: 8 },
  hub: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
    gap: 4,
  },
  hubText: { fontSize: 10, fontWeight: '700' },
  section: { gap: 6 },
  sectionTitle: { fontSize: 11, fontWeight: '800' },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, fontSize: 11, fontWeight: '600' },
  gridItem: {
    width: '48%',
    margin: '1%',
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    gap: 4,
  },
  gridText: { fontSize: 10, fontWeight: '700', textAlign: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    margin: 3,
  },
  pillText: { fontSize: 10, fontWeight: '600', maxWidth: 120 },
  meta: { fontSize: 10, textAlign: 'center', marginTop: 4 },
});
