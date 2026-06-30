import { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import { PARTNER_STATUS_LABELS } from '@/lib/breakfastPartner';
import { partnerTheme } from '@/lib/breakfastPartnerTheme';
import { safeRouterReplace } from '@/lib/safeRouter';
import { switchPartnerToMainApp } from '@/stores/partnerAppSurfaceStore';

export default function PartnerPendingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const signOut = useAuthStore((s) => s.signOut);
  const user = useAuthStore((s) => s.user);
  const partner = usePartnerAuthStore((s) => s.partner);
  const resolvePartner = usePartnerAuthStore((s) => s.resolvePartner);

  useFocusEffect(
    useCallback(() => {
      if (user) void resolvePartner(user);
    }, [user, resolvePartner])
  );

  if (!partner) {
    return (
      <View style={[styles.boot, { paddingTop: insets.top }]}>
        <ActivityIndicator color={partnerTheme.accent} />
      </View>
    );
  }

  if (partner.isPortalActive) {
    safeRouterReplace(router, '/partner');
    return null;
  }

  const isPending = partner.hotel.status === 'pending';
  const isSuspended = partner.hotel.status === 'suspended';

  return (
    <View style={styles.root}>
      <LinearGradient colors={[...partnerTheme.heroGradient]} style={StyleSheet.absoluteFill} />
      <View style={[styles.content, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.iconWrap}>
          <Ionicons
            name={isPending ? 'hourglass-outline' : 'pause-circle-outline'}
            size={48}
            color={partnerTheme.accent}
          />
        </View>
        <Text style={styles.title}>
          {isPending ? 'Onay bekleniyor' : 'Hesap askıda'}
        </Text>
        <Text style={styles.hotel}>{partner.hotel.name}</Text>
        <Text style={styles.status}>{PARTNER_STATUS_LABELS[partner.hotel.status]}</Text>
        <Text style={styles.body}>
          {isPending
            ? 'Profiliniz oluşturuldu. Valoria yönetimi onayladıktan sonra günlük kahvaltı sayısı girebilir ve cari hesabınızı takip edebilirsiniz.'
            : 'Hesabınız geçici olarak askıya alındı. Detay için yönetici ile iletişime geçin.'}
        </Text>

        <TouchableOpacity style={styles.cardBtn} onPress={() => router.push('/partner/edit-profile')} activeOpacity={0.88}>
          <Ionicons name="person-circle-outline" size={20} color={partnerTheme.accent} />
          <Text style={styles.cardBtnText}>Profilimi düzenle</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cardBtn}
          onPress={() => void switchPartnerToMainApp(router)}
          activeOpacity={0.88}
        >
          <Ionicons name="compass-outline" size={20} color={partnerTheme.accent} />
          <Text style={styles.cardBtnText}>Uygulamaya git</Text>
        </TouchableOpacity>

        {isPending ? (
          <TouchableOpacity style={styles.refreshBtn} onPress={() => user && void resolvePartner(user)} activeOpacity={0.85}>
            <Ionicons name="refresh-outline" size={18} color={partnerTheme.muted} />
            <Text style={styles.refreshText}>Durumu yenile</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity style={styles.signOut} onPress={() => void signOut()} activeOpacity={0.85}>
          <Text style={styles.signOutText}>Çıkış yap</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: partnerTheme.bg },
  boot: { flex: 1, backgroundColor: partnerTheme.bg, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: partnerTheme.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { color: partnerTheme.text, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  hotel: { color: partnerTheme.text, fontSize: 18, fontWeight: '700', marginTop: 8 },
  status: { color: partnerTheme.accent, fontWeight: '700', marginTop: 4 },
  body: { color: partnerTheme.muted, textAlign: 'center', lineHeight: 22, marginTop: 16, maxWidth: 340 },
  cardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 28,
    backgroundColor: partnerTheme.card,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
  },
  cardBtnText: { color: partnerTheme.text, fontWeight: '700' },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, padding: 8 },
  refreshText: { color: partnerTheme.muted },
  signOut: { marginTop: 24, padding: 12 },
  signOutText: { color: partnerTheme.muted, fontWeight: '600' },
});
