import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { DesignableQR } from '@/components/DesignableQR';
import {
  PartnerGlassCard,
  PartnerHero,
  PartnerPrimaryButton,
  PartnerSectionTitle,
} from '@/components/breakfastPartner/PartnerUi';
import {
  breakfastGuestPassQrValue,
  breakfastGuestPassStatusLabel,
  cancelBreakfastGuestPass,
  fetchPartnerBreakfastGuestPass,
  formatBreakfastPassTime,
  type BreakfastGuestPass,
} from '@/lib/breakfastGuestPass';
import { formatPartnerDateTurkish } from '@/lib/breakfastPartner';
import { partnerRadii, partnerTheme } from '@/lib/breakfastPartnerTheme';

const QR_DESIGN = {
  useLogo: true,
  backgroundColor: '#ffffff',
  foregroundColor: '#0f172a',
  shape: 'rounded' as const,
  ecl: 'M' as const,
};

export default function PartnerGuestPassDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [pass, setPass] = useState<BreakfastGuestPass | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setPass(await fetchPartnerBreakfastGuestPass(id));
    } catch {
      setPass(null);
    }
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const qrValue = useMemo(() => (pass?.token ? breakfastGuestPassQrValue(pass.token) : ''), [pass?.token]);

  const shareQr = async () => {
    if (!pass) return;
    try {
      await Share.share({
        message: `${pass.guestName} — Valoria kahvaltı QR\n${qrValue}`,
      });
    } catch {
      /* ignore */
    }
  };

  const cancelPass = () => {
    if (!pass || pass.status !== 'pending') return;
    Alert.alert('QR iptal', 'Bu bilet iptal edilsin mi? Resepsiyonda okutulamaz.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'İptal et',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          const result = await cancelBreakfastGuestPass(pass.id);
          setCancelling(false);
          if ('error' in result) {
            Alert.alert('Hata', result.error);
            return;
          }
          setPass(result.pass);
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.boot, { paddingTop: insets.top }]}>
        <ActivityIndicator color={partnerTheme.accent} size="large" />
      </View>
    );
  }

  if (!pass) {
    return (
      <View style={[styles.boot, { paddingTop: insets.top }]}>
        <Text style={styles.denied}>Bilet bulunamadı.</Text>
        <PartnerPrimaryButton label="Geri dön" onPress={() => router.back()} />
      </View>
    );
  }

  const isPending = pass.status === 'pending';

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 24 }}
    >
      <PartnerHero
        title={pass.guestName}
        subtitle={`${formatPartnerDateTurkish(pass.recordDate, { weekday: true })} kahvaltı`}
        onBack={() => router.back()}
      />

      <View style={styles.content}>
        <PartnerGlassCard glow={isPending}>
          <View style={styles.statusRow}>
            <Ionicons
              name={pass.status === 'redeemed' ? 'checkmark-circle' : pass.status === 'cancelled' ? 'close-circle' : 'time-outline'}
              size={20}
              color={
                pass.status === 'redeemed'
                  ? partnerTheme.success
                  : pass.status === 'cancelled'
                    ? partnerTheme.muted
                    : partnerTheme.accent
              }
            />
            <Text style={styles.statusText}>{breakfastGuestPassStatusLabel(pass.status)}</Text>
          </View>

          {isPending ? (
            <View style={styles.qrWrap}>
              <DesignableQR value={qrValue} size={220} design={QR_DESIGN} />
              <Text style={styles.qrHint}>Misafir bu kodu Valoria resepsiyonunda okutur</Text>
            </View>
          ) : (
            <View style={styles.usedBox}>
              <Text style={styles.usedText}>
                {pass.status === 'redeemed'
                  ? `Onaylandı · ${formatBreakfastPassTime(pass.redeemedAt)}`
                  : 'Bu bilet iptal edildi'}
              </Text>
            </View>
          )}

          {pass.roomNumber ? (
            <Text style={styles.meta}>Oda {pass.roomNumber}</Text>
          ) : null}
          <Text style={styles.meta}>Oluşturma: {formatBreakfastPassTime(pass.createdAt)}</Text>
          {pass.redeemedByStaffName ? (
            <Text style={styles.meta}>Onaylayan: {pass.redeemedByStaffName}</Text>
          ) : null}

          {isPending ? (
            <View style={styles.actions}>
              <PartnerPrimaryButton label="QR paylaş" onPress={() => void shareQr()} />
              <PartnerPrimaryButton
                label="Bileti iptal et"
                onPress={cancelPass}
                loading={cancelling}
                variant="danger"
              />
            </View>
          ) : null}
        </PartnerGlassCard>

        <PartnerGlassCard style={{ marginTop: 14 }}>
          <PartnerSectionTitle
            icon="information-circle-outline"
            title="Nasıl kullanılır?"
            hint="Adım adım"
          />
          <Text style={styles.help}>
            1. Misafirinize QR kodu gösterin veya paylaşın{'\n'}
            2. Valoria resepsiyon/mutfak QR okutur{'\n'}
            3. Misafir «kahvaltı yapabilir» listesine eklenir
          </Text>
        </PartnerGlassCard>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: partnerTheme.bg },
  boot: { flex: 1, backgroundColor: partnerTheme.bg, alignItems: 'center', justifyContent: 'center', gap: 16 },
  denied: { color: partnerTheme.muted, fontSize: 16 },
  content: { paddingHorizontal: 18, paddingTop: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  statusText: { color: partnerTheme.text, fontWeight: '700', fontSize: 15 },
  qrWrap: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  qrHint: { color: partnerTheme.muted, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  usedBox: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: partnerRadii.md,
    padding: 16,
    marginVertical: 8,
  },
  usedText: { color: partnerTheme.mutedSoft, textAlign: 'center', fontWeight: '600' },
  meta: { color: partnerTheme.muted, fontSize: 13, marginTop: 6 },
  actions: { gap: 10, marginTop: 16 },
  help: { color: partnerTheme.mutedSoft, fontSize: 14, lineHeight: 22 },
});
