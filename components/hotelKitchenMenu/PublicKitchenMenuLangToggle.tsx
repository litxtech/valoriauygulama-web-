import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import type { PublicMenuLang } from '@/lib/publicKitchenMenuLang';

type Props = {
  lang: PublicMenuLang;
  onChange: (lang: PublicMenuLang) => void;
};

const OPTIONS: { code: PublicMenuLang; label: string }[] = [
  { code: 'tr', label: 'TR' },
  { code: 'en', label: 'EN' },
  { code: 'ar', label: 'العربية' },
];

export function PublicKitchenMenuLangToggle({ lang, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      {OPTIONS.map(({ code, label }) => {
        const active = lang === code;
        return (
          <TouchableOpacity
            key={code}
            style={[styles.btn, active && styles.btnOn]}
            onPress={() => onChange(code)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.btnText, active && styles.btnTextOn]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  btnOn: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 2px 8px rgba(0,0,0,0.12)' } as object)
      : menuUi.shadowSm),
  },
  btnText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
  },
  btnTextOn: {
    color: menuUi.navy,
  },
});
