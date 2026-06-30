import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMessagePushToastStore } from '@/stores/messagePushToastStore';
import { chatTheme } from '@/constants/chatTheme';
import { ChatLiveAvatar } from '@/components/chat/ChatLiveAvatar';

const AUTO_HIDE_MS = 6500;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name.trim().charAt(0) || '?').toUpperCase();
}

const AVATAR_SIZE = 44;

export function ValoriaMessagePushToast() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pending = useMessagePushToastStore((s) => s.pending);
  const dismiss = useMessagePushToastStore((s) => s.dismiss);
  const slide = useRef(new Animated.Value(-140)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }

    if (!pending) {
      Animated.parallel([
        Animated.timing(slide, { toValue: -140, duration: 220, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.94, duration: 180, useNativeDriver: true }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.spring(slide, { toValue: 0, friction: 8, tension: 95, useNativeDriver: true }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scale, { toValue: 1, friction: 7, tension: 120, useNativeDriver: true }),
    ]).start();

    hideTimer.current = setTimeout(() => dismiss(), AUTO_HIDE_MS);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [pending, dismiss, slide, opacity, scale]);

  if (!pending) return null;

  const openChat = () => {
    dismiss();
    if (pending.url) {
      router.push(pending.url as never);
      return;
    }
    if (pending.conversationId) {
      router.push(`/staff/chat/${pending.conversationId}` as never);
    }
  };

  const displayGroup = pending.isGroup ? pending.subtitle : null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          top: insets.top + 8,
          opacity,
          transform: [{ translateY: slide }, { scale }],
        },
      ]}
    >
      <Pressable style={styles.card} onPress={openChat} accessibilityRole="button">
        <LinearGradient
          colors={['#0ea5e9', '#2563eb']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.accentBar}
        />
        <View style={styles.avatar}>
          {pending.avatarUri ? (
            <ChatLiveAvatar
              displayName={pending.senderName}
              avatarUri={pending.avatarUri}
              isGroup={pending.isGroup}
              size={AVATAR_SIZE}
              accentColor={chatTheme.accent}
              surfaceColor="#ffffff"
              pulseUnread={false}
              showBadge={false}
            />
          ) : (
            <Text style={styles.avatarText}>{initials(pending.senderName)}</Text>
          )}
        </View>
        <View style={styles.textCol}>
          <View style={styles.kickerRow}>
            <Ionicons name="chatbubble-ellipses" size={11} color={chatTheme.accent} />
            <Text style={styles.kicker}>{t('chatPushToastKicker')}</Text>
          </View>
          <Text style={styles.title} numberOfLines={1}>
            {pending.senderName}
          </Text>
          {displayGroup ? (
            <Text style={styles.groupName} numberOfLines={1}>
              {displayGroup}
            </Text>
          ) : null}
          <Text style={styles.body} numberOfLines={2}>
            {pending.body}
          </Text>
        </View>
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            dismiss();
          }}
          hitSlop={12}
          style={styles.close}
          accessibilityLabel={t('close')}
        >
          <Ionicons name="close" size={17} color="#94a3b8" />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 250,
    elevation: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 20,
    paddingVertical: 12,
    paddingRight: 10,
    paddingLeft: 0,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(14,165,233,0.22)',
    shadowColor: '#0369a1',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  accentBar: {
    width: 4,
    alignSelf: 'stretch',
    marginRight: 10,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  avatar: {
    width: AVATAR_SIZE + 8,
    height: AVATAR_SIZE + 8,
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    lineHeight: AVATAR_SIZE,
    textAlign: 'center',
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#e0f2fe',
    fontSize: 16,
    fontWeight: '800',
    color: '#0369a1',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#bae6fd',
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    color: chatTheme.accent,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.2,
  },
  groupName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 1,
  },
  body: {
    fontSize: 14,
    color: '#334155',
    marginTop: 3,
    lineHeight: 19,
  },
  close: {
    padding: 6,
    alignSelf: 'flex-start',
  },
});
