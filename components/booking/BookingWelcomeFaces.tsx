import { View, Text, StyleSheet, Image, ScrollView, Platform, useWindowDimensions } from 'react-native';
import type { BookingWelcomeHost } from '@/lib/onlineBooking';

type Props = {
  hosts: BookingWelcomeHost[];
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Instagram tarzı yuvarlak avatarlar — misafirin göreceği karşılama ekibi */
export function BookingWelcomeFaces({ hosts }: Props) {
  const { width } = useWindowDimensions();
  const wide = width >= 768;
  if (!hosts.length) return null;

  const avatarSize = wide ? 92 : 78;

  return (
    <View style={styles.wrap}>
      <Text style={styles.eyebrow}>Karşılama ekibi</Text>
      <Text style={styles.title}>Seni karşılayacaklar</Text>
      <Text style={styles.hint}>Girişte ve konaklaman boyunca yanındaki yüzler.</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.row, wide && styles.rowWide]}
      >
        {hosts.map((h) => (
          <View key={h.id} style={[styles.face, { width: avatarSize + 28 }]}>
            <View
              style={[
                styles.ring,
                {
                  width: avatarSize + 8,
                  height: avatarSize + 8,
                  borderRadius: (avatarSize + 8) / 2,
                },
              ]}
            >
              {h.photo_url ? (
                <Image
                  source={{ uri: h.photo_url }}
                  style={{
                    width: avatarSize,
                    height: avatarSize,
                    borderRadius: avatarSize / 2,
                    ...(Platform.OS === 'web' ? ({ objectFit: 'cover' } as Record<string, string>) : {}),
                  }}
                  resizeMode="cover"
                />
              ) : (
                <View
                  style={[
                    styles.fallback,
                    {
                      width: avatarSize,
                      height: avatarSize,
                      borderRadius: avatarSize / 2,
                    },
                  ]}
                >
                  <Text style={[styles.initials, wide && { fontSize: 26 }]}>{initials(h.display_name)}</Text>
                </View>
              )}
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {h.display_name}
            </Text>
            {h.role_label ? (
              <Text style={styles.role} numberOfLines={1}>
                {h.role_label}
              </Text>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 22,
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  eyebrow: {
    marginHorizontal: 14,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: '#0f766e',
  },
  title: {
    marginHorizontal: 14,
    marginTop: 4,
    fontSize: 20,
    fontWeight: '900',
    color: '#0b1220',
    letterSpacing: Platform.OS === 'ios' ? -0.3 : 0,
  },
  hint: {
    marginHorizontal: 14,
    marginTop: 4,
    marginBottom: 16,
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
    lineHeight: 18,
  },
  row: {
    paddingHorizontal: 10,
    gap: 6,
    alignItems: 'flex-start',
  },
  rowWide: { gap: 12, paddingHorizontal: 14 },
  face: {
    alignItems: 'center',
  },
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#14b8a6',
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
  },
  initials: { color: '#5eead4', fontWeight: '800', fontSize: 22 },
  name: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0b1220',
    textAlign: 'center',
    maxWidth: '100%',
  },
  role: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
  },
});
