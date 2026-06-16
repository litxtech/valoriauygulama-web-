import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import type { PublicMenuLang } from '@/lib/publicKitchenMenuLang';

type Props = {
  lang: PublicMenuLang;
  onChange: (lang: PublicMenuLang) => void;
};

export function PublicKitchenMenuLangToggle({ lang, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[styles.btn, lang === 'en' && styles.btnOn]}
        onPress={() => onChange('en')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ selected: lang === 'en' }}
      >
        <Text style={[styles.btnText, lang === 'en' && styles.btnTextOn]}>EN</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.btn, lang === 'ar' && styles.btnOn]}
        onPress={() => onChange('ar')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ selected: lang === 'ar' }}
      >
        <Text style={[styles.btnText, lang === 'ar' && styles.btnTextOn]}>العربية</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  btn: {
    paddingHorizontal: 14,
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
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
  },
  btnTextOn: {
    color: menuUi.navy,
  },
});
