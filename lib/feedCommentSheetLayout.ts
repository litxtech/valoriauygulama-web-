import { Dimensions, Platform } from 'react-native';

/** Android Modal bazen insets.bottom=0 döner; 3 düğmeli nav için minimum boşluk. */
const ANDROID_NAV_MIN = 28;

/** Klavye açıkken kart üstünde bırakılan boşluk (status bar altı). */
export const FEED_COMMENT_KEYBOARD_TOP_GAP = 16;

/** Input çubuğu tahmini yükseklik. */
export const FEED_COMMENT_INPUT_DOCK_HEIGHT = 80;

/** Klavye kapalıyken input satırı — navigasyon / home indicator. */
export function feedCommentNavBottomPad(safeBottom: number): number {
  if (Platform.OS === 'android') {
    return Math.max(safeBottom, safeBottom > 0 ? 12 : ANDROID_NAV_MIN);
  }
  return Math.max(safeBottom, 8);
}

/** Klavye açıkken input satırı iç boşluğu (iOS, kart içi). */
export function feedCommentInputRowBottomPad(safeBottom: number, keyboardHeight: number): number {
  if (keyboardHeight > 0) {
    return Platform.OS === 'ios' ? Math.max(safeBottom, 8) : 12;
  }
  return feedCommentNavBottomPad(safeBottom);
}

/** Android klavye yüksekliği (IME üst kenarı). */
export function feedCommentSheetKeyboardMargin(
  keyboardHeight: number,
  keyboardScreenY = 0
): number {
  if (Platform.OS !== 'android') return 0;
  if (keyboardHeight <= 0 && keyboardScreenY <= 0) return 0;

  const windowH = Dimensions.get('window').height;
  const liftFromCoords = keyboardScreenY > 0 ? Math.max(0, windowH - keyboardScreenY) : 0;
  return Math.max(keyboardHeight, liftFromCoords);
}

/**
 * Klavye açıkken yorum kartı yüksekliği — üstte boşluk kalmaması için IME üstüne sığdırılır.
 */
export function feedCommentCompactCardHeight(
  keyboardScreenY: number,
  keyboardHeight: number,
  insetsTop: number,
  dockHeight: number,
  initialSheetHeight: number
): number {
  const windowH = Dimensions.get('window').height;
  const kbTop =
    keyboardScreenY > 0 ? keyboardScreenY : Math.max(0, windowH - keyboardHeight);
  const compact = kbTop - insetsTop - FEED_COMMENT_KEYBOARD_TOP_GAP - dockHeight;
  return Math.min(initialSheetHeight, Math.max(200, compact));
}

/**
 * Android: input + kart alt boşluğu (klavye veya nav).
 */
export function feedCommentCardMarginForDock(
  keyboardLift: number,
  safeBottom: number,
  dockHeight = FEED_COMMENT_INPUT_DOCK_HEIGHT
): number {
  const bottom = keyboardLift > 0 ? keyboardLift : feedCommentNavBottomPad(safeBottom);
  return bottom + dockHeight;
}

/** Android yorum Modal'ında sistem çubukları için güvenli alan ölçümü. */
export const FEED_COMMENT_MODAL_ANDROID_PROPS = {
  statusBarTranslucent: true,
  navigationBarTranslucent: true,
} as const;
