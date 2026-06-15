import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RoleAura } from '@/components/premium/RoleAura';
import { StaffStatusRing, type StaffPresenceStatus } from '@/components/premium/StaffStatusRing';
import { AnimatedStoryRing } from '@/components/premium/AnimatedStoryRing';
import { PressableScale } from '@/components/premium/PressableScale';
import { AvatarWithBadge, StaffNameWithBadge } from '@/components/VerifiedBadge';
import { OnlinePresenceDot } from '@/components/OnlinePresenceDot';
import { CachedImage } from '@/components/CachedImage';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';

export type StaffFeedStoryAvatarProps = {
  id: string;
  name: string;
  profileImage: string | null;
  department: string | null;
  position: string | null;
  role?: string | null;
  orgLabel?: string | null;
  verificationBadge?: 'blue' | 'yellow' | null;
  isOnline?: boolean;
  isMe?: boolean;
  hasStory: boolean;
  hasUnseen: boolean;
  profileHidden?: boolean;
  presenceStatus?: StaffPresenceStatus;
  onPress: () => void;
};

export function StaffFeedStoryAvatarCard(props: StaffFeedStoryAvatarProps) {
  const palette = usePersonelDesign();
  const {
    name,
    profileImage,
    department,
    position,
    role,
    orgLabel,
    verificationBadge,
    isOnline,
    isMe,
    hasStory,
    hasUnseen,
    profileHidden,
    presenceStatus = isOnline ? 'available' : 'break',
    onPress,
  } = props;

  return (
    <PressableScale style={styles.card} onPress={onPress}>
      <View style={styles.inner}>
        <View style={styles.avatarCluster}>
          <RoleAura role={role} department={department} radius={38}>
            <StaffStatusRing status={presenceStatus} size={72}>
              <AnimatedStoryRing hasStory={hasStory} hasUnseen={hasUnseen} isOnline={!!isOnline} size={68}>
                <AvatarWithBadge badge={verificationBadge ?? null} avatarSize={60} badgeSize={14} showBadge={false}>
                  {profileImage ? (
                    <CachedImage uri={profileImage} style={styles.avatar} contentFit="cover" />
                  ) : (
                    <View style={[styles.placeholder, { backgroundColor: palette.borderLight }]}>
                      <Text style={[styles.letter, { color: palette.subtext }]}>{name.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                </AvatarWithBadge>
                {isMe ? (
                  <TouchableOpacity style={styles.addBadge} activeOpacity={0.9}>
                    <Ionicons name="add" size={13} color="#fff" />
                  </TouchableOpacity>
                ) : null}
                {isOnline ? (
                  <OnlinePresenceDot
                    online
                    size={12}
                    borderColor="#fff"
                    position={isMe ? 'bottom-left' : 'bottom-right'}
                  />
                ) : null}
              </AnimatedStoryRing>
            </StaffStatusRing>
          </RoleAura>
        </View>
        <View style={styles.captionBlock}>
          <StaffNameWithBadge
            name={name}
            badge={verificationBadge ?? null}
            textStyle={[styles.name, { color: palette.text }]}
            center
          />
          {!profileHidden && (department || position) ? (
            <Text style={[styles.role, { color: palette.muted }]} numberOfLines={1}>
              {department || position || ''}
            </Text>
          ) : null}
          {!profileHidden && orgLabel ? (
            <Text style={[styles.org, { color: palette.subtext }]} numberOfLines={2}>
              {orgLabel}
            </Text>
          ) : null}
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { width: 88, marginRight: 10 },
  inner: { alignItems: 'center', width: '100%' },
  avatarCluster: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  captionBlock: { width: '100%', paddingHorizontal: 2, alignItems: 'center' },
  avatar: { width: 60, height: 60, borderRadius: 30 },
  placeholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: { fontSize: 22, fontWeight: '800' },
  addBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#7C5CFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  name: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  role: { fontSize: 9, marginTop: 2, textAlign: 'center' },
  org: { fontSize: 8, textAlign: 'center', marginTop: 1 },
});
