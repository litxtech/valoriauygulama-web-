import { ScrollView, Text, StyleSheet, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import {
  IMPORT_EXCLUDE_CATEGORIES,
  type ImportExcludeCategoryId,
} from '@/lib/bankStatement/importCategories';

type Props = {
  excluded: ReadonlySet<ImportExcludeCategoryId>;
  onToggle: (id: ImportExcludeCategoryId) => void;
  compact?: boolean;
};

export function BankImportExcludeChips({ excluded, onToggle, compact = false }: Props) {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {!compact ? (
        <View style={styles.header}>
          <Text style={styles.title}>Hariç tutulacak işlemler</Text>
          <Text style={styles.sub}>İşaretlenen türler belgeye dahil edilmez</Text>
        </View>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {IMPORT_EXCLUDE_CATEGORIES.map((cat) => {
          const on = excluded.has(cat.id);
          return (
            <Pressable
              key={cat.id}
              onPress={() => onToggle(cat.id)}
              style={({ pressed }) => [
                styles.chip,
                on && styles.chipOn,
                pressed && styles.chipPressed,
              ]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${cat.label} hariç tut`}
            >
              <Ionicons
                name={cat.icon}
                size={14}
                color={on ? '#b91c1c' : adminTheme.colors.textMuted}
              />
              <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                {cat.shortLabel}
              </Text>
              {on ? (
                <Ionicons name="close-circle" size={14} color="#b91c1c" />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  wrapCompact: { marginBottom: 0 },
  header: { marginBottom: 8 },
  title: { fontSize: 13, fontWeight: '800', color: adminTheme.colors.text },
  sub: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 2 },
  row: { flexDirection: 'row', gap: 8, paddingRight: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    maxWidth: 132,
  },
  chipOn: {
    backgroundColor: '#fff1f2',
    borderColor: '#fca5a5',
  },
  chipPressed: { opacity: 0.88 },
  chipText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textMuted },
  chipTextOn: { color: '#b91c1c' },
});
