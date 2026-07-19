import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import type { PublicMenuLang } from '@/lib/publicKitchenMenuLang';

type Props = {
  lang: PublicMenuLang;
  onChange: (lang: PublicMenuLang) => void;
  /** light = krem/premium header; dark = koyu hero */
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
      // RTL sayfada dil seçici sırası bozulmasın
      {...(Platform.OS === 'web' ? ({ dir: 'ltr' } as object) : null)}
    >
      {OPTIONS.map(({ code, label }) => {
        const active = lang === code;
        return (
          <TouchableOpacity
            key={code}
            style={[styles.btn, active && (light ? styles.btnOnLight : styles.btnOnDark)]}
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
                active && (light ? styles.btnTextOnLight : styles.btnTextOnDark),
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
    gap: 4,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    ...(Platform.OS === 'web' ? ({ direction: 'ltr' } as object) : {}),
  },
  wrapLight: {
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
    borderColor: 'rgba(15, 23, 42, 0.12)',
  },
  wrapDark: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.18)',
  },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  btnOnLight: {
    backgroundColor: '#fff',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 2px 10px rgba(15,23,42,0.12)' } as object)
      : menuUi.shadowSm),
  },
  btnOnDark: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 2px 8px rgba(0,0,0,0.12)' } as object)
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
  btnTextOnLight: {
    color: menuUi.navy,
  },
  btnTextOnDark: {
    color: menuUi.navy,
  },
});
