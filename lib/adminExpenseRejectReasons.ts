import { Alert } from 'react-native';

export const EXPENSE_REJECT_REASONS = [
  { label: 'Yanlış', reason: 'Harcama yanlış.' },
  { label: 'Tekrar giriş', reason: 'Gereksiz tekrar giriş.' },
  { label: 'Kabul edilmedi', reason: 'Kabul edilmedi.' },
] as const;

export function pickExpenseRejectReason(onPick: (reason: string) => void, title = 'Reddet'): void {
  Alert.alert(title, 'Red nedeni seçin (personel bildiriminde görünür).', [
    { text: 'İptal', style: 'cancel' },
    ...EXPENSE_REJECT_REASONS.map((r) => ({
      text: r.label,
      onPress: () => onPick(r.reason),
    })),
  ]);
}

export function confirmBulkApproval(count: number, onConfirm: () => void, label = 'Toplu onay'): void {
  Alert.alert(label, `${count} kayıt onaylanacak. Devam edilsin mi?`, [
    { text: 'İptal', style: 'cancel' },
    { text: 'Onayla', onPress: onConfirm },
  ]);
}

export function confirmBulkReject(count: number, onConfirm: () => void): void {
  Alert.alert('Toplu red', `${count} kayıt reddedilecek. Devam edilsin mi?`, [
    { text: 'İptal', style: 'cancel' },
    { text: 'Reddet', style: 'destructive', onPress: onConfirm },
  ]);
}
