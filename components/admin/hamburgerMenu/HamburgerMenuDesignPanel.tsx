import { View, Text, StyleSheet, TouchableOpacity, TextInput, Switch } from 'react-native';
import { adminTheme } from '@/constants/adminTheme';
import {
  DEFAULT_SECTION_COLORS,
  HAMBURGER_THEME_PRESET_META,
  HAMBURGER_THEME_PRESETS,
  normalizeHamburgerHexColor,
  type StaffHamburgerThemeConfig,
} from '@/lib/staffHamburgerTheme';
import { STAFF_MENU_SECTION_LABELS_TR } from '@/lib/staffMenuCatalog';
import type { StaffHamburgerMenuSectionId } from '@/lib/staffHamburgerMenu';

type Props = {
  theme: StaffHamburgerThemeConfig;
  onChange: (next: StaffHamburgerThemeConfig) => void;
};

const HEADER_STYLES = [
  { id: 'gradient', label: 'Gradient' },
  { id: 'solid', label: 'Düz renk' },
  { id: 'minimal', label: 'Minimal' },
] as const;

const LAYOUT_MODES = [
  { id: 'classic', label: 'Klasik liste' },
  { id: 'compact', label: 'Kompakt' },
  { id: 'grid', label: 'Izgara (2 sütun)' },
] as const;

const ITEM_STYLES = [
  { id: 'list', label: 'Liste' },
  { id: 'grid', label: 'Karo' },
  { id: 'pill', label: 'Pill / chip' },
] as const;

function ColorField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value?: string | null;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.colorRow}>
        <View style={[styles.colorSwatch, { backgroundColor: normalizeHamburgerHexColor(value) ?? placeholder }]} />
        <TextInput
          style={styles.input}
          value={value ?? ''}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={adminTheme.colors.textMuted}
          autoCapitalize="none"
          onBlur={() => {
            const n = normalizeHamburgerHexColor(value);
            if (n && n !== value) onChange(n);
          }}
        />
      </View>
    </View>
  );
}

