import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { canStaffUseIdCapture, canStaffUseMrzScan } from '@/lib/kbsMrzAccess';
import { useTranslation } from 'react-i18next';
import { useKbsMrzBatchStore } from '@/stores/kbsMrzBatchStore';
import { preloadMrzVisionScanner } from '@/lib/scanner/mrzVisionScannerLoader';

function Tile(props: { title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.tile} onPress={props.onPress} activeOpacity={0.9}>
      <View style={styles.tileIcon}>
        <Ionicons name={props.icon} size={22} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.tileTitle}>{props.title}</Text>
        <Text style={styles.tileSub}>{props.subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </TouchableOpacity>
  );
}

export default function StaffKbsTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const showMrz = canStaffUseMrzScan(staff);
  const showIdCapture = canStaffUseIdCapture(staff);
  const batchKey = useKbsMrzBatchStore((s) => s.batchKey);

  useEffect(() => {
    if (showMrz) void preloadMrzVisionScanner();
  }, [showMrz]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>{t('kbsNavOperation')}</Text>
          <Text style={styles.p}>{t('kbsTabHeaderDesc')}</Text>
        </View>
        {showMrz ? (
          <TouchableOpacity
            style={styles.passportAddBtn}
            onPress={() => router.push('/staff/kbs/guests' as never)}
            activeOpacity={0.88}
            accessibilityLabel={t('kbsNavScanSerial')}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>

      {showMrz ? (
        <Tile
          title={t('kbsGuestHubTitle')}
          subtitle={t('kbsGuestHubTileSub')}
          icon="scan-outline"
          onPress={() => router.push('/staff/kbs/guests' as never)}
        />
      ) : null}
      {showIdCapture ? (
        <Tile
          title="Kimlik/Pasaport Çekim"
          subtitle="Tam ekran çek, AI tarasın, oda ata, anlık bildir."
          icon="camera-outline"
          onPress={() => router.push('/staff/kbs/capture-id' as never)}
        />
      ) : null}
      {showIdCapture ? (
        <Tile
          title="Canlı Kimlik Listesi"
          subtitle="Günlük/haftalık/aylık filtre, önizleme, paylaş-yazdır."
          icon="albums-outline"
          onPress={() => router.push('/staff/kbs/capture-history' as never)}
        />
      ) : null}
      {showMrz ? (
        <Tile title={t('kbsNavScanSerial')} subtitle={t('kbsTabScanSub')} icon="document-text-outline" onPress={() => router.push({ pathname: '/staff/mrz-scan', params: { mode: 'single' } } as never)} />
      ) : null}
      {showMrz ? (
        <Tile
          title="Parti / Beklet"
          subtitle="Aynı grupta sırayla MRZ; oda atayıp hazıra çekin."
          icon="people-outline"
          onPress={() =>
            batchKey
              ? router.push({ pathname: '/staff/kbs/batch', params: { batchKey } } as never)
              : router.push('/staff/kbs/scan' as never)
          }
        />
      ) : null}
      <Tile
        title={t('kbsLodgersTitle')}
        subtitle={t('kbsLodgersTileSub')}
        icon="bed-outline"
        onPress={() => router.push('/staff/kbs/lodgers' as never)}
      />
      <Tile title={t('kbsNavReady')} subtitle={t('kbsTabReadySub')} icon="paper-plane-outline" onPress={() => router.push('/staff/kbs/ready')} />
      <Tile title={t('kbsNavSubmitted')} subtitle={t('kbsTabSubmittedSub')} icon="list-outline" onPress={() => router.push('/staff/kbs/submitted')} />
      <Tile title={t('kbsNavRooms')} subtitle={t('kbsTabRoomsSub')} icon="bed-outline" onPress={() => router.push('/staff/kbs/rooms')} />
      <Tile title={t('kbsNavFailed')} subtitle={t('kbsTabFailedSub')} icon="alert-circle-outline" onPress={() => router.push('/staff/kbs/failed')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary, padding: 16, gap: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  h1: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
  p: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 8 },
  passportAddBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    marginTop: 2,
  },
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
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  tileSub: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
});

