import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { canStaffUseIdCapture, canStaffViewKbsCaptureHistory } from '@/lib/kbsMrzAccess';
import { canKbsCheckin, canKbsCheckout } from '@/lib/kbsStaysPermissions';
import { useTranslation } from 'react-i18next';

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
  const showIdCapture = canStaffUseIdCapture(staff);
  const showCaptureHistory = canStaffViewKbsCaptureHistory(staff);
  const canNotify = canKbsCheckin(staff);
  const canCheckout = canKbsCheckout(staff);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>{t('kbsNavOperation')}</Text>
          <Text style={styles.p}>{t('kbsTabHeaderDesc')}</Text>
        </View>
      </View>

      {showIdCapture ? (
        <Tile
          title="Kimlik/Pasaport Çekim"
          subtitle="Çek → düzelt → oda seç → Bildir."
          icon="camera-outline"
          onPress={() => router.push('/staff/kbs/capture-id' as never)}
        />
      ) : null}
      {showCaptureHistory ? (
        <>
          <Tile
            title="Canlı Kimlik Listesi"
            subtitle="Düzelt, oda ata ve Bildir — filtre, önizleme."
            icon="albums-outline"
            onPress={() => router.push('/staff/kbs/capture-history' as never)}
          />
          <Tile
            title="Pasaport Keşfeti"
            subtitle="İşletme bazlı bildirilen pasaportlar, uyruk ve otel özeti."
            icon="earth-outline"
            onPress={() => router.push('/staff/kbs/passport-explore' as never)}
          />
        </>
      ) : null}
      {canNotify ? (
        <Tile
          title="Bildirme durumu"
          subtitle="Ulaştı · Devam · Kuyruk · Başarısız — işle / yeniden ilet."
          icon="pulse-outline"
          onPress={() => router.push('/staff/kbs/status-board' as never)}
        />
      ) : null}
      {canCheckout ? (
        <Tile
          title={t('kbsLodgersTitle')}
          subtitle="İçeridekiler — çıkış ve düzelt / yeniden bildir."
          icon="exit-outline"
          onPress={() => router.push('/staff/kbs/lodgers' as never)}
        />
      ) : (
        <Tile
          title={t('kbsLodgersTitle')}
          subtitle={t('kbsLodgersTileSub')}
          icon="bed-outline"
          onPress={() => router.push('/staff/kbs/lodgers' as never)}
        />
      )}
      <Tile
        title="Bildirilen odalar"
        subtitle="Odaya dokun → kimlikler. Oda değiştir KBS’ye iletilir."
        icon="grid-outline"
        onPress={() => router.push('/staff/kbs/rooms')}
      />
      {!canNotify ? (
        <Tile
          title={t('kbsNavFailed')}
          subtitle={t('kbsTabFailedSub')}
          icon="alert-circle-outline"
          onPress={() => router.push('/staff/kbs/status-board' as never)}
        />
      ) : null}
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

