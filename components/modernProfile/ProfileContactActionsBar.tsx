import { ScrollView, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';

export type ProfileContactAction = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** İkon dairesi arka planı */
  tint?: string;
};

type Props = {
  actions: ProfileContactAction[];
};

export function ProfileContactActionsBar({ actions }: Props) {
  const visible = actions.filter((a) => !a.disabled);
  if (visible.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {visible.map((action) => (
          <TouchableOpacity
            key={action.id}
            style={styles.item}
            onPress={action.onPress}
            disabled={action.disabled || action.loading}
            activeOpacity={0.82}
          >
            <View style={[styles.iconCircle, { backgroundColor: action.tint ?? P.accent.blue }]}>
              {action.loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name={action.icon} size={22} color="#fff" />
              )}
            </View>
            <Text style={styles.label} numberOfLines={1}>
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: P.border,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 4,
    gap: 4,
  },
  item: {
    alignItems: 'center',
    minWidth: 68,
    maxWidth: 88,
    paddingHorizontal: 6,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  label: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '700',
    color: P.subtext,
    textAlign: 'center',
  },
});
