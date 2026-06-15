import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { useGuestHotelInfo } from '@/hooks/useGuestHotelInfo';
import { guestServiceText } from '@/lib/guestServiceRequestsI18n';
import { CachedImage } from '@/components/CachedImage';

function InfoRow({
  icon,
  label,
  value,
  onPress,
  accent,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress?: () => void;
  accent?: string;
}) {
  if (!value.trim()) return null;
  const inner = (
    <View style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: (accent ?? theme.colors.primary) + '18' }]}>
        <Ionicons name={icon} size={20} color={accent ?? theme.colors.primary} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
      {onPress ? <Ionicons name="copy-outline" size={18} color={theme.colors.textMuted} /> : null}
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.rowCard}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={styles.rowCard}>{inner}</View>;
}

export default function CustomerHotelInfoScreen() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { info, loading } = useGuestHotelInfo(refreshKey);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    setRefreshing(false);
  }, []);

  const copyWifi = async () => {
    if (!info?.facilities.wifiPassword) return;
    await Clipboard.setStringAsync(info.facilities.wifiPassword);
    Alert.alert('✓', guestServiceText('hotelInfoCopied'));
  };

  if (loading && !info) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const f = info?.facilities;
  const reception = info?.reception;
  const manager = info?.manager;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.heroTitle}>{info?.brandName ?? 'Valoria'}</Text>
      <Text style={styles.heroSub}>{guestServiceText('hotelInfoSubtitle')}</Text>

      <Text style={styles.section}>{guestServiceText('hotelInfoWifi')}</Text>
      <InfoRow icon="radio-outline" label={guestServiceText('hotelInfoNetwork')} value={f?.wifiNetwork ?? ''} accent="#0284c7" />
      <InfoRow
        icon="key-outline"
        label={guestServiceText('hotelInfoPassword')}
        value={f?.wifiPassword ?? ''}
        onPress={f?.wifiPassword ? copyWifi : undefined}
        accent="#0369a1"
      />
      {f?.wifiStatus?.trim() ? (
        <InfoRow icon="wifi-outline" label="Durum" value={f.wifiStatus} accent="#0ea5e9" />
      ) : null}

      <Text style={styles.section}>{guestServiceText('hotelInfoBreakfast')}</Text>
      <InfoRow icon="cafe-outline" label="Saatler" value={f?.breakfastHours ?? ''} accent="#d97706" />
      <InfoRow icon="flame-outline" label="Sıcak su" value={f?.boilerLabel ?? ''} accent="#ef4444" />

      <Text style={styles.section}>{guestServiceText('hotelInfoReception')}</Text>
      {reception ? (
        <View style={styles.contactCard}>
          {reception.profileImage ? (
            <CachedImage uri={reception.profileImage} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={styles.avatarPh}>
              <Ionicons name="headset-outline" size={24} color={theme.colors.primary} />
            </View>
          )}
          <View style={styles.contactBody}>
            <Text style={styles.contactName}>{reception.staffName}</Text>
            <Text style={styles.contactMeta}>
              {reception.isOnline ? guestServiceText('hotelInfoOnline') : guestServiceText('hotelInfoOffline')}
              {reception.shiftLabel ? ` · ${reception.shiftLabel}` : ''}
            </Text>
            {reception.note ? <Text style={styles.contactNote}>{reception.note}</Text> : null}
          </View>
        </View>
      ) : null}

      <Text style={styles.section}>{guestServiceText('hotelInfoManager')}</Text>
      {manager && manager.staffName !== '—' ? (
        <View style={styles.contactCard}>
          {manager.profileImage ? (
            <CachedImage uri={manager.profileImage} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={styles.avatarPh}>
              <Ionicons name="shield-outline" size={24} color={theme.colors.primary} />
            </View>
          )}
          <View style={styles.contactBody}>
            <Text style={styles.contactName}>{manager.staffName}</Text>
            <Text style={styles.contactMeta}>{manager.roleLabel}</Text>
          </View>
        </View>
      ) : null}

      <Text style={styles.section}>{guestServiceText('hotelInfoFacilities')}</Text>
      <InfoRow icon="water-outline" label="Spa" value={f?.spaLabel ?? ''} accent="#6366f1" />
      <InfoRow icon="restaurant-outline" label="Restoran" value={f?.restaurantLabel ?? ''} accent="#b45309" />
      <InfoRow icon="car-outline" label="Otopark" value={f?.parkingLabel ?? ''} />
      <InfoRow icon="git-compare-outline" label={guestServiceText('hotelInfoElevator')} value={f?.elevatorLabel ?? ''} />
      <InfoRow icon="partly-sunny-outline" label="Hava" value={f?.weatherLabel ?? ''} accent="#f59e0b" />

      {f?.announcementLabel?.trim() ? (
        <>
          <Text style={styles.section}>{guestServiceText('hotelInfoAnnouncement')}</Text>
          <View style={[styles.rowCard, styles.announceCard]}>
            <Ionicons name="megaphone-outline" size={20} color="#8b5cf6" />
            <Text style={styles.announceText}>{f.announcementLabel}</Text>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heroTitle: { fontSize: 26, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.3 },
  heroSub: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 6, marginBottom: 20, lineHeight: 20 },
  section: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 16,
    marginBottom: 8,
  },
  rowCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.textMuted },
  rowValue: { fontSize: 15, fontWeight: '700', color: theme.colors.text, marginTop: 2 },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPh: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactBody: { flex: 1 },
  contactName: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  contactMeta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  contactNote: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
  announceCard: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  announceText: { flex: 1, fontSize: 14, lineHeight: 20, color: theme.colors.textSecondary },
});
