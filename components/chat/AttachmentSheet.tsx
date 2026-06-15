import { useEffect, useMemo, useRef } from 'react';
import { Animated, View, Text, Pressable, StyleSheet, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { chatTheme } from '@/constants/chatTheme';

export type AttachmentAction = 'camera' | 'gallery' | 'video_library' | 'video_camera' | 'voice';

type AttachmentItem = {
  action: AttachmentAction;
  labelKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
};

/** WhatsApp-style solid circle colors */
const ATTACHMENT_ITEMS: AttachmentItem[] = [
  { action: 'gallery', labelKey: 'staffChatAttachGallery', icon: 'images', color: '#9C27B0' },
  { action: 'camera', labelKey: 'staffChatAttachCamera', icon: 'camera', color: '#E91E63' },
  { action: 'video_library', labelKey: 'staffChatAttachVideoGallery', icon: 'film', color: '#2196F3' },
  { action: 'video_camera', labelKey: 'staffChatAttachVideoCamera', icon: 'videocam', color: '#FF5722' },
  { action: 'voice', labelKey: 'staffChatAttachVoice', icon: 'mic', color: '#FF9800' },
];

const TRAY_HEIGHT = 188;
const COLS = 3;

type Props = {
  visible: boolean;
  onPick: (action: AttachmentAction) => void;
};

export function AttachmentSheet({ visible, onPick }: Props) {
  const { t } = useTranslation();
  const anim = useRef(new Animated.Value(visible ? 1 : 0)).current;

  const rows = useMemo(() => {
    const items = ATTACHMENT_ITEMS.map((item) => ({
      ...item,
      label: t(item.labelKey),
    }));
    const out: (typeof items)[] = [];
    for (let i = 0; i < items.length; i += COLS) {
      out.push(items.slice(i, i + COLS));
    }
    return out;
  }, [t]);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [visible, anim]);

  const height = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, TRAY_HEIGHT],
  });

  return (
    <Animated.View
      style={[styles.trayOuter, { height }]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <View style={styles.tray}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((item) => (
              <Pressable
                key={item.action}
                style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
                onPress={() => onPick(item.action)}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <View style={[styles.iconCircle, { backgroundColor: item.color }]}>
                  <Ionicons name={item.icon} size={26} color="#FFFFFF" />
                </View>
                <Text style={styles.label} numberOfLines={1}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
            {row.length < COLS
              ? Array.from({ length: COLS - row.length }).map((_, i) => (
                  <View key={`pad-${i}`} style={styles.cell} />
                ))
              : null}
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

/** WhatsApp: paperclip when closed, keyboard when tray open */
export function AttachmentToggleIcon({ open }: { open: boolean }) {
  return (
    <Ionicons
      name={open ? 'keypad-outline' : 'attach'}
      size={24}
      color={open ? chatTheme.accent : chatTheme.textSecondary}
    />
  );
}

const styles = StyleSheet.create({
  trayOuter: {
    overflow: 'hidden',
    backgroundColor: '#F0F2F5',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: chatTheme.border,
  },
  tray: {
    height: TRAY_HEIGHT,
    paddingTop: 14,
    paddingBottom: 10,
    paddingHorizontal: 6,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  cellPressed: {
    opacity: 0.75,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    marginTop: 8,
    fontSize: 12,
    color: '#667781',
    fontWeight: '400',
    textAlign: 'center',
  },
});
