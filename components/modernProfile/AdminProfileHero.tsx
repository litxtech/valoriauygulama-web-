import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { ProfileIdentityCard } from '@/components/ProfileIdentityCard';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';
import { ModernProfileCover } from '@/components/modernProfile/ModernProfileCover';
import { ProfileAvatarRing } from '@/components/modernProfile/ProfileAvatarRing';
import { ProfileStatsCard, type ProfileStatItem } from '@/components/ProfileStatsCard';
import { ProfileQrCardModal } from '@/components/modernProfile/ProfileQrCardModal';
import { shareStaffProfile } from '@/lib/profileShare';

type Props = {
  staffId: string;
  fullName: string | null;
  positionLine?: string | null;
  coverUri?: string | null;
  avatarUri?: string | null;
  statItems: ProfileStatItem[];
  onPickCover?: () => void;
  uploadingCover?: boolean;
};

export function AdminProfileHero({
  staffId,
  fullName,
  positionLine,
  coverUri,
  avatarUri,
  statItems,
  onPickCover,
  uploadingCover,
}: Props) {
  const [qrVisible, setQrVisible] = useState(false);

  return (
    <View style={styles.wrap}>
      <View style={styles.coverBlock}>
        <ModernProfileCover imageUri={coverUri} height={P.hero.height} softenOverlay={false} disabled={!onPickCover} onPress={onPickCover}>
          {uploadingCover ? (
            <View style={styles.coverLoader}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}
        </ModernProfileCover>
        {onPickCover ? (
          <TouchableOpacity style={styles.coverFab} onPress={onPickCover} activeOpacity={0.85}>
            <Ionicons name="camera" size={16} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>
      <ProfileIdentityCard style={styles.identityWrap}>
        <ProfileAvatarRing
          uri={avatarUri}
          name={fullName ?? '?'}
          showCameraHint={!!onPickCover}
          style={styles.avatarOverlap}
        />
        <Text style={styles.name}>{fullName || '—'}</Text>
        {positionLine ? <Text style={styles.sub}>{positionLine}</Text> : null}
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={() =>
              void shareStaffProfile({ staffId, fullName: fullName || '', viewer: 'staff' })
            }
            activeOpacity={0.88}
          >
            <LinearGradient colors={[P.gradient.start, P.gradient.end]} style={styles.actionBtn}>
              <Ionicons name="share-outline" size={18} color="#fff" />
              <Text style={styles.actionTextLight}>Paylaş</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setQrVisible(true)} activeOpacity={0.88}>
            <LinearGradient colors={[P.gradient.start, P.gradient.end]} style={styles.actionBtn}>
              <Ionicons name="qr-code-outline" size={18} color="#fff" />
              <Text style={styles.actionTextLight}>QR</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
        <View style={styles.stats}>
          <ProfileStatsCard items={statItems} />
        </View>
      </ProfileIdentityCard>
      <ProfileQrCardModal
        visible={qrVisible}
        onClose={() => setQrVisible(false)}
        staffId={staffId}
        fullName={fullName || '—'}
        positionLine={positionLine}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  coverBlock: { position: 'relative', marginBottom: 0 },
  identityWrap: { marginTop: P.identityCard.marginTop, paddingTop: 18 },
  avatarOverlap: { marginTop: -(P.avatar.size / 2 + 6) },
  coverLoader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  coverFab: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(15,23,42,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  name: { fontSize: 22, fontWeight: '800', color: P.text, marginTop: 12 },
  sub: { fontSize: 14, color: P.subtext, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
  },
  actionTextLight: { fontSize: 13, fontWeight: '700', color: '#fff' },
  stats: { width: '100%', marginTop: 12 },
});
