import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import type { PublicMenuLang } from '@/lib/publicKitchenMenuLang';

type Props = {
  lang: PublicMenuLang;
  onChange: (lang: PublicMenuLang) => void;
  /** light = açık header; dark = koyu header */
  tone?: 'light' | 'dark';
};

const OPTIONS: { code: PublicMenuLang; label: string }[] = [
  { code: 'tr', label: 'TR' },
  { code: 'en', label: 'EN' },
  { code: 'ar', label: 'العربية' },
];

export function PublicKitchenMenuLangToggle({ lang, onChange, tone = 'light' }: Props) {
  const light = tone === 'light';
  return (
    <View
      style={[styles.wrap, light ? styles.wrapLight : styles.wrapDark]}
      {...(Platform.OS === 'web' ? ({ dir: 'ltr' } as object) : null)}
    >
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
            accessibilityLabel={label}
          >
            <Text
              style={[
                styles.btnText,
                light ? styles.btnTextLight : styles.btnTextDark,
                active && styles.btnTextOn,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 3,
    borderRadius: 14,
    padding: 3,
    borderWidth: 1,
    ...(Platform.OS === 'web' ? ({ direction: 'ltr' } as object) : {}),
  },
  wrapLight: {
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
    borderColor: 'rgba(15, 23, 42, 0.14)',
  },
  wrapDark: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.22)',
  },
  btn: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    minWidth: 36,
    alignItems: 'center',
  },
  /** Seçili dil — her temada net (lacivert + beyaz) */
  btnOn: {
    backgroundColor: menuUi.navy,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 2px 10px rgba(10,15,26,0.28)' } as object)
      : menuUi.shadowSm),
  },
  btnText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  btnTextLight: {
    color: 'rgba(15, 23, 42, 0.55)',
  },
  btnTextDark: {
    color: 'rgba(255,255,255,0.78)',
  },
  btnTextOn: {
    color: '#ffffff',
  },
});
