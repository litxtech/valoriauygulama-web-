import type { ImageStyle } from 'react-native';

/** Harcama fişi önizleme — form, liste ve modal için tutarlı orta boyut */
export const EXPENSE_RECEIPT_PREVIEW_SIZE = 148;

export const expenseReceiptPreviewStyle: ImageStyle = {
  width: EXPENSE_RECEIPT_PREVIEW_SIZE,
  height: EXPENSE_RECEIPT_PREVIEW_SIZE,
  borderRadius: 12,
  backgroundColor: '#e2e8f0',
};

export const EXPENSE_RECEIPT_PREVIEW_COMPACT = 96;

export const expenseReceiptPreviewCompactStyle: ImageStyle = {
  width: EXPENSE_RECEIPT_PREVIEW_COMPACT,
  height: EXPENSE_RECEIPT_PREVIEW_COMPACT,
  borderRadius: 10,
  backgroundColor: '#e2e8f0',
};

export const expenseReceiptPreviewModalStyle: ImageStyle = {
  width: '100%',
  maxWidth: 320,
  height: 280,
  borderRadius: 12,
  alignSelf: 'center',
  backgroundColor: '#0f172a',
};
