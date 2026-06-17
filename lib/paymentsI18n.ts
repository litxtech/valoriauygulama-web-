import i18n from '@/i18n';

export type PaymentServiceKind =
  | 'food'
  | 'amenity'
  | 'room_service'
  | 'transfer'
  | 'dining'
  | 'generic'
  | 'other'
  | 'staff_tip';

export type PaymentRequestStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled' | 'refunded';

const TR = {
  paymentsTitle: 'Ödeme al',
  paymentsNew: 'Yeni ödeme',
  paymentsHistory: 'Ödeme talepleri',
  paymentsAmount: 'Tutar',
  paymentsAmountPlaceholder: '0.00',
  paymentsTitleLabel: 'Başlık',
  paymentsTitlePlaceholder: 'Örn. 2 battaniye, Akşam yemeği',
  paymentsDescription: 'Açıklama',
  paymentsDescriptionPlaceholder: 'Misafir / oda / detay (isteğe bağlı)',
  paymentsCategory: 'Kategori',
  paymentsCreateQr: 'QR oluştur',
  paymentsQrModeSingle: 'Tek seferlik',
  paymentsQrModeStanding: 'Sabit QR',
  paymentsQrModeStandingVariable: 'Serbest QR',
  paymentsQrModeSingleHint: 'Tek ödeme — QR bir kez kullanılır veya süresi dolar',
  paymentsQrModeStandingHint: 'Sabit tutar — her okutmada aynı tutar tahsil edilir',
  paymentsQrModeStandingVariableHint: 'Müşteri tutarı kendisi girer — kapatana kadar tekrar kullanılır',
  paymentsStandingTitle: 'Sabit QR ödeme',
  paymentsStandingActive: 'Aktif · ödemeye açık',
  paymentsStandingClosed: 'Kapatıldı',
  paymentsCloseQr: 'QR kapat',
  paymentsCloseQrConfirm: 'Bu sabit QR kapatılacak. Yeni ödeme alınamaz. Emin misiniz?',
  paymentsPaidCount: '{{count}} ödeme alındı',
  paymentsPaidTotal: 'Toplam {{amount}}',
  paymentsStandingScanHint: 'Müşteri bu QR\'ı istediği kadar okutabilir — her seferinde yeni ödeme açılır',
  paymentsStandingVariableScanHint: 'Müşteri QR\'ı okutunca tutarı kendisi yazar, ardından güvenli ödeme sayfası açılır',
  paymentsStandingVariableAmount: 'Serbest tutar',
  paymentsCreating: 'Oluşturuluyor…',
  paymentsShowQr: 'QR göster',
  paymentsWaiting: 'Ödeme bekleniyor…',
  paymentsPaid: 'Ödendi ✓',
  paymentsFailed: 'Başarısız',
  paymentsExpired: 'Süresi doldu',
  paymentsCancelled: 'İptal',
  paymentsRefunded: 'İade edildi',
  paymentsArchived: 'Kapatıldı',
  paymentsCancelLink: 'Linki iptal et',
  paymentsCancelLinkConfirm: 'Bekleyen ödeme linki iptal edilecek. Misafir artık ödeyemez.',
  paymentsClosePaidLink: 'Tahsil edildi · kapat',
  paymentsClosePaidLinkConfirm:
    'Ödeme kaydı listeden kaldırılır; link tekrar kullanılamaz. Muhasebe kaydı silinmez.',
  paymentsShowArchived: 'Kapatılanları göster',
  paymentsViewHistory: 'Geçmiş ödemeler',
  paymentsHistoryTitle: 'Geçmiş ödemeler',
  paymentsHistorySub: 'Kapatılan linkler, iptal ve süresi dolan kayıtlar',
  paymentsActiveSub: 'Bekleyen ve ödenmiş · linki kapatılmamış',
  paymentsShareLink: 'Linki paylaş',
  paymentsCopyLink: 'Linki kopyala',
  paymentsCopied: 'Ödeme linki kopyalandı',
  paymentsScanHint: 'Link ve QR Valoria Hotel olarak görünür; ödeme arka planda güvenli Stripe sayfasında tamamlanır',
  paymentsEmpty: 'Henüz ödeme talebi yok',
  paymentsErrorAmount: 'Geçerli bir tutar girin',
  paymentsErrorTitle: 'Başlık girin',
  paymentsErrorStripe: 'Ödeme servisi yapılandırılmamış. STRIPE_SECRET_KEY kontrol edin.',
  paymentsCurrency: 'Para birimi',
  currency_try: '₺ TRY',
  currency_usd: '$ USD',
  currency_eur: '€ EUR',
  currency_sar: '﷼ SAR',
  kind_food: 'Yemek',
  kind_amenity: 'Otel hizmeti / eşya',
  kind_room_service: 'Oda servisi',
  kind_transfer: 'Transfer / tur',
  kind_dining: 'Restoran',
  kind_generic: 'Genel',
  kind_other: 'Diğer',
  kind_staff_tip: 'Bahşiş',
} as const;

