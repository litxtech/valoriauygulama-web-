import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';
import { ProfileAvatarRing } from '@/components/modernProfile/ProfileAvatarRing';

const COVER_HEIGHT = 168;
const AVATAR_SIZE = 92;

type Props = {
  coverUri: string | null;
  avatarUri: string | null;
  displayName?: string;
  coverLabel: string;
  avatarLabel: string;
  addCoverText: string;
  sectionTitle?: string;
  sectionHint?: string;
  onPickCover: () => void;
  onPickAvatar: () => void;
  onDeleteCover?: () => void;
  onDeleteAvatar?: () => void;
  deleteAvatarLabel?: string;
  uploadingCover?: boolean;
  uploadingAvatar?: boolean;
  disabled?: boolean;
};

export function ProfileEditMediaSection({
  coverUri,
  avatarUri,
  displayName = '?',
  coverLabel,
  avatarLabel,
  addCoverText,
  sectionTitle,
  sectionHint,
  onPickCover,
  onPickAvatar,
  onDeleteCover,
  onDeleteAvatar,
  deleteAvatarLabel,
  uploadingCover = false,
  uploadingAvatar = false,
  disabled = false,
}: Props) {
  const busy = disabled || uploadingCover || uploadingAvatar;

  return (
    <View style={styles.section}>
      {sectionTitle ? (
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="images" size={20} color={P.accent.blue} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>{sectionTitle}</Text>
            {sectionHint ? <Text style={styles.headerHint}>{sectionHint}</Text> : null}
          </View>
        </View>
      ) : null}

      <View style={styles.previewCard}>
        <TouchableOpacity
          style={styles.coverTouch}
          onPress={onPickCover}
          activeOpacity={0.9}
          disabled={busy}
        >
          {coverUri ? (
            <CachedImage uri={coverUri} style={styles.coverImg} contentFit="cover" />
          ) : (
            <LinearGradient
              colors={[P.gradient.start, '#4338ca', P.gradient.end]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.coverImg}
            >
              <Ionicons name="image-outline" size={32} color="rgba(255,255,255,0.85)" />
              <Text style={styles.coverPlaceholderText}>{addCoverText}</Text>
            </LinearGradient>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(15,23,42,0.55)']}
            style={styles.coverFade}
            pointerEvents="none"
          />
          {uploadingCover ? (
            <View style={styles.coverLoader}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}
          {coverUri && onDeleteCover ? (
            <TouchableOpacity
              style={styles.deleteChip}
              onPress={(e) => {
                e.stopPropagation?.();
                onDeleteCover();
              }}
              disabled={busy}
              activeOpacity={0.85}
            >
              <Ionicons name="trash-outline" size={14} color="#fff" />
            </TouchableOpacity>
          ) : null}
          <View style={styles.coverFab}>
            <Ionicons name="camera" size={16} color="#fff" />
          </View>
        </TouchableOpacity>

        <View style={styles.identityDock}>
          <TouchableOpacity
            style={styles.avatarDock}
            onPress={onPickAvatar}
            activeOpacity={0.9}
            disabled={busy}
          >
            <ProfileAvatarRing
              uri={avatarUri}
              name={displayName}
              size={AVATAR_SIZE}
              borderWidth={4}
              onPress={undefined}
              uploading={uploadingAvatar}
              showCameraHint
              style={styles.avatarLift}
            />
          </TouchableOpacity>

          <View style={styles.actionRow}>
            <MediaActionPill
              icon="image-outline"
              label={coverLabel}
              onPress={onPickCover}
              disabled={busy}
            />
            <View style={styles.actionDivider} />
            <MediaActionPill
              icon="person-circle-outline"
              label={avatarLabel}
              onPress={onPickAvatar}
              disabled={busy}
            />
          </View>

          {avatarUri && onDeleteAvatar && deleteAvatarLabel ? (
            <TouchableOpacity
              style={styles.removeAvatarLink}
              onPress={onDeleteAvatar}
              disabled={busy}
              activeOpacity={0.85}
            >
              <Ionicons name="trash-outline" size={14} color={P.accent.red} />
              <Text style={styles.removeAvatarText}>{deleteAvatarLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function MediaActionPill({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.pill} onPress={onPress} disabled={disabled} activeOpacity={0.88}>
      <Ionicons name={icon} size={18} color={P.accent.blue} />
      <Text style={styles.pillLabel} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
    gap: 12,
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: P.iconBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: P.text },
  headerHint: { fontSize: 13, color: P.subtext, lineHeight: 19, marginTop: 4 },
  previewCard: {
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: P.card,
    ...P.cardShell,
  },
  coverTouch: {
    height: COVER_HEIGHT,
    width: '100%',
    position: 'relative',
  },
  coverImg: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  coverPlaceholderText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '700',
  },
  coverFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
  },
  coverLoader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverFab: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(15,23,42,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteChip: {
    position: 'absolute',
    left: 12,
    top: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(220,38,38,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityDock: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 18,
    backgroundColor: P.card,
  },
  avatarDock: {
    marginTop: -(AVATAR_SIZE / 2 + 4),
    marginBottom: 12,
  },
  avatarLift: {},
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: P.cardMuted,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: P.border,
    overflow: 'hidden',
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  pillLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: P.text,
    flexShrink: 1,
  },
  actionDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: P.border,
  },
  removeAvatarLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  removeAvatarText: {
    fontSize: 12,
    fontWeight: '600',
    color: P.accent.red,
  },
});
