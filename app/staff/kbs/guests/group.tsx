import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import { useGuestScanSessionStore } from '@/stores/guestScanSessionStore';
import { Ionicons } from '@expo/vector-icons';

export default function KbsGuestGroupScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const session = useGuestScanSessionStore((s) => s.session);
  const removeItem = useGuestScanSessionStore((s) => s.removeItem);
  const items = session?.items ?? [];

  return (
    <View style={styles.container}>
      <Text style={styles.count}>{t('kbsGuestGroupCount', { count: items.length })}</Text>

      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ gap: 8, paddingBottom: 120 }}
        renderItem={({ item, index }) => (
          <View style={styles.card}>
            <Text style={styles.idx}>{index + 1}.</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {item.firstName} {item.lastName}
              </Text>
              <Text style={styles.sub}>
                {item.passportNo ?? item.identityNo ?? '—'} · {item.sourceType === 'gallery' ? '📷' : '📹'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => removeItem(item.id)} hitSlop={8}>
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>{t('kbsGuestGroupEmpty')}</Text>}
      />

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.scanMore}
          onPress={() => router.push({ pathname: '/staff/kbs/guests/scan', params: { mode: 'group' } } as never)}
        >
          <Text style={styles.scanMoreText}>{t('kbsGuestScanAnother')}</Text>
        </TouchableOpacity>
        {items.length > 0 ? (
          <TouchableOpacity style={styles.submitAll} onPress={() => router.push('/staff/kbs/guests/room' as never)}>
            <Text style={styles.submitAllText}>{t('kbsGuestRoomSubmitAll')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: theme.colors.backgroundSecondary },
  count: { fontSize: 18, fontWeight: '800', marginBottom: 12, color: theme.colors.text },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.surface,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  idx: { fontWeight: '800', color: theme.colors.textMuted, width: 24 },
  name: { fontWeight: '800', fontSize: 15, color: theme.colors.text },
  sub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  empty: { color: theme.colors.textSecondary, textAlign: 'center', marginTop: 40 },
  footer: { position: 'absolute', left: 16, right: 16, bottom: 24, gap: 10 },
  scanMore: {
    backgroundColor: theme.colors.surface,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  scanMoreText: { fontWeight: '800', color: theme.colors.text },
  submitAll: {
    backgroundColor: theme.colors.primary,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitAllText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
