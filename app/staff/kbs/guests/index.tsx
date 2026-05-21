import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { useTranslation } from 'react-i18next';
import { useGuestScanSessionStore } from '@/stores/guestScanSessionStore';

function Tile(props: { title: string; sub: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.tile} onPress={props.onPress} activeOpacity={0.9}>
      <View style={styles.iconWrap}>
        <Ionicons name={props.icon} size={22} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.tileTitle}>{props.title}</Text>
        <Text style={styles.tileSub}>{props.sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </TouchableOpacity>
  );
}

export default function KbsGuestsHubScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const startSession = useGuestScanSessionStore((s) => s.startSession);
  const reset = useGuestScanSessionStore((s) => s.reset);
  const itemCount = useGuestScanSessionStore((s) => s.session?.items.length ?? 0);

  const goScan = async (type: 'single' | 'family' | 'group') => {
    reset();
    await startSession(type === 'single' ? 'single' : 'group');
    router.push({ pathname: '/staff/kbs/guests/scan', params: { mode: type } } as never);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>{t('kbsGuestHubTitle')}</Text>
      <Text style={styles.p}>{t('kbsGuestHubDesc')}</Text>

      <Tile
        title={t('kbsGuestScanSingle')}
        sub={t('kbsGuestScanSingleSub')}
        icon="scan-outline"
        onPress={() => void goScan('single')}
      />
      <Tile
        title={t('kbsGuestScanGroup')}
        sub={t('kbsGuestScanGroupSub')}
        icon="people-outline"
        onPress={() => void goScan('group')}
      />
      <Tile
        title={t('kbsGuestManual')}
        sub={t('kbsGuestManualSub')}
        icon="create-outline"
        onPress={() => router.push('/staff/kbs/ready' as never)}
      />
      <Tile
        title={t('kbsNavReady')}
        sub={t('kbsTabReadySub')}
        icon="paper-plane-outline"
        onPress={() => router.push('/staff/kbs/ready' as never)}
      />
      <Tile
        title={t('kbsNavSubmitted')}
        sub={t('kbsTabSubmittedSub')}
        icon="list-outline"
        onPress={() => router.push('/staff/kbs/submitted' as never)}
      />

      {itemCount > 0 ? (
        <TouchableOpacity style={styles.resumeBtn} onPress={() => router.push('/staff/kbs/guests/group' as never)}>
          <Text style={styles.resumeText}>{t('kbsGuestResumeGroup', { count: itemCount })}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12, backgroundColor: theme.colors.backgroundSecondary },
  h1: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
  p: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 4 },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  tileSub: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
  resumeBtn: {
    marginTop: 8,
    backgroundColor: theme.colors.primary,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  resumeText: { color: '#fff', fontWeight: '800' },
});
