import { View, Text, StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';

type Variant = 'banner' | 'pill' | 'hero' | 'icon';

type Props = {
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
};

export function BankStatementImportButton({ variant = 'banner', style }: Props) {
  const router = useRouter();
  const go = () => router.push('/admin/accounting/bank-import');

  if (variant === 'hero' || variant === 'icon') {
    return (
      <TouchableOpacity
        style={[variant === 'hero' ? styles.heroBtn : styles.iconBtn, style]}
        onPress={go}
        activeOpacity={0.88}
        accessibilityLabel="Banka ekstresi yükle"
      >
        <Ionicons
          name="cloud-upload-outline"
          size={variant === 'hero' ? 22 : 20}
          color={variant === 'hero' ? '#fff' : '#0f766e'}
        />
      </TouchableOpacity>
    );
  }

  if (variant === 'pill') {
    return (
      <TouchableOpacity style={[styles.pill, style]} onPress={go} activeOpacity={0.88}>
        <Ionicons name="cloud-upload-outline" size={18} color="#0f766e" />
        <Text style={styles.pillText}>Ekstre yükle</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={[styles.banner, style]} onPress={go} activeOpacity={0.88}>
      <View style={styles.bannerIcon}>
        <Ionicons name="cloud-upload-outline" size={24} color="#0f766e" />
      </View>
      <View style={styles.bannerBody}>
        <Text style={styles.bannerTitle}>Banka ekstresi yükle</Text>
        <Text style={styles.bannerSub}>CSV · Excel · PDF · TXT — otomatik algılama ile içe aktarın</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={adminTheme.colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ecfdf5',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  bannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ccfbf1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerBody: { flex: 1 },
  bannerTitle: { fontSize: 15, fontWeight: '800', color: '#0f766e' },
  bannerSub: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 3, lineHeight: 16 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ecfdf5',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#99f6e4',
    flex: 1,
  },
  pillText: { fontSize: 14, fontWeight: '700', color: '#0f766e' },
  heroBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#99f6e4',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
