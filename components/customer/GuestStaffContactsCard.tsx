import { memo } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { CachedImage } from '@/components/CachedImage';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
import { useGuestHotelPulse } from '@/hooks/useGuestHotelPulse';
import { feedSharedText } from '@/lib/feedSharedI18n';
import { openStaffProfileWithVisit } from '@/lib/staffProfileVisits';
import type { GuestPulseStaffContact } from '@/lib/guestHotelPulseLoad';
import { pds } from '@/constants/personelDesignSystem';

type Props = { refreshKey?: number };

const ACCENT = '#b8860b';
const RECEPTION = '#0ea5e9';
const LIVE_GREEN = '#22c55e';

function StaffContactCard({
  contact,
  roleLabel,
  variant,
  textColor,
  subColor,
  isNight,
  onPress,
}: {
  contact: GuestPulseStaffContact;
  roleLabel: string;
  variant: 'manager' | 'reception';
  textColor: string;
  subColor: string;
  isNight: boolean;
  onPress?: () => void;
}) {
  const accent = variant === 'manager' ? ACCENT : RECEPTION;
  const hasName = Boolean(contact.staffName && contact.staffName !== '—');
  const displayName = hasName
    ? contact.staffName
    : variant === 'reception'
      ? feedSharedText('guestPulseReceptionOffline')
      : feedSharedText('guestPulseManagerTitle');
  const initial = (displayName.trim()[0] ?? '?').toUpperCase();
  const tappable = Boolean(onPress && contact.staffId);

  const inner = (
    <>
      <View style={[styles.avatar, { borderColor: accent + '50', backgroundColor: accent + '18' }]}>
        {contact.profileImage ? (
          <CachedImage uri={contact.profileImage} style={styles.avatarImg} contentFit="cover" />
        ) : (
          <Text style={[styles.initial, { color: accent }]}>{initial}</Text>
        )}
        {contact.isOnline ? <View style={styles.onlineDot} /> : null}
      </View>
      <View style={styles.info}>
        <Text style={[styles.role, { color: accent }]}>{roleLabel}</Text>
        <Text style={[styles.name, { color: textColor }]} numberOfLines={1}>
          {displayName}
        </Text>
      </View>
      {tappable ? <Ionicons name="chevron-forward" size={14} color={subColor} /> : null}
    </>
  );

  const box = [
    styles.card,
    { borderColor: isNight ? accent + '30' : accent + '25', backgroundColor: isNight ? accent + '0c' : accent + '08' },
  ];
  if (tappable) {
    return (
      <TouchableOpacity activeOpacity={0.82} onPress={onPress} style={box}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={box}>{inner}</View>;
}

export const GuestStaffContactsCard = memo(function GuestStaffContactsCard({ refreshKey = 0 }: Props) {
  const router = useRouter();
  const tabFocused = useIsFocused();
  const pulse = useGuestHotelPulse(refreshKey, tabFocused);
  const { isNight, colors } = usePremiumTheme();

  if (!pulse.enabled) return null;

  const text = isNight ? colors.text : pds.text;
  const sub = isNight ? colors.subtext : pds.subtext;
  const showManager = Boolean((pulse.manager.staffName && pulse.manager.staffName !== '—') || pulse.manager.staffId);
  const openStaff = (id: string | null) => {
    if (id) openStaffProfileWithVisit(router, id, 'customer');
  };

  return (
    <View style={styles.row}>
      {showManager ? (
        <StaffContactCard
          contact={pulse.manager}
          roleLabel={pulse.manager.roleLabel?.trim() || feedSharedText('guestPulseManagerTitle')}
          variant="manager"
          textColor={text}
          subColor={sub}
          isNight={isNight}
          onPress={() => openStaff(pulse.manager.staffId)}
        />
      ) : null}
      <StaffContactCard
        contact={pulse.reception}
        roleLabel={feedSharedText('guestPulseLiveReception')}
        variant="reception"
        textColor={text}
        subColor={sub}
        isNight={isNight}
        onPress={() => openStaff(pulse.reception.staffId)}
      />
    </View>
  );
});

GuestStaffContactsCard.displayName = 'GuestStaffContactsCard';

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  card: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, borderWidth: 1, minWidth: 0 },
  avatar: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  initial: { fontSize: 16, fontWeight: '900' },
  onlineDot: { position: 'absolute', bottom: 2, right: 2, width: 8, height: 8, borderRadius: 4, backgroundColor: LIVE_GREEN, borderWidth: 1.5, borderColor: '#fff' },
  info: { flex: 1, minWidth: 0 },
  role: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
  name: { fontSize: 13, fontWeight: '800' },
});