export function HamburgerMenuDesignPanel({ theme, onChange }: Props) {
  const patch = (partial: Partial<StaffHamburgerThemeConfig>) => onChange({ ...theme, ...partial });

  const applyPreset = (presetId: (typeof HAMBURGER_THEME_PRESET_META)[number]['id']) => {
    const preset = HAMBURGER_THEME_PRESETS[presetId] ?? {};
    onChange({ ...preset, preset: presetId });
  };

  const sectionIds = Object.keys(DEFAULT_SECTION_COLORS) as StaffHamburgerMenuSectionId[];

  return (
    <View style={styles.wrap}>
      <Text style={styles.blockTitle}>Tasarım şablonu</Text>
      <View style={styles.presetGrid}>
        {HAMBURGER_THEME_PRESET_META.map((preset) => {
          const active = (theme.preset ?? 'default') === preset.id;
          return (
            <TouchableOpacity
              key={preset.id}
              style={[styles.presetCard, active && styles.presetCardActive]}
              onPress={() => applyPreset(preset.id)}
            >
              <Text style={[styles.presetTitle, active && styles.presetTitleActive]}>{preset.labelTr}</Text>
              <Text style={[styles.presetDesc, active && styles.presetDescActive]} numberOfLines={2}>
                {preset.descriptionTr}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.blockTitle}>Düzen modu</Text>
      <View style={styles.chipRowWrap}>
        {LAYOUT_MODES.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[styles.chip, (theme.layoutMode ?? 'classic') === m.id && styles.chipActive]}
            onPress={() => patch({ layoutMode: m.id })}
          >
            <Text style={[styles.chipText, (theme.layoutMode ?? 'classic') === m.id && styles.chipTextActive]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.blockTitle}>Öğe stili</Text>
      <View style={styles.chipRowWrap}>
        {ITEM_STYLES.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[styles.chip, (theme.itemStyle ?? 'list') === m.id && styles.chipActive]}
            onPress={() => patch({ itemStyle: m.id })}
          >
            <Text style={[styles.chipText, (theme.itemStyle ?? 'list') === m.id && styles.chipTextActive]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.blockTitle}>Header stili</Text>
      <View style={styles.chipRowWrap}>
        {HEADER_STYLES.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[styles.chip, (theme.headerStyle ?? 'gradient') === m.id && styles.chipActive]}
            onPress={() => patch({ headerStyle: m.id })}
          >
            <Text style={[styles.chipText, (theme.headerStyle ?? 'gradient') === m.id && styles.chipTextActive]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.blockTitle}>Renkler</Text>
      <ColorField
        label="Drawer arka plan"
        value={theme.drawerBackground}
        placeholder="#fefcff"
        onChange={(drawerBackground) => patch({ drawerBackground })}
      />
      <ColorField
        label="Header düz renk"
        value={theme.headerSolidColor}
        placeholder="#6366f1"
        onChange={(headerSolidColor) => patch({ headerSolidColor })}
      />
      <ColorField
        label="Birincil buton"
        value={theme.primaryButtonColor}
        placeholder="#dc2626"
        onChange={(primaryButtonColor) => patch({ primaryButtonColor })}
      />
      <ColorField
        label="Kart arka plan"
        value={theme.cardBackground}
        placeholder="#ffffff"
        onChange={(cardBackground) => patch({ cardBackground })}
      />
      <ColorField
        label="Metin rengi"
        value={theme.textColor}
        placeholder="#0f172a"
        onChange={(textColor) => patch({ textColor })}
      />
      <ColorField
        label="Perde (backdrop)"
        value={theme.backdropColor}
        placeholder="rgba(88,28,135,0.28)"
        onChange={(backdropColor) => patch({ backdropColor })}
      />

      <Text style={styles.blockTitle}>Bölüm renkleri</Text>
      {sectionIds.map((sid) => (
        <ColorField
          key={sid}
          label={STAFF_MENU_SECTION_LABELS_TR[sid]}
          value={theme.sectionColors?.[sid] ?? DEFAULT_SECTION_COLORS[sid]}
          placeholder={DEFAULT_SECTION_COLORS[sid]}
          onChange={(color) =>
            patch({
              sectionColors: { ...(theme.sectionColors ?? {}), [sid]: color },
            })
          }
        />
      ))}

      <Text style={styles.blockTitle}>Özel bölüm başlıkları</Text>
      {sectionIds.map((sid) => (
        <View key={`title-${sid}`} style={styles.field}>
          <Text style={styles.fieldLabel}>{STAFF_MENU_SECTION_LABELS_TR[sid]}</Text>
          <TextInput
            style={styles.input}
            value={theme.sectionTitles?.[sid] ?? ''}
            onChangeText={(v) =>
              patch({
                sectionTitles: { ...(theme.sectionTitles ?? {}), [sid]: v },
              })
            }
            placeholder={STAFF_MENU_SECTION_LABELS_TR[sid]}
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        </View>
      ))}

      <Text style={styles.blockTitle}>Görünürlük</Text>
      {(
        [
          ['showHubCards', 'Hub kartları (F&B / yönetim)', theme.showHubCards ?? true],
          ['showSearch', 'Menü arama kutusu', theme.showSearch ?? true],
          ['showRecentFlyout', 'Sağ son-kullanılan şeridi', theme.showRecentFlyout ?? true],
          ['showSectionIcons', 'Bölüm ikonları', theme.showSectionIcons ?? true],
          ['showSectionLabels', 'Bölüm başlıkları', theme.showSectionLabels ?? true],
        ] as const
      ).map(([key, label, value]) => (
        <View key={key} style={styles.switchRow}>
          <Text style={styles.switchLabel}>{label}</Text>
          <Switch
            value={value}
            onValueChange={(v) => patch({ [key]: v })}
            trackColor={{ false: adminTheme.colors.border, true: adminTheme.colors.primary }}
          />
        </View>
      ))}

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Arama için minimum öğe sayısı</Text>
        <TextInput
          style={styles.input}
          value={String(theme.searchMinItems ?? 6)}
          keyboardType="number-pad"
          onChangeText={(v) => {
            const n = parseInt(v, 10);
            if (!Number.isNaN(n) && n >= 0) patch({ searchMinItems: n });
          }}
          placeholder="6"
          placeholderTextColor={adminTheme.colors.textMuted}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Drawer köşe yuvarlaklığı (px)</Text>
        <TextInput
          style={styles.input}
          value={String(theme.drawerBorderRadius ?? 26)}
          keyboardType="number-pad"
          onChangeText={(v) => {
            const n = parseInt(v, 10);
            if (!Number.isNaN(n) && n >= 0) patch({ drawerBorderRadius: Math.min(40, n) });
          }}
          placeholder="26"
          placeholderTextColor={adminTheme.colors.textMuted}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  blockTitle: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text, marginTop: 8 },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetCard: {
    width: '48%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surface,
  },
  presetCardActive: {
    borderColor: adminTheme.colors.primary,
    backgroundColor: adminTheme.colors.primary,
  },
  presetTitle: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text },
  presetTitleActive: { color: '#fff' },
  presetDesc: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 4 },
  presetDescActive: { color: 'rgba(255,255,255,0.85)' },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  chipActive: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  chipText: { color: adminTheme.colors.text, fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: adminTheme.colors.text,
    backgroundColor: adminTheme.colors.surface,
  },
  colorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  switchLabel: { flex: 1, fontSize: 14, color: adminTheme.colors.text, paddingRight: 12 },
});
