import { View, TextInput, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RestaurantTokens } from '@/features/restaurant/tokens/restaurantTokens';

type Props = {
  tokens: RestaurantTokens;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  sticky?: boolean;
};

export function RestaurantSearchBar({ tokens, value, onChange, placeholder, sticky }: Props) {
  return (
    <View
      style={[
        styles.wrap,
        sticky && styles.sticky,
        {
          backgroundColor: tokens.bg,
          borderBottomColor: tokens.border,
        },
      ]}
    >
      <View style={[styles.box, { backgroundColor: tokens.bgElevated, borderColor: tokens.border }]}>
        <View style={[styles.icon, { backgroundColor: tokens.accentSoft }]}>
          <Ionicons name="search" size={16} color={tokens.accent} />
        </View>
        <TextInput
          style={[styles.input, { color: tokens.text }]}
          placeholder={placeholder}
          placeholderTextColor={tokens.textMuted}
          value={value}
          onChangeText={onChange}
        />
        {value ? (
          <TouchableOpacity onPress={() => onChange('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={tokens.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 20,
  },
  sticky: Platform.select({
    web: { position: 'sticky', top: 0 } as object,
    default: {},
  }),
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 11 : 8,
    gap: 8,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 8px 28px rgba(10,15,26,0.06)',
        } as object)
      : {}),
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: { flex: 1, fontSize: 15, fontWeight: '600', padding: 0 },
});
