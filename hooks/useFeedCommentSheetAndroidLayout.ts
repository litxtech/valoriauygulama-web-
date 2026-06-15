import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, Platform, type KeyboardEvent } from 'react-native';
import {
  feedCommentCompactCardHeight,
  feedCommentNavBottomPad,
  feedCommentSheetKeyboardMargin,
  FEED_COMMENT_INPUT_DOCK_HEIGHT,
} from '@/lib/feedCommentSheetLayout';

const DEFAULT_KEYBOARD_MS = 260;

type Options = {
  sheetOpen: boolean;
  insetsTop: number;
  insetsBottom: number;
  initialSheetHeight: number;
  /** Personel feed: sürükleyerek boyutlanan sheet ile aynı Animated.Value */
  sheetHeightAnim?: Animated.Value;
  sheetHeightCurrentRef?: React.MutableRefObject<number>;
};

/**
 * Android yorum sheet: klavye + kart yüksekliği tek Animated geçişi (titreme önlenir).
 */
export function useFeedCommentSheetAndroidLayout({
  sheetOpen,
  insetsTop,
  insetsBottom,
  initialSheetHeight,
  sheetHeightAnim: externalSheetHeight,
  sheetHeightCurrentRef,
}: Options) {
  const navPad = feedCommentNavBottomPad(insetsBottom);
  const dockHeightRef = useRef(FEED_COMMENT_INPUT_DOCK_HEIGHT);
  const dockMeasuredRef = useRef(false);
  const keyboardLift = useRef(new Animated.Value(0)).current;
  const cardMarginBottom = useRef(new Animated.Value(navPad + FEED_COMMENT_INPUT_DOCK_HEIGHT)).current;
  const internalSheetHeight = useRef(new Animated.Value(initialSheetHeight)).current;
  const sheetHeightAnim = externalSheetHeight ?? internalSheetHeight;
  const liftRef = useRef(0);
  const animatingRef = useRef(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const runTransition = useCallback(
    (toLift: number, toSheetHeight: number, duration: number) => {
      if (Platform.OS !== 'android') return;
      const dock = dockHeightRef.current;
      // 1px overlap keeps card and input visually connected.
      const toMargin = (toLift > 0 ? toLift : navPad) + dock - 1;
      liftRef.current = toLift;
      animatingRef.current = true;

      Animated.parallel([
        Animated.timing(keyboardLift, {
          toValue: toLift > 0 ? toLift : navPad,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(cardMarginBottom, {
          toValue: toMargin,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(sheetHeightAnim, {
          toValue: toSheetHeight,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start(({ finished }) => {
        animatingRef.current = false;
        if (finished && sheetHeightCurrentRef) {
          sheetHeightCurrentRef.current = toSheetHeight;
        }
      });
    },
    [cardMarginBottom, keyboardLift, navPad, sheetHeightAnim, sheetHeightCurrentRef]
  );

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (sheetOpen) {
      liftRef.current = 0;
      setKeyboardOpen(false);
      dockMeasuredRef.current = false;
      dockHeightRef.current = FEED_COMMENT_INPUT_DOCK_HEIGHT;
      keyboardLift.setValue(navPad);
      cardMarginBottom.setValue(navPad + dockHeightRef.current);
      sheetHeightAnim.setValue(initialSheetHeight);
      if (sheetHeightCurrentRef) sheetHeightCurrentRef.current = initialSheetHeight;
    } else {
      setKeyboardOpen(false);
      keyboardLift.setValue(0);
      cardMarginBottom.setValue(0);
    }
  }, [
    sheetOpen,
    navPad,
    initialSheetHeight,
    keyboardLift,
    cardMarginBottom,
    sheetHeightAnim,
    sheetHeightCurrentRef,
  ]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !sheetOpen) return;

    const onShow = (e: KeyboardEvent) => {
      const h = e.endCoordinates.height;
      const screenY = e.endCoordinates.screenY;
      const lift = feedCommentSheetKeyboardMargin(h, screenY);
      if (Math.abs(lift - liftRef.current) < 6 && keyboardOpen) return;

      const compactH = feedCommentCompactCardHeight(
        screenY,
        h,
        insetsTop,
        dockHeightRef.current,
        initialSheetHeight
      );
      const duration = Math.max(180, Math.min(320, e.duration ?? DEFAULT_KEYBOARD_MS));
      setKeyboardOpen(true);
      runTransition(lift, compactH, duration);
    };

    const onHide = (e: KeyboardEvent) => {
      const duration = Math.max(180, Math.min(320, e.duration ?? DEFAULT_KEYBOARD_MS));
      setKeyboardOpen(false);
      runTransition(0, initialSheetHeight, duration);
    };

    const show = Keyboard.addListener('keyboardDidShow', onShow);
    const hide = Keyboard.addListener('keyboardDidHide', onHide);
    return () => {
      show.remove();
      hide.remove();
    };
  }, [sheetOpen, insetsTop, initialSheetHeight, runTransition]);

  const onDockLayout = useCallback(
    (height: number) => {
      if (height <= 0 || animatingRef.current || dockMeasuredRef.current) return;
      const rounded = Math.ceil(height);
      if (rounded < 48) return;
      dockMeasuredRef.current = true;
      dockHeightRef.current = rounded;
      const lift = liftRef.current > 0 ? liftRef.current : navPad;
      cardMarginBottom.setValue(lift + rounded - 1);
    },
    [cardMarginBottom, navPad]
  );

  return {
    enabled: Platform.OS === 'android',
    keyboardOpen,
    keyboardLift,
    cardMarginBottom,
    sheetHeight: sheetHeightAnim,
    onDockLayout,
  };
}