const EN: typeof TR = {
  paymentsTitle: 'Collect payment',
  paymentsNew: 'New payment',
  paymentsHistory: 'Payment requests',
  paymentsAmount: 'Amount',
  paymentsAmountPlaceholder: '0.00',
  paymentsTitleLabel: 'Title',
  paymentsTitlePlaceholder: 'e.g. 2 blankets, Dinner',
  paymentsDescription: 'Description',
  paymentsDescriptionPlaceholder: 'Guest / room / details (optional)',
  paymentsCategory: 'Category',
  paymentsCreateQr: 'Create QR',
  paymentsQrModeSingle: 'One-time',
  paymentsQrModeStanding: 'Standing QR',
  paymentsQrModeStandingVariable: 'Open amount QR',
  paymentsQrModeSingleHint: 'Single payment — QR expires after use or timeout',
  paymentsQrModeStandingHint: 'Fixed amount — each scan charges the same amount',
  paymentsQrModeStandingVariableHint: 'Customer enters the amount — reusable until you close it',
  paymentsStandingTitle: 'Standing QR payment',
  paymentsStandingActive: 'Active · accepting payments',
  paymentsStandingClosed: 'Closed',
  paymentsCloseQr: 'Close QR',
  paymentsCloseQrConfirm: 'This standing QR will be closed. No new payments. Continue?',
  paymentsPaidCount: '{{count}} payments received',
  paymentsPaidTotal: 'Total {{amount}}',
  paymentsStandingScanHint: 'Customer can scan anytime — each scan opens a new payment',
  paymentsStandingVariableScanHint: 'Customer scans, enters the amount, then completes secure checkout',
  paymentsStandingVariableAmount: 'Open amount',
  paymentsCreating: 'Creating…',
  paymentsShowQr: 'Show QR',
  paymentsWaiting: 'Waiting for payment…',
  paymentsPaid: 'Paid ✓',
  paymentsFailed: 'Failed',
  paymentsExpired: 'Expired',
  paymentsCancelled: 'Cancelled',
  paymentsRefunded: 'Refunded',
  paymentsArchived: 'Closed',
  paymentsCancelLink: 'Cancel link',
  paymentsCancelLinkConfirm: 'Pending payment link will be cancelled.',
  paymentsClosePaidLink: 'Close (collected)',
  paymentsClosePaidLinkConfirm: 'Removes from list; accounting record is kept.',
  paymentsShowArchived: 'Show closed',
  paymentsViewHistory: 'Payment history',
  paymentsHistoryTitle: 'Payment history',
  paymentsHistorySub: 'Closed links, cancelled and expired records',
  paymentsActiveSub: 'Pending and paid · link not closed',
  paymentsShareLink: 'Share link',
  paymentsCopyLink: 'Copy link',
  paymentsCopied: 'Payment link copied',
  paymentsScanHint: 'Link preview shows Valoria Hotel; payment completes on secure Stripe checkout',
  paymentsEmpty: 'No payment requests yet',
  paymentsErrorAmount: 'Enter a valid amount',
  paymentsErrorTitle: 'Enter a title',
  paymentsErrorStripe: 'Payment service not configured',
  paymentsCurrency: 'Currency',
  currency_try: '₺ TRY',
  currency_usd: '$ USD',
  currency_eur: '€ EUR',
  currency_sar: '﷼ SAR',
  kind_food: 'Food',
  kind_amenity: 'Amenity / item',
  kind_room_service: 'Room service',
  kind_transfer: 'Transfer / tour',
  kind_dining: 'Dining',
  kind_generic: 'General',
  kind_other: 'Other',
  kind_staff_tip: 'Staff tip',
};

const MAP: Record<string, typeof TR> = { tr: TR, en: EN };

export function paymentText(key: keyof typeof TR): string {
  const lang = (i18n.language || 'tr').split('-')[0];
  return MAP[lang]?.[key] ?? TR[key];
}

export function paymentKindLabel(kind: PaymentServiceKind): string {
  return paymentText(`kind_${kind}` as keyof typeof TR);
}

export type PaymentCurrency = 'try' | 'usd' | 'eur' | 'sar';

export const PAYMENT_CURRENCIES: PaymentCurrency[] = ['try', 'usd', 'eur', 'sar'];

export function paymentCurrencyLabel(code: PaymentCurrency): string {
  return paymentText(`currency_${code}` as keyof typeof TR);
}

export const PAYMENT_SERVICE_KINDS: PaymentServiceKind[] = [
  'generic',
  'food',
  'amenity',
  'room_service',
  'dining',
  'transfer',
  'other',
];

export function paymentStatusLabel(
  status: PaymentRequestStatus,
  opts?: { archived?: boolean }
): string {
  if (opts?.archived) return paymentText('paymentsArchived');
  const map: Record<PaymentRequestStatus, keyof typeof TR> = {
    pending: 'paymentsWaiting',
    paid: 'paymentsPaid',
    failed: 'paymentsFailed',
    expired: 'paymentsExpired',
    cancelled: 'paymentsCancelled',
    refunded: 'paymentsRefunded',
  };
  return paymentText(map[status]);
}
