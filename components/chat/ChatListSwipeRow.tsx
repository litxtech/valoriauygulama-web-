import { ReactNode, useMemo, useRef } from 'react';
import { Animated, I18nManager, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ChatThemePalette } from '@/hooks/useScreenTheme';
import { useChatTheme } from '@/hooks/useScreenTheme';

export type ChatListSwipeAction = 'mute' | 'archive' | 'delete';

type Props = {
  children: ReactNode;
  enabled?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  onAction: (action: ChatListSwipeAction) => void;
};

const ACTION_WIDTH = 72;
const SWIPE_TRIGGER = 56;
const SWIPE_MAX = ACTION_WIDTH * 3;

function swipeOpenDx(dx: number) {
  return I18nManager.isRTL ? dx : -dx;
}

export function ChatListSwipeRow({
  children,
  enabled = true,
  isMuted,
  onAction,
}: Props) {
  const { t } = useTranslation();
  const chat = useChatTheme();
  const styles = useMemo(() => createStyles(chat), [chat]);
  const translateX = useRef(new Animated.Value(0)).current;

  const reset = () => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          enabled && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) + 4,
        onPanResponderMove: (_, g) => {
          const open = swipeOpenDx(g.dx);
          const clamped = Math.max(-SWIPE_MAX, Math.min(0, open));
          translateX.setValue(clamped);
        },
        onPanResponderRelease: (_, g) => {
          if (swipeOpenDx(g.dx) <= -SWIPE_TRIGGER) {
            Animated.timing(translateX, { toValue: -SWIPE_MAX, duration: 160, useNativeDriver: true }).start();
            return;
          }
          reset();
        },
        onPanResponderTerminate: reset,
      }),
    [enabled]
  );

  if (!enabled) return <>{children}</>;

  return (
    <View style={styles.wrap}>
      <View style={styles.actions}>
        <Pressable
          style={[styles.actionBtn, styles.muteBtn]}
          onPress={() => {
            reset();
            onAction('mute');
          }}
        >
          <Ionicons
            name={isMuted ? 'notifications' : 'notifications-off-outline'}
            size={22}
            color="#fff"
          />
          <Text style={styles.actionLabel}>
            {isMuted ? t('staffChatSwipeUnmute') : t('staffChatSwipeMute')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.archiveBtn]}
          onPress={() => {
            reset();
            onAction('archive');
          }}
        >
          <Ionicons name="archive-outline" size={22} color="#fff" />
          <Text style={styles.actionLabel}>{t('staffChatSwipeArchive')}</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.deleteBtn]}
          onPress={() => {
            reset();
            onAction('delete');
          }}
        >
          <Ionicons name="trash-outline" size={22} color="#fff" />
          <Text style={styles.actionLabel}>{t('staffChatDeleteBtn')}</Text>
        </Pressable>
      </View>
      <Animated.View style={[styles.row, { transform: [{ translateX }] }]} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

function createStyles(chat: ChatThemePalette) {
  return StyleSheet.create({
    wrap: {
      overflow: 'hidden',
    },
    actions: {
      ...StyleSheet.absoluteFillObject,
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    actionBtn: {
      width: ACTION_WIDTH,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 4,
    },
    muteBtn: { backgroundColor: '#6B7280' },
    archiveBtn: { backgroundColor: chat.accentPurple },
    deleteBtn: { backgroundColor: chat.danger },
    actionLabel: { color: '#fff', fontSize: 11, fontWeight: '600' },
    row: {
      backgroundColor: chat.surface,
    },
  });
}
