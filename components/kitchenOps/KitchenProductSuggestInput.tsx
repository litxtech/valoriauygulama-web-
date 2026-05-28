import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';
import type { KitchenStockItem } from '@/lib/kitchenOps/types';
import { searchKitchenItems } from '@/lib/kitchenOps/api';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSelect: (item: KitchenStockItem) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

export function KitchenProductSuggestInput({ value, onChangeText, onSelect, placeholder = 'Ürün adı', autoFocus }: Props) {
  const [suggestions, setSuggestions] = useState<KitchenStockItem[]>([]);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused || value.trim().length < 1) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      searchKitchenItems(value, 6)
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, 180);
    return () => clearTimeout(t);
  }, [value, focused]);

  return (
    <View style={styles.wrap}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
        autoCapitalize="sentences"
        autoCorrect={false}
      />
      {focused && suggestions.length > 0 ? (
        <View style={styles.dropdown}>
          {suggestions.map((item, index) => (
            <Pressable
              key={item.id}
              style={[styles.suggestRow, index === suggestions.length - 1 && styles.suggestRowLast]}
              onPress={() => {
                onSelect(item);
                setSuggestions([]);
                setFocused(false);
              }}
            >
              <Text style={styles.suggestName}>{item.name}</Text>
              <Text style={styles.suggestMeta}>
                {item.unit} · {Number(item.current_quantity)} stok
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { zIndex: 10 },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: theme.colors.text,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    maxHeight: 220,
    ...theme.shadows.sm,
  },
  suggestRow: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.borderLight },
  suggestRowLast: { borderBottomWidth: 0 },
  suggestName: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  suggestMeta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
});
