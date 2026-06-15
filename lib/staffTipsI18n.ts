import i18n from '@/i18n';

export type StaffTipPaymentMethod = 'stripe_card' | 'room_charge' | 'card_at_desk' | 'cash_at_desk';

export type StaffTipStatus = 'pending' | 'confirmed' | 'cancelled' | 'refunded';

export type StaffTipLang = 'tr' | 'en' | 'ar' | 'de' | 'fr' | 'ru' | 'es';

export type StaffTipTextKey =
  | 'tipButton'
  | 'tipSheetTitle'
  | 'tipSheetSubtitle'
  | 'tipAmountLabel'
  | 'tipCustomAmount'
  | 'tipCustomPlaceholder'
  | 'tipSubmitPay'
  | 'tipSubmitPayShort'
  | 'tipSelectAmount'
  | 'tipSecureHint'
  | 'tipNoteLabel'
  | 'tipNotePlaceholder'
  | 'tipSubmit'
  | 'tipSubmitting'
  | 'tipSuccessTitle'
  | 'tipSuccessPaidTitle'
  | 'tipSuccessPaidBody'
  | 'tipSuccessBody'
  | 'tipPayCancelled'
  | 'tipPayTimeout'
  | 'tipErrorPay'
  | 'tipPayMethodRoom'
  | 'tipPayMethodDeskCard'
  | 'tipPayMethodCash'
  | 'tipErrorLogin'
  | 'tipErrorAmount'
  | 'tipErrorGeneric'
  | 'tipErrorUnavailable'
  | 'tipErrorNotDeployed'
  | 'tipErrorBlocked'
  | 'tipErrorStaffCannotTip'
  | 'tipHistoryTitle'
  | 'tipHistoryEmpty'
  | 'tipStatus_pending'
  | 'tipStatus_confirmed'
  | 'tipStatus_cancelled'
  | 'tipStatus_refunded'
  | 'tipStatus_paidGuest'
  | 'tipStatus_pendingPaymentGuest'
  | 'tipToStaff'
  | 'tipMyTipsLink'
  | 'tipAlertInfo'
  | 'tipAlertError'
  | 'tipAlertOk'
  | 'tipReturnSuccessBody'
  | 'tipReturnPaymentSuccessBody'
  | 'tipReturnPaymentCancelBody'
  | 'tipReturnToApp'
  | 'tipReturnAutoHint'
  | 'tipReturnStaffNotified'
  | 'tipThankYouTitle'
  | 'tipThankYouSubtitle'
  | 'tipThankYouPlaceholder'
  | 'tipThankYouSend'
  | 'tipThankYouSending'
  | 'tipThankYouSent'
  | 'tipThankYouAlreadySent'
  | 'tipThankYouPreset1'
  | 'tipThankYouPreset2'
  | 'tipThankYouPreset3'
  | 'tipStaffTipsScreenTitle'
  | 'tipStaffTipsEmpty'
  | 'tipStaffTipsFromGuest'
  | 'tipStaffTipsSendThanks'
  | 'tipGuestThankYouReceived'
  | 'tipErrorThankYouGeneric'
  | 'tipErrorThankYouUnauthorized'
  | 'tipErrorThankYouNotFound'
  | 'tipErrorThankYouInvalid'
  | 'tipStaffTipsMenuTitle'
  | 'tipStaffTipsMenuSub'
  | 'tipStaffFallback'
  | 'tipRoomLabel'
  | 'tipStripeProductTitle'
  | 'tipReceiptTitle'
  | 'tipReceiptSubtitle'
  | 'tipReceiptNo'
  | 'tipReceiptPaidAt'
  | 'tipReceiptStaff'
  | 'tipReceiptAmount'
  | 'tipReceiptPayment'
  | 'tipReceiptStatusPaid'
  | 'tipReceiptNote'
  | 'tipReceiptThankYou'
  | 'tipReceiptRoom'
  | 'tipReceiptGuest'
  | 'tipReceiptStaffRole'
  | 'tipReceiptServiceType'
  | 'tipReceiptServiceName'
  | 'tipReceiptTransactionRef'
  | 'tipReceiptStripeSecure'
  | 'tipReceiptLegalInvoice'
  | 'tipReceiptLegalGratuity'
  | 'tipReceiptDetailsHeading'
  | 'tipReceiptFooter'
  | 'tipReceiptFooterBrand'
  | 'tipReceiptShare'
  | 'tipReceiptShareWhatsApp'
  | 'tipReceiptSharePdf'
  | 'tipReceiptPickAction'
  | 'tipReceiptCaption'
  | 'tipReceiptError'
  | 'tipReceiptNotReady'
  | 'tipReceiptButton'
  | 'tipReceiptShareButton'
  | 'paymentReceiptAdminCaption'
  | 'paymentReceiptSelectAdmin'
  | 'paymentReceiptSelectRequired'
  | 'paymentReceiptRoleAdmin'
  | 'paymentReceiptRoleOwner'
  | 'paymentReceiptSending'
  | 'paymentReceiptSentTitle'
  | 'paymentReceiptSentBody'
  | 'paymentReceiptSendFailed'
  | 'paymentReceiptLoginRequired'
  | 'paymentReceiptAdminMissing'
  | 'paymentReceiptViewChat'
  | 'paymentReceiptMessageTitle'
  | 'paymentReceiptMessageTitleField'
  | 'paymentReceiptMessageAmount'
  | 'paymentReceiptMessageCategory'
  | 'paymentReceiptMessageDate'
  | 'paymentReceiptMessageRef'
  | 'paymentReceiptMessageStatus';

type TipPack = Record<StaffTipTextKey, string>;

const TR: TipPack = {
  tipButton: 'Bahşiş',
  tipSheetTitle: 'Bahşiş gönder',
  tipSheetSubtitle: '{{name}} için teşekkürünüzü iletin',
  tipAmountLabel: 'Tutar',
  tipCustomAmount: 'Özel tutar',
  tipCustomPlaceholder: 'Tutar girin (₺)',
  tipSubmitPay: 'Kredi kartı ile öde',
  tipSubmitPayShort: 'Kredi kartı ile öde',
  tipSelectAmount: 'Tutar seçin',
  tipSecureHint: 'Güvenli ödeme · anında tahsil',
  tipNoteLabel: 'Not (isteğe bağlı)',
  tipNotePlaceholder: 'Teşekkür mesajınız…',
  tipSubmit: 'Bahşişi gönder',
  tipSubmitting: 'Gönderiliyor…',
  tipSuccessTitle: 'Bahşiş kaydedildi',
  tipSuccessPaidTitle: 'Ödeme tamamlandı',
  tipSuccessPaidBody: '{{amount}} bahşişiniz {{name}} personeline iletildi.',
  tipSuccessBody: '{{amount}} bahşiş talebiniz alındı.',
  tipPayCancelled: 'Ödeme tamamlanmadı veya iptal edildi.',
  tipPayTimeout: 'Ödeme onayı zaman aşımına uğradı. Bahşiş geçmişinizden kontrol edin.',
  tipErrorPay: 'Ödeme servisi yapılandırılmamış. Lütfen resepsiyonla iletişime geçin.',
  tipPayMethodRoom: 'Oda faturası',
  tipPayMethodDeskCard: 'Resepsiyon · kart',
  tipPayMethodCash: 'Resepsiyon · nakit',
  tipErrorLogin: 'Bahşiş göndermek için giriş yapın.',
  tipErrorAmount: '10 ₺ ile 50.000 ₺ arasında bir tutar girin.',
  tipErrorGeneric: 'Bahşiş gönderilemedi. Lütfen tekrar deneyin.',
  tipErrorUnavailable: 'Sunucuya ulaşılamadı. Birkaç saniye bekleyip tekrar deneyin; bahşiş geçmişinizi de kontrol edin.',
  tipErrorNotDeployed: 'Bahşiş modülü henüz sunucuya yüklenmemiş.',
  tipErrorBlocked: 'Bu personele bahşiş gönderemezsiniz.',
  tipErrorStaffCannotTip: 'Bahşiş ödemesi yalnızca misafir hesabından yapılabilir.',
  tipHistoryTitle: 'Bahşişlerim',
  tipHistoryEmpty: 'Henüz bahşiş göndermediniz.',
  tipStatus_pending: 'Bekliyor',
  tipStatus_confirmed: 'Onaylandı',
  tipStatus_cancelled: 'İptal',
  tipStatus_refunded: 'İade edildi',
  tipStatus_paidGuest: 'Ödeme yapıldı ✓',
  tipStatus_pendingPaymentGuest: 'Ödeme bekleniyor…',
  tipToStaff: '{{name}}',
  tipMyTipsLink: 'Bahşiş geçmişim',
  tipAlertInfo: 'Bilgi',
  tipAlertError: 'Hata',
  tipAlertOk: 'Tamam',
  tipReturnSuccessBody: '{{amount}} bahşişiniz {{name}} personeline iletildi.',
  tipReturnPaymentSuccessBody: 'Ödemeniz alındı. Kısa süre içinde ana sayfaya yönlendiriliyorsunuz.',
  tipReturnPaymentCancelBody: 'Ödeme tamamlanmadı. İsterseniz tekrar deneyebilirsiniz.',
  tipReturnToApp: "Valoria'ya dön",
  tipReturnAutoHint: 'Birkaç saniye içinde otomatik yönlendirileceksiniz.',
  tipReturnStaffNotified: 'Personele anlık bildirim gönderildi',
  tipThankYouTitle: 'Teşekkür gönder',
  tipThankYouSubtitle: 'Misafire kısa bir teşekkür iletin',
  tipThankYouPlaceholder: 'Teşekkür mesajınız…',
  tipThankYouSend: 'Teşekkür gönder',
  tipThankYouSending: 'Gönderiliyor…',
  tipThankYouSent: 'Teşekkürünüz iletildi',
  tipThankYouAlreadySent: 'Teşekkür zaten gönderildi',
  tipThankYouPreset1: 'Çok teşekkür ederim!',
  tipThankYouPreset2: 'Desteğiniz için minnettarız.',
  tipThankYouPreset3: 'Güzel konaklamanız dileğiyle!',
  tipStaffTipsScreenTitle: 'Aldığım bahşişler',
  tipStaffTipsEmpty: 'Henüz bahşiş almadınız.',
  tipStaffTipsFromGuest: 'Misafir · {{name}}',
  tipStaffTipsSendThanks: 'Teşekkür gönder',
  tipGuestThankYouReceived: 'Personel teşekkürü',
  tipErrorThankYouGeneric: 'Teşekkür gönderilemedi.',
  tipErrorThankYouUnauthorized: 'Bu bahşiş için teşekkür gönderme yetkiniz yok.',
  tipErrorThankYouNotFound: 'Bahşiş kaydı bulunamadı veya henüz onaylanmadı.',
  tipErrorThankYouInvalid: 'Teşekkür mesajı geçersiz.',
  tipStaffTipsMenuTitle: 'Bahşişler',
  tipStaffTipsMenuSub: 'Gelen bahşişler ve teşekkür',
  tipStaffFallback: 'Personel',
  tipRoomLabel: 'Oda {{room}}',
  tipStripeProductTitle: 'Bahşiş · {{name}}',
  tipReceiptTitle: 'Bahşiş Makbuzu',
  tipReceiptSubtitle: 'Dijital ödeme fişi',
  tipReceiptNo: 'Fiş no',
  tipReceiptPaidAt: 'Ödeme tarihi',
  tipReceiptStaff: 'Alıcı personel',
  tipReceiptAmount: 'Ödenen tutar',
  tipReceiptPayment: 'Ödeme yöntemi',
  tipReceiptStatusPaid: 'Ödeme tamamlandı',
  tipReceiptNote: 'Misafir notu',
  tipReceiptThankYou: 'Personel teşekkürü',
  tipReceiptRoom: 'Oda',
  tipReceiptGuest: 'Misafir',
  tipReceiptStaffRole: 'Görev',
  tipReceiptServiceType: 'Hizmet türü',
  tipReceiptServiceName: 'Personel bahşişi',
  tipReceiptTransactionRef: 'İşlem referansı',
  tipReceiptStripeSecure: 'Ödeme Stripe altyapısı ile güvenle alındı',
  tipReceiptLegalInvoice: 'Bu belge resmi fatura değildir; ödeme bilgilendirme makbuzudur.',
  tipReceiptLegalGratuity: 'Bahşiş tutarı doğrudan ilgili personele yöneliktir; konaklama hizmet bedeli değildir.',
  tipReceiptDetailsHeading: 'İşlem detayları',
  tipReceiptFooter: 'Bilgilendirme amaçlı dijital makbuz · saklayınız',
  tipReceiptFooterBrand: '{{hotelName}}',
  tipReceiptShare: 'Fiş paylaş',
  tipReceiptShareWhatsApp: 'WhatsApp',
  tipReceiptSharePdf: 'PDF paylaş',
  tipReceiptPickAction: 'Makbuzu nasıl paylaşmak istersiniz?',
  tipReceiptCaption: 'Bahşiş makbuzu · {{amount}} · {{name}} · Fiş: {{receiptNo}}',
  tipReceiptError: 'Fiş oluşturulamadı.',
  tipReceiptNotReady: 'Ödeme henüz tamamlanmadı; fiş oluşturulamaz.',
  tipReceiptButton: 'Fişi ilet',
  tipReceiptShareButton: 'Fiş · Paylaş',
  paymentReceiptAdminCaption: 'Fiş iletimi · Admin',
  paymentReceiptSelectAdmin: 'Fişi ileteceğiniz yöneticiyi seçin',
  paymentReceiptSelectRequired: 'Lütfen bir yönetici seçin.',
  paymentReceiptRoleAdmin: 'Admin',
  paymentReceiptRoleOwner: 'Otel sahibi',
  paymentReceiptSending: 'Fiş gönderiliyor…',
  paymentReceiptSentTitle: 'Fiş iletildi',
  paymentReceiptSentBody: 'Fişiniz {{name}} ile uygulama içi mesaj olarak gönderildi.',
  paymentReceiptSendFailed: 'Fiş gönderilemedi. Lütfen tekrar deneyin.',
  paymentReceiptLoginRequired: 'Fiş iletmek için uygulamaya giriş yapın.',
  paymentReceiptAdminMissing: 'Fiş iletilebilecek yönetici bulunamadı.',
  paymentReceiptViewChat: 'Mesajı aç',
  paymentReceiptMessageTitle: 'Ödeme fişi',
  paymentReceiptMessageTitleField: 'Başlık',
  paymentReceiptMessageAmount: 'Tutar',
  paymentReceiptMessageCategory: 'Kategori',
  paymentReceiptMessageDate: 'Tarih',
  paymentReceiptMessageRef: 'Referans',
  paymentReceiptMessageStatus: 'Durum',
};

const EN: TipPack = {
  tipButton: 'Tip',
  tipSheetTitle: 'Send a tip',
  tipSheetSubtitle: 'Show your appreciation to {{name}}',
  tipAmountLabel: 'Amount',
  tipCustomAmount: 'Custom amount',
  tipCustomPlaceholder: 'Enter amount (₺)',
  tipSubmitPay: 'Pay with card',
  tipSubmitPayShort: 'Pay with card',
  tipSelectAmount: 'Select amount',
  tipSecureHint: 'Secure payment · charged instantly',
  tipNoteLabel: 'Note (optional)',
  tipNotePlaceholder: 'Your thank-you message…',
  tipSubmit: 'Send tip',
  tipSubmitting: 'Sending…',
  tipSuccessTitle: 'Tip recorded',
  tipSuccessPaidTitle: 'Payment complete',
  tipSuccessPaidBody: 'Your {{amount}} tip was sent to {{name}}.',
  tipSuccessBody: 'Your {{amount}} tip request was received.',
  tipPayCancelled: 'Payment was not completed or was cancelled.',
  tipPayTimeout: 'Payment confirmation timed out. Check your tip history.',
  tipErrorPay: 'Payment service is not configured. Please contact reception.',
  tipPayMethodRoom: 'Room bill',
  tipPayMethodDeskCard: 'Reception · card',
  tipPayMethodCash: 'Reception · cash',
  tipErrorLogin: 'Sign in to send a tip.',
  tipErrorAmount: 'Enter an amount between 10 ₺ and 50,000 ₺.',
  tipErrorGeneric: 'Could not send tip. Please try again.',
  tipErrorUnavailable: 'Server unreachable. Wait a moment and try again; check your tip history too.',
  tipErrorNotDeployed: 'Tip module is not deployed on the server yet.',
  tipErrorBlocked: 'You cannot send a tip to this staff member.',
  tipErrorStaffCannotTip: 'Tips can only be sent from a guest account.',
  tipHistoryTitle: 'My tips',
  tipHistoryEmpty: 'You have not sent any tips yet.',
  tipStatus_pending: 'Pending',
  tipStatus_confirmed: 'Confirmed',
  tipStatus_cancelled: 'Cancelled',
  tipStatus_refunded: 'Refunded',
  tipStatus_paidGuest: 'Payment completed ✓',
  tipStatus_pendingPaymentGuest: 'Awaiting payment…',
  tipToStaff: '{{name}}',
  tipMyTipsLink: 'Tip history',
  tipAlertInfo: 'Info',
  tipAlertError: 'Error',
  tipAlertOk: 'OK',
  tipReturnSuccessBody: 'Your {{amount}} tip was sent to {{name}}.',
  tipReturnPaymentSuccessBody: 'Payment received. Redirecting you to the home screen shortly.',
  tipReturnPaymentCancelBody: 'Payment was not completed. You can try again if you wish.',
  tipReturnToApp: 'Return to Valoria',
  tipReturnAutoHint: 'You will be redirected automatically in a few seconds.',
  tipReturnStaffNotified: 'Staff member notified instantly',
  tipThankYouTitle: 'Send thank-you',
  tipThankYouSubtitle: 'Send a short thank-you to the guest',
  tipThankYouPlaceholder: 'Your thank-you message…',
  tipThankYouSend: 'Send thank-you',
  tipThankYouSending: 'Sending…',
  tipThankYouSent: 'Thank-you sent',
  tipThankYouAlreadySent: 'Thank-you already sent',
  tipThankYouPreset1: 'Thank you so much!',
  tipThankYouPreset2: 'We truly appreciate your support.',
  tipThankYouPreset3: 'Wishing you a wonderful stay!',
  tipStaffTipsScreenTitle: 'Tips received',
  tipStaffTipsEmpty: 'You have not received any tips yet.',
  tipStaffTipsFromGuest: 'Guest · {{name}}',
  tipStaffTipsSendThanks: 'Send thank-you',
  tipGuestThankYouReceived: 'Staff thank-you',
  tipErrorThankYouGeneric: 'Could not send thank-you.',
  tipErrorThankYouUnauthorized: 'You are not allowed to send a thank-you for this tip.',
  tipErrorThankYouNotFound: 'Tip not found or not confirmed yet.',
  tipErrorThankYouInvalid: 'Invalid thank-you message.',
  tipStaffTipsMenuTitle: 'Tips',
  tipStaffTipsMenuSub: 'Received tips & thank-yous',
  tipStaffFallback: 'Staff',
  tipRoomLabel: 'Room {{room}}',
  tipStripeProductTitle: 'Tip · {{name}}',
  tipReceiptTitle: 'Tip Receipt',
  tipReceiptSubtitle: 'Digital payment receipt',
  tipReceiptNo: 'Receipt no.',
  tipReceiptPaidAt: 'Payment date',
  tipReceiptStaff: 'Staff recipient',
  tipReceiptAmount: 'Amount paid',
  tipReceiptPayment: 'Payment method',
  tipReceiptStatusPaid: 'Payment completed',
  tipReceiptNote: 'Guest note',
  tipReceiptThankYou: 'Staff thank-you',
  tipReceiptRoom: 'Room',
  tipReceiptGuest: 'Guest',
  tipReceiptStaffRole: 'Role',
  tipReceiptServiceType: 'Service type',
  tipReceiptServiceName: 'Staff gratuity',
  tipReceiptTransactionRef: 'Transaction ref.',
  tipReceiptStripeSecure: 'Payment processed securely via Stripe',
  tipReceiptLegalInvoice: 'This is not a tax invoice; informational payment receipt only.',
  tipReceiptLegalGratuity: 'Gratuity is directed to the named staff member, not room charges.',
  tipReceiptDetailsHeading: 'Transaction details',
  tipReceiptFooter: 'Digital informational receipt · please retain',
  tipReceiptFooterBrand: '{{hotelName}}',
  tipReceiptShare: 'Share receipt',
  tipReceiptShareWhatsApp: 'WhatsApp',
  tipReceiptSharePdf: 'Share PDF',
  tipReceiptPickAction: 'How would you like to share the receipt?',
  tipReceiptCaption: 'Tip receipt · {{amount}} · {{name}} · Receipt: {{receiptNo}}',
  tipReceiptError: 'Could not create receipt.',
  tipReceiptNotReady: 'Payment is not complete yet; receipt unavailable.',
  tipReceiptButton: 'Send receipt',
  tipReceiptShareButton: 'Receipt · Share',
  paymentReceiptAdminCaption: 'Receipt · Admin',
  paymentReceiptSelectAdmin: 'Choose who should receive the receipt',
  paymentReceiptSelectRequired: 'Please select an administrator.',
  paymentReceiptRoleAdmin: 'Admin',
  paymentReceiptRoleOwner: 'Owner',
  paymentReceiptSending: 'Sending receipt…',
  paymentReceiptSentTitle: 'Receipt sent',
  paymentReceiptSentBody: 'Your receipt was sent to {{name}} via in-app message.',
  paymentReceiptSendFailed: 'Could not send receipt. Please try again.',
  paymentReceiptLoginRequired: 'Sign in to send the receipt.',
  paymentReceiptAdminMissing: 'Receipt contact not found.',
  paymentReceiptViewChat: 'Open message',
  paymentReceiptMessageTitle: 'Payment receipt',
  paymentReceiptMessageTitleField: 'Title',
  paymentReceiptMessageAmount: 'Amount',
  paymentReceiptMessageCategory: 'Category',
  paymentReceiptMessageDate: 'Date',
  paymentReceiptMessageRef: 'Reference',
  paymentReceiptMessageStatus: 'Status',
};

const AR: TipPack = {
  tipButton: 'بقشيش',
  tipSheetTitle: 'إرسال بقشيش',
  tipSheetSubtitle: 'عبّر عن امتنانك لـ {{name}}',
  tipAmountLabel: 'المبلغ',
  tipCustomAmount: 'مبلغ مخصص',
  tipCustomPlaceholder: 'أدخل المبلغ (₺)',
  tipSubmitPay: 'الدفع بالبطاقة',
  tipSubmitPayShort: 'الدفع بالبطاقة',
  tipSelectAmount: 'اختر المبلغ',
  tipSecureHint: 'دفع آمن · يُخصم فوراً',
  tipNoteLabel: 'ملاحظة (اختياري)',
  tipNotePlaceholder: 'رسالة شكرك…',
  tipSubmit: 'إرسال البقشيش',
  tipSubmitting: 'جارٍ الإرسال…',
  tipSuccessTitle: 'تم تسجيل البقشيش',
  tipSuccessPaidTitle: 'اكتمل الدفع',
  tipSuccessPaidBody: 'تم إرسال بقشيش {{amount}} إلى {{name}}.',
  tipSuccessBody: 'تم استلام طلب بقشيش {{amount}}.',
  tipPayCancelled: 'لم يكتمل الدفع أو تم إلغاؤه.',
  tipPayTimeout: 'انتهت مهلة تأكيد الدفع. راجع سجل البقشيش.',
  tipErrorPay: 'خدمة الدفع غير مهيأة. يرجى التواصل مع الاستقبال.',
  tipPayMethodRoom: 'فاتورة الغرفة',
  tipPayMethodDeskCard: 'الاستقبال · بطاقة',
  tipPayMethodCash: 'الاستقبال · نقداً',
  tipErrorLogin: 'سجّل الدخول لإرسال بقشيش.',
  tipErrorAmount: 'أدخل مبلغاً بين 10 ₺ و 50,000 ₺.',
  tipErrorGeneric: 'تعذّر إرسال البقشيش. حاول مرة أخرى.',
  tipErrorUnavailable: 'تعذّر الوصول إلى الخادم. انتظر قليلاً وحاول مجدداً.',
  tipErrorNotDeployed: 'وحدة البقشيش غير مفعّلة على الخادم بعد.',
  tipErrorBlocked: 'لا يمكنك إرسال بقشيش لهذا الموظف.',
  tipErrorStaffCannotTip: 'يمكن إرسال البقشيش من حساب ضيف فقط.',
  tipHistoryTitle: 'بقشيشي',
  tipHistoryEmpty: 'لم ترسل أي بقشيش بعد.',
  tipStatus_pending: 'قيد الانتظار',
  tipStatus_confirmed: 'مؤكد',
  tipStatus_cancelled: 'ملغى',
  tipStatus_refunded: 'مسترد',
  tipToStaff: '{{name}}',
  tipMyTipsLink: 'سجل البقشيش',
  tipAlertInfo: 'معلومة',
  tipAlertError: 'خطأ',
  tipAlertOk: 'حسناً',
  tipReturnSuccessBody: 'تم إرسال بقشيش {{amount}} إلى {{name}}.',
  tipReturnPaymentSuccessBody: 'تم استلام الدفع. سيتم توجيهك إلى الصفحة الرئيسية قريباً.',
  tipReturnPaymentCancelBody: 'لم يكتمل الدفع. يمكنك المحاولة مرة أخرى.',
  tipReturnToApp: 'العودة إلى Valoria',
  tipReturnAutoHint: 'سيتم توجيهك تلقائياً خلال ثوانٍ.',
  tipReturnStaffNotified: 'تم إبلاغ الموظف فوراً',
  tipThankYouTitle: 'إرسال شكر',
  tipThankYouSubtitle: 'أرسل رسالة شكر قصيرة للضيف',
  tipThankYouPlaceholder: 'رسالة الشكر…',
  tipThankYouSend: 'إرسال الشكر',
  tipThankYouSending: 'جارٍ الإرسال…',
  tipThankYouSent: 'تم إرسال الشكر',
  tipThankYouAlreadySent: 'تم إرسال الشكر مسبقاً',
  tipThankYouPreset1: 'شكراً جزيلاً!',
  tipThankYouPreset2: 'نقدّر دعمكم كثيراً.',
  tipThankYouPreset3: 'نتمنى لكم إقامة رائعة!',
  tipStaffTipsScreenTitle: 'البقشيش المستلم',
  tipStaffTipsEmpty: 'لم تتلقَ أي بقشيش بعد.',
  tipStaffTipsFromGuest: 'ضيف · {{name}}',
  tipStaffTipsSendThanks: 'إرسال شكر',
  tipGuestThankYouReceived: 'شكر من الموظف',
  tipErrorThankYouGeneric: 'تعذّر إرسال الشكر.',
  tipErrorThankYouUnauthorized: 'لا يمكنك إرسال شكر لهذا البقشيش.',
  tipErrorThankYouNotFound: 'لم يُعثر على البقشيش أو لم يُؤكَّد بعد.',
  tipErrorThankYouInvalid: 'رسالة الشكر غير صالحة.',
  tipStaffTipsMenuTitle: 'البقشيش',
  tipStaffTipsMenuSub: 'البقشيش والشكر',
  tipStaffFallback: 'موظف',
  tipRoomLabel: 'غرفة {{room}}',
  tipStripeProductTitle: 'بقشيش · {{name}}',
  tipReceiptTitle: 'إيصال البقشيش',
  tipReceiptSubtitle: 'إيصال دفع رقمي',
  tipReceiptNo: 'رقم الإيصال',
  tipReceiptPaidAt: 'تاريخ الدفع',
  tipReceiptStaff: 'الموظف المستلم',
  tipReceiptAmount: 'المبلغ المدفوع',
  tipReceiptPayment: 'طريقة الدفع',
  tipReceiptStatusPaid: 'اكتمل الدفع',
  tipReceiptNote: 'ملاحظة الضيف',
  tipReceiptThankYou: 'شكر الموظف',
  tipReceiptRoom: 'الغرفة',
  tipReceiptGuest: 'الضيف',
  tipReceiptStaffRole: 'الدور',
  tipReceiptServiceType: 'نوع الخدمة',
  tipReceiptServiceName: 'بقشيش للموظف',
  tipReceiptTransactionRef: 'مرجع المعاملة',
  tipReceiptStripeSecure: 'تم الدفع بأمان عبر Stripe',
  tipReceiptLegalInvoice: 'هذه ليست فاتورة رسمية؛ إيصال معلوماتي فقط.',
  tipReceiptLegalGratuity: 'البقشيش موجه للموظف المذكور وليس رسوم الإقامة.',
  tipReceiptDetailsHeading: 'تفاصيل المعاملة',
  tipReceiptFooter: 'إيصال رقمي معلوماتي · احتفظ به',
  tipReceiptFooterBrand: '{{hotelName}}',
  tipReceiptShare: 'مشاركة الإيصال',
  tipReceiptShareWhatsApp: 'واتساب',
  tipReceiptSharePdf: 'مشاركة PDF',
  tipReceiptPickAction: 'كيف تريد مشاركة الإيصال؟',
  tipReceiptCaption: 'إيصال بقشيش · {{amount}} · {{name}} · {{receiptNo}}',
  tipReceiptError: 'تعذّر إنشاء الإيصال.',
  tipReceiptNotReady: 'الدفع لم يكتمل بعد.',
  tipReceiptButton: 'إرسال الإيصال',
  tipReceiptShareButton: 'إيصال · مشاركة',
  paymentReceiptAdminCaption: 'الإيصال · المسؤول',
  paymentReceiptSelectAdmin: 'اختر المسؤول الذي سيستلم الإيصال',
  paymentReceiptSelectRequired: 'يرجى اختيار مسؤول.',
  paymentReceiptRoleAdmin: 'مسؤول',
  paymentReceiptRoleOwner: 'مالك الفندق',
  paymentReceiptSending: 'جارٍ إرسال الإيصال…',
  paymentReceiptSentTitle: 'تم إرسال الإيصال',
  paymentReceiptSentBody: 'تم إرسال إيصالك إلى {{name}} عبر الرسائل داخل التطبيق.',
  paymentReceiptSendFailed: 'تعذّر إرسال الإيصال. حاول مرة أخرى.',
  paymentReceiptLoginRequired: 'سجّل الدخول لإرسال الإيصال.',
  paymentReceiptAdminMissing: 'لم يُعثر على مسؤول الإيصال.',
  paymentReceiptViewChat: 'فتح المحادثة',
  paymentReceiptMessageTitle: 'إيصال الدفع',
  paymentReceiptMessageTitleField: 'العنوان',
  paymentReceiptMessageAmount: 'المبلغ',
  paymentReceiptMessageCategory: 'الفئة',
  paymentReceiptMessageDate: 'التاريخ',
  paymentReceiptMessageRef: 'المرجع',
  paymentReceiptMessageStatus: 'الحالة',
};

const DE: TipPack = {
  tipButton: 'Trinkgeld',
  tipSheetTitle: 'Trinkgeld senden',
  tipSheetSubtitle: 'Zeigen Sie {{name}} Ihre Wertschätzung',
  tipAmountLabel: 'Betrag',
  tipCustomAmount: 'Eigener Betrag',
  tipCustomPlaceholder: 'Betrag eingeben (₺)',
  tipSubmitPay: 'Mit Karte zahlen',
  tipSubmitPayShort: 'Mit Karte zahlen',
  tipSelectAmount: 'Betrag wählen',
  tipSecureHint: 'Sichere Zahlung · sofort abgebucht',
  tipNoteLabel: 'Notiz (optional)',
  tipNotePlaceholder: 'Ihre Dankesnachricht…',
  tipSubmit: 'Trinkgeld senden',
  tipSubmitting: 'Wird gesendet…',
  tipSuccessTitle: 'Trinkgeld erfasst',
  tipSuccessPaidTitle: 'Zahlung abgeschlossen',
  tipSuccessPaidBody: 'Ihr Trinkgeld {{amount}} wurde an {{name}} gesendet.',
  tipSuccessBody: 'Ihre Trinkgeld-Anfrage {{amount}} wurde empfangen.',
  tipPayCancelled: 'Zahlung nicht abgeschlossen oder abgebrochen.',
  tipPayTimeout: 'Zahlungsbestätigung abgelaufen. Prüfen Sie Ihren Trinkgeld-Verlauf.',
  tipErrorPay: 'Zahlungsdienst nicht konfiguriert. Bitte Rezeption kontaktieren.',
  tipPayMethodRoom: 'Zimmerrechnung',
  tipPayMethodDeskCard: 'Rezeption · Karte',
  tipPayMethodCash: 'Rezeption · bar',
  tipErrorLogin: 'Melden Sie sich an, um Trinkgeld zu senden.',
  tipErrorAmount: 'Betrag zwischen 10 ₺ und 50.000 ₺ eingeben.',
  tipErrorGeneric: 'Trinkgeld konnte nicht gesendet werden.',
  tipErrorUnavailable: 'Server nicht erreichbar. Bitte kurz warten und erneut versuchen.',
  tipErrorNotDeployed: 'Trinkgeld-Modul ist auf dem Server noch nicht aktiv.',
  tipErrorBlocked: 'An dieses Personal können Sie kein Trinkgeld senden.',
  tipErrorStaffCannotTip: 'Trinkgeld kann nur von einem Gästekonto gesendet werden.',
  tipHistoryTitle: 'Meine Trinkgelder',
  tipHistoryEmpty: 'Sie haben noch kein Trinkgeld gesendet.',
  tipStatus_pending: 'Ausstehend',
  tipStatus_confirmed: 'Bestätigt',
  tipStatus_cancelled: 'Storniert',
  tipStatus_refunded: 'Erstattet',
  tipToStaff: '{{name}}',
  tipMyTipsLink: 'Trinkgeld-Verlauf',
  tipAlertInfo: 'Info',
  tipAlertError: 'Fehler',
  tipAlertOk: 'OK',
  tipReturnSuccessBody: 'Ihr Trinkgeld {{amount}} wurde an {{name}} gesendet.',
  tipReturnPaymentSuccessBody: 'Zahlung erhalten. Sie werden gleich zur Startseite weitergeleitet.',
  tipReturnPaymentCancelBody: 'Zahlung nicht abgeschlossen. Sie können es erneut versuchen.',
  tipReturnToApp: 'Zurück zu Valoria',
  tipReturnAutoHint: 'Automatische Weiterleitung in wenigen Sekunden.',
  tipReturnStaffNotified: 'Mitarbeiter sofort benachrichtigt',
  tipThankYouTitle: 'Dank senden',
  tipThankYouSubtitle: 'Kurze Dankesnachricht an den Gast',
  tipThankYouPlaceholder: 'Ihre Dankesnachricht…',
  tipThankYouSend: 'Dank senden',
  tipThankYouSending: 'Wird gesendet…',
  tipThankYouSent: 'Dank gesendet',
  tipThankYouAlreadySent: 'Dank bereits gesendet',
  tipThankYouPreset1: 'Vielen herzlichen Dank!',
  tipThankYouPreset2: 'Wir schätzen Ihre Unterstützung sehr.',
  tipThankYouPreset3: 'Einen schönen Aufenthalt!',
  tipStaffTipsScreenTitle: 'Erhaltene Trinkgelder',
  tipStaffTipsEmpty: 'Sie haben noch kein Trinkgeld erhalten.',
  tipStaffTipsFromGuest: 'Gast · {{name}}',
  tipStaffTipsSendThanks: 'Dank senden',
  tipGuestThankYouReceived: 'Dank vom Personal',
  tipErrorThankYouGeneric: 'Dank konnte nicht gesendet werden.',
  tipErrorThankYouUnauthorized: 'Keine Berechtigung für dieses Trinkgeld.',
  tipErrorThankYouNotFound: 'Trinkgeld nicht gefunden oder noch nicht bestätigt.',
  tipErrorThankYouInvalid: 'Ungültige Dankesnachricht.',
  tipStaffTipsMenuTitle: 'Trinkgeld',
  tipStaffTipsMenuSub: 'Trinkgelder & Dank',
  tipStaffFallback: 'Personal',
  tipRoomLabel: 'Zimmer {{room}}',
  tipStripeProductTitle: 'Trinkgeld · {{name}}',
  tipReceiptTitle: 'Trinkgeld-Beleg',
  tipReceiptSubtitle: 'Digitaler Zahlungsbeleg',
  tipReceiptNo: 'Beleg-Nr.',
  tipReceiptPaidAt: 'Zahlungsdatum',
  tipReceiptStaff: 'Empfänger (Personal)',
  tipReceiptAmount: 'Gezahlter Betrag',
  tipReceiptPayment: 'Zahlungsart',
  tipReceiptStatusPaid: 'Zahlung abgeschlossen',
  tipReceiptNote: 'Gastnotiz',
  tipReceiptThankYou: 'Dank des Personals',
  tipReceiptRoom: 'Zimmer',
  tipReceiptGuest: 'Gast',
  tipReceiptStaffRole: 'Funktion',
  tipReceiptServiceType: 'Leistungsart',
  tipReceiptServiceName: 'Trinkgeld fürs Personal',
  tipReceiptTransactionRef: 'Transaktionsref.',
  tipReceiptStripeSecure: 'Zahlung sicher über Stripe verarbeitet',
  tipReceiptLegalInvoice: 'Keine Steuerrechnung; nur informativer Zahlungsbeleg.',
  tipReceiptLegalGratuity: 'Trinkgeld geht an das genannte Personal, nicht an die Übernachtung.',
  tipReceiptDetailsHeading: 'Transaktionsdetails',
  tipReceiptFooter: 'Digitaler Info-Beleg · bitte aufbewahren',
  tipReceiptFooterBrand: '{{hotelName}}',
  tipReceiptShare: 'Beleg teilen',
  tipReceiptShareWhatsApp: 'WhatsApp',
  tipReceiptSharePdf: 'PDF teilen',
  tipReceiptPickAction: 'Wie möchten Sie den Beleg teilen?',
  tipReceiptCaption: 'Trinkgeld-Beleg · {{amount}} · {{name}} · {{receiptNo}}',
  tipReceiptError: 'Beleg konnte nicht erstellt werden.',
  tipReceiptNotReady: 'Zahlung noch nicht abgeschlossen.',
  tipReceiptButton: 'Beleg senden',
  tipReceiptShareButton: 'Beleg · Teilen',
  paymentReceiptAdminCaption: 'Beleg · Admin',
  paymentReceiptSelectAdmin: 'Wählen Sie den Administrator für den Beleg',
  paymentReceiptSelectRequired: 'Bitte einen Administrator wählen.',
  paymentReceiptRoleAdmin: 'Admin',
  paymentReceiptRoleOwner: 'Inhaber',
  paymentReceiptSending: 'Beleg wird gesendet…',
  paymentReceiptSentTitle: 'Beleg gesendet',
  paymentReceiptSentBody: 'Ihr Beleg wurde an {{name}} per In-App-Nachricht gesendet.',
  paymentReceiptSendFailed: 'Beleg konnte nicht gesendet werden.',
  paymentReceiptLoginRequired: 'Melden Sie sich an, um den Beleg zu senden.',
  paymentReceiptAdminMissing: 'Beleg-Kontakt nicht gefunden.',
  paymentReceiptViewChat: 'Nachricht öffnen',
  paymentReceiptMessageTitle: 'Zahlungsbeleg',
  paymentReceiptMessageTitleField: 'Titel',
  paymentReceiptMessageAmount: 'Betrag',
  paymentReceiptMessageCategory: 'Kategorie',
  paymentReceiptMessageDate: 'Datum',
  paymentReceiptMessageRef: 'Referenz',
  paymentReceiptMessageStatus: 'Status',
};

const FR: TipPack = {
  tipButton: 'Pourboire',
  tipSheetTitle: 'Envoyer un pourboire',
  tipSheetSubtitle: 'Remerciez {{name}}',
  tipAmountLabel: 'Montant',
  tipCustomAmount: 'Montant personnalisé',
  tipCustomPlaceholder: 'Saisir le montant (₺)',
  tipSubmitPay: 'Payer par carte',
  tipSubmitPayShort: 'Payer par carte',
  tipSelectAmount: 'Choisir un montant',
  tipSecureHint: 'Paiement sécurisé · débit immédiat',
  tipNoteLabel: 'Note (facultatif)',
  tipNotePlaceholder: 'Votre message de remerciement…',
  tipSubmit: 'Envoyer le pourboire',
  tipSubmitting: 'Envoi…',
  tipSuccessTitle: 'Pourboire enregistré',
  tipSuccessPaidTitle: 'Paiement terminé',
  tipSuccessPaidBody: 'Votre pourboire {{amount}} a été envoyé à {{name}}.',
  tipSuccessBody: 'Votre demande de pourboire {{amount}} a été reçue.',
  tipPayCancelled: 'Paiement non terminé ou annulé.',
  tipPayTimeout: 'Délai de confirmation dépassé. Consultez votre historique.',
  tipErrorPay: 'Service de paiement non configuré. Contactez la réception.',
  tipPayMethodRoom: 'Facture chambre',
  tipPayMethodDeskCard: 'Réception · carte',
  tipPayMethodCash: 'Réception · espèces',
  tipErrorLogin: 'Connectez-vous pour envoyer un pourboire.',
  tipErrorAmount: 'Saisissez un montant entre 10 ₺ et 50 000 ₺.',
  tipErrorGeneric: 'Impossible d\'envoyer le pourboire.',
  tipErrorUnavailable: 'Serveur inaccessible. Réessayez dans un instant.',
  tipErrorNotDeployed: 'Module pourboire non déployé sur le serveur.',
  tipErrorBlocked: 'Vous ne pouvez pas envoyer de pourboire à ce membre du personnel.',
  tipErrorStaffCannotTip: 'Les pourboires ne peuvent être envoyés que depuis un compte client.',
  tipHistoryTitle: 'Mes pourboires',
  tipHistoryEmpty: 'Vous n\'avez encore envoyé aucun pourboire.',
  tipStatus_pending: 'En attente',
  tipStatus_confirmed: 'Confirmé',
  tipStatus_cancelled: 'Annulé',
  tipStatus_refunded: 'Remboursé',
  tipToStaff: '{{name}}',
  tipMyTipsLink: 'Historique des pourboires',
  tipAlertInfo: 'Info',
  tipAlertError: 'Erreur',
  tipAlertOk: 'OK',
  tipReturnSuccessBody: 'Votre pourboire {{amount}} a été envoyé à {{name}}.',
  tipReturnPaymentSuccessBody: 'Paiement reçu. Redirection vers l\'accueil.',
  tipReturnPaymentCancelBody: 'Paiement non terminé. Vous pouvez réessayer.',
  tipReturnToApp: 'Retour à Valoria',
  tipReturnAutoHint: 'Redirection automatique dans quelques secondes.',
  tipReturnStaffNotified: 'Le personnel a été notifié instantanément',
  tipThankYouTitle: 'Envoyer un remerciement',
  tipThankYouSubtitle: 'Envoyez un court remerciement au client',
  tipThankYouPlaceholder: 'Votre message de remerciement…',
  tipThankYouSend: 'Envoyer',
  tipThankYouSending: 'Envoi…',
  tipThankYouSent: 'Remerciement envoyé',
  tipThankYouAlreadySent: 'Remerciement déjà envoyé',
  tipThankYouPreset1: 'Merci beaucoup !',
  tipThankYouPreset2: 'Nous apprécions vraiment votre soutien.',
  tipThankYouPreset3: 'Excellent séjour à vous !',
  tipStaffTipsScreenTitle: 'Pourboires reçus',
  tipStaffTipsEmpty: 'Vous n\'avez pas encore reçu de pourboire.',
  tipStaffTipsFromGuest: 'Client · {{name}}',
  tipStaffTipsSendThanks: 'Remercier',
  tipGuestThankYouReceived: 'Remerciement du personnel',
  tipErrorThankYouGeneric: 'Impossible d\'envoyer le remerciement.',
  tipErrorThankYouUnauthorized: 'Vous ne pouvez pas envoyer de remerciement pour ce pourboire.',
  tipErrorThankYouNotFound: 'Pourboire introuvable ou non confirmé.',
  tipErrorThankYouInvalid: 'Message de remerciement invalide.',
  tipStaffTipsMenuTitle: 'Pourboires',
  tipStaffTipsMenuSub: 'Pourboires et remerciements',
  tipStaffFallback: 'Personnel',
  tipRoomLabel: 'Chambre {{room}}',
  tipStripeProductTitle: 'Pourboire · {{name}}',
  tipReceiptTitle: 'Reçu de pourboire',
  tipReceiptSubtitle: 'Reçu de paiement numérique',
  tipReceiptNo: 'N° de reçu',
  tipReceiptPaidAt: 'Date de paiement',
  tipReceiptStaff: 'Personnel destinataire',
  tipReceiptAmount: 'Montant payé',
  tipReceiptPayment: 'Mode de paiement',
  tipReceiptStatusPaid: 'Paiement terminé',
  tipReceiptNote: 'Note du client',
  tipReceiptThankYou: 'Remerciement du personnel',
  tipReceiptRoom: 'Chambre',
  tipReceiptGuest: 'Client',
  tipReceiptStaffRole: 'Fonction',
  tipReceiptServiceType: 'Type de service',
  tipReceiptServiceName: 'Pourboire personnel',
  tipReceiptTransactionRef: 'Réf. transaction',
  tipReceiptStripeSecure: 'Paiement sécurisé via Stripe',
  tipReceiptLegalInvoice: 'Ce document n\'est pas une facture fiscale.',
  tipReceiptLegalGratuity: 'Pourboire destiné au personnel nommé, pas aux frais de séjour.',
  tipReceiptDetailsHeading: 'Détails de la transaction',
  tipReceiptFooter: 'Reçu numérique informatif · à conserver',
  tipReceiptFooterBrand: '{{hotelName}}',
  tipReceiptShare: 'Partager le reçu',
  tipReceiptShareWhatsApp: 'WhatsApp',
  tipReceiptSharePdf: 'Partager PDF',
  tipReceiptPickAction: 'Comment partager le reçu ?',
  tipReceiptCaption: 'Reçu · {{amount}} · {{name}} · {{receiptNo}}',
  tipReceiptError: 'Impossible de créer le reçu.',
  tipReceiptNotReady: 'Paiement pas encore terminé.',
  tipReceiptButton: 'Envoyer le reçu',
  tipReceiptShareButton: 'Reçu · Partager',
  paymentReceiptAdminCaption: 'Reçu · Admin',
  paymentReceiptSelectAdmin: 'Choisissez qui recevra le reçu',
  paymentReceiptSelectRequired: 'Veuillez sélectionner un administrateur.',
  paymentReceiptRoleAdmin: 'Admin',
  paymentReceiptRoleOwner: 'Propriétaire',
  paymentReceiptSending: 'Envoi du reçu…',
  paymentReceiptSentTitle: 'Reçu envoyé',
  paymentReceiptSentBody: 'Votre reçu a été envoyé à {{name}} par message in-app.',
  paymentReceiptSendFailed: 'Impossible d\'envoyer le reçu.',
  paymentReceiptLoginRequired: 'Connectez-vous pour envoyer le reçu.',
  paymentReceiptAdminMissing: 'Contact reçu introuvable.',
  paymentReceiptViewChat: 'Ouvrir le message',
  paymentReceiptMessageTitle: 'Reçu de paiement',
  paymentReceiptMessageTitleField: 'Titre',
  paymentReceiptMessageAmount: 'Montant',
  paymentReceiptMessageCategory: 'Catégorie',
  paymentReceiptMessageDate: 'Date',
  paymentReceiptMessageRef: 'Référence',
  paymentReceiptMessageStatus: 'Statut',
};

const RU: TipPack = {
  tipButton: 'Чаевые',
  tipSheetTitle: 'Отправить чаевые',
  tipSheetSubtitle: 'Выразите благодарность {{name}}',
  tipAmountLabel: 'Сумма',
  tipCustomAmount: 'Своя сумма',
  tipCustomPlaceholder: 'Введите сумму (₺)',
  tipSubmitPay: 'Оплатить картой',
  tipSubmitPayShort: 'Оплатить картой',
  tipSelectAmount: 'Выберите сумму',
  tipSecureHint: 'Безопасная оплата · мгновенное списание',
  tipNoteLabel: 'Заметка (необязательно)',
  tipNotePlaceholder: 'Ваше сообщение благодарности…',
  tipSubmit: 'Отправить чаевые',
  tipSubmitting: 'Отправка…',
  tipSuccessTitle: 'Чаевые записаны',
  tipSuccessPaidTitle: 'Оплата завершена',
  tipSuccessPaidBody: 'Чаевые {{amount}} отправлены сотруднику {{name}}.',
  tipSuccessBody: 'Запрос на чаевые {{amount}} получен.',
  tipPayCancelled: 'Оплата не завершена или отменена.',
  tipPayTimeout: 'Истекло время подтверждения. Проверьте историю чаевых.',
  tipErrorPay: 'Платёжный сервис не настроен. Обратитесь на ресепшен.',
  tipPayMethodRoom: 'Счёт номера',
  tipPayMethodDeskCard: 'Ресепшен · карта',
  tipPayMethodCash: 'Ресепшен · наличные',
  tipErrorLogin: 'Войдите, чтобы отправить чаевые.',
  tipErrorAmount: 'Введите сумму от 10 ₺ до 50 000 ₺.',
  tipErrorGeneric: 'Не удалось отправить чаевые.',
  tipErrorUnavailable: 'Сервер недоступен. Подождите и попробуйте снова.',
  tipErrorNotDeployed: 'Модуль чаевых ещё не развёрнут на сервере.',
  tipErrorBlocked: 'Вы не можете отправить чаевые этому сотруднику.',
  tipErrorStaffCannotTip: 'Чаевые можно отправлять только с гостевого аккаунта.',
  tipHistoryTitle: 'Мои чаевые',
  tipHistoryEmpty: 'Вы ещё не отправляли чаевые.',
  tipStatus_pending: 'Ожидание',
  tipStatus_confirmed: 'Подтверждено',
  tipStatus_cancelled: 'Отменено',
  tipStatus_refunded: 'Возвращено',
  tipToStaff: '{{name}}',
  tipMyTipsLink: 'История чаевых',
  tipAlertInfo: 'Информация',
  tipAlertError: 'Ошибка',
  tipAlertOk: 'OK',
  tipReturnSuccessBody: 'Чаевые {{amount}} отправлены сотруднику {{name}}.',
  tipReturnPaymentSuccessBody: 'Оплата получена. Скоро вернём вас на главный экран.',
  tipReturnPaymentCancelBody: 'Оплата не завершена. Можете попробовать снова.',
  tipReturnToApp: 'Вернуться в Valoria',
  tipReturnAutoHint: 'Автоматическое перенаправление через несколько секунд.',
  tipReturnStaffNotified: 'Сотрудник сразу получил уведомление',
  tipThankYouTitle: 'Отправить благодарность',
  tipThankYouSubtitle: 'Короткое спасибо гостю',
  tipThankYouPlaceholder: 'Ваше сообщение…',
  tipThankYouSend: 'Отправить',
  tipThankYouSending: 'Отправка…',
  tipThankYouSent: 'Благодарность отправлена',
  tipThankYouAlreadySent: 'Благодарность уже отправлена',
  tipThankYouPreset1: 'Большое спасибо!',
  tipThankYouPreset2: 'Мы очень ценим вашу поддержку.',
  tipThankYouPreset3: 'Желаем отличного отдыха!',
  tipStaffTipsScreenTitle: 'Полученные чаевые',
  tipStaffTipsEmpty: 'Вы ещё не получали чаевые.',
  tipStaffTipsFromGuest: 'Гость · {{name}}',
  tipStaffTipsSendThanks: 'Поблагодарить',
  tipGuestThankYouReceived: 'Благодарность от персонала',
  tipErrorThankYouGeneric: 'Не удалось отправить благодарность.',
  tipErrorThankYouUnauthorized: 'Нет прав отправить благодарность за это чаевые.',
  tipErrorThankYouNotFound: 'Чаевые не найдены или ещё не подтверждены.',
  tipErrorThankYouInvalid: 'Недопустимое сообщение благодарности.',
  tipStaffTipsMenuTitle: 'Чаевые',
  tipStaffTipsMenuSub: 'Чаевые и благодарности',
  tipStaffFallback: 'Сотрудник',
  tipRoomLabel: 'Номер {{room}}',
  tipStripeProductTitle: 'Чаевые · {{name}}',
  tipReceiptTitle: 'Квитанция о чаевых',
  tipReceiptSubtitle: 'Цифровая квитанция об оплате',
  tipReceiptNo: '№ квитанции',
  tipReceiptPaidAt: 'Дата оплаты',
  tipReceiptStaff: 'Сотрудник-получатель',
  tipReceiptAmount: 'Оплаченная сумма',
  tipReceiptPayment: 'Способ оплаты',
  tipReceiptStatusPaid: 'Оплата завершена',
  tipReceiptNote: 'Заметка гостя',
  tipReceiptThankYou: 'Благодарность персонала',
  tipReceiptRoom: 'Номер',
  tipReceiptGuest: 'Гость',
  tipReceiptStaffRole: 'Должность',
  tipReceiptServiceType: 'Тип услуги',
  tipReceiptServiceName: 'Чаевые персоналу',
  tipReceiptTransactionRef: 'Ссылка на транзакцию',
  tipReceiptStripeSecure: 'Платёж безопасно обработан через Stripe',
  tipReceiptLegalInvoice: 'Не является налоговым счётом; информационная квитанция.',
  tipReceiptLegalGratuity: 'Чаевые предназначены указанному сотруднику.',
  tipReceiptDetailsHeading: 'Детали транзакции',
  tipReceiptFooter: 'Цифровая информационная квитанция · сохраните',
  tipReceiptFooterBrand: '{{hotelName}}',
  tipReceiptShare: 'Поделиться квитанцией',
  tipReceiptShareWhatsApp: 'WhatsApp',
  tipReceiptSharePdf: 'Поделиться PDF',
  tipReceiptPickAction: 'Как поделиться квитанцией?',
  tipReceiptCaption: 'Чаевые · {{amount}} · {{name}} · {{receiptNo}}',
  tipReceiptError: 'Не удалось создать квитанцию.',
  tipReceiptNotReady: 'Оплата ещё не завершена.',
  tipReceiptButton: 'Отправить квитанцию',
  tipReceiptShareButton: 'Квитанция · Поделиться',
  paymentReceiptAdminCaption: 'Квитанция · Админ',
  paymentReceiptSelectAdmin: 'Выберите администратора для квитанции',
  paymentReceiptSelectRequired: 'Выберите администратора.',
  paymentReceiptRoleAdmin: 'Админ',
  paymentReceiptRoleOwner: 'Владелец',
  paymentReceiptSending: 'Отправка квитанции…',
  paymentReceiptSentTitle: 'Квитанция отправлена',
  paymentReceiptSentBody: 'Квитанция отправлена {{name}} через сообщение в приложении.',
  paymentReceiptSendFailed: 'Не удалось отправить квитанцию.',
  paymentReceiptLoginRequired: 'Войдите, чтобы отправить квитанцию.',
  paymentReceiptAdminMissing: 'Контакт для квитанции не найден.',
  paymentReceiptViewChat: 'Открыть сообщение',
  paymentReceiptMessageTitle: 'Квитанция об оплате',
  paymentReceiptMessageTitleField: 'Название',
  paymentReceiptMessageAmount: 'Сумма',
  paymentReceiptMessageCategory: 'Категория',
  paymentReceiptMessageDate: 'Дата',
  paymentReceiptMessageRef: 'Ссылка',
  paymentReceiptMessageStatus: 'Статус',
};

const ES: TipPack = {
  tipButton: 'Propina',
  tipSheetTitle: 'Enviar propina',
  tipSheetSubtitle: 'Muestre su agradecimiento a {{name}}',
  tipAmountLabel: 'Importe',
  tipCustomAmount: 'Importe personalizado',
  tipCustomPlaceholder: 'Introduzca importe (₺)',
  tipSubmitPay: 'Pagar con tarjeta',
  tipSubmitPayShort: 'Pagar con tarjeta',
  tipSelectAmount: 'Seleccione importe',
  tipSecureHint: 'Pago seguro · cargo inmediato',
  tipNoteLabel: 'Nota (opcional)',
  tipNotePlaceholder: 'Su mensaje de agradecimiento…',
  tipSubmit: 'Enviar propina',
  tipSubmitting: 'Enviando…',
  tipSuccessTitle: 'Propina registrada',
  tipSuccessPaidTitle: 'Pago completado',
  tipSuccessPaidBody: 'Su propina {{amount}} se envió a {{name}}.',
  tipSuccessBody: 'Su solicitud de propina {{amount}} fue recibida.',
  tipPayCancelled: 'El pago no se completó o fue cancelado.',
  tipPayTimeout: 'Tiempo de confirmación agotado. Revise su historial.',
  tipErrorPay: 'Servicio de pago no configurado. Contacte recepción.',
  tipPayMethodRoom: 'Cargo a habitación',
  tipPayMethodDeskCard: 'Recepción · tarjeta',
  tipPayMethodCash: 'Recepción · efectivo',
  tipErrorLogin: 'Inicie sesión para enviar propina.',
  tipErrorAmount: 'Introduzca un importe entre 10 ₺ y 50.000 ₺.',
  tipErrorGeneric: 'No se pudo enviar la propina.',
  tipErrorUnavailable: 'Servidor no disponible. Espere e intente de nuevo.',
  tipErrorNotDeployed: 'El módulo de propinas aún no está desplegado.',
  tipErrorBlocked: 'No puede enviar propina a este empleado.',
  tipErrorStaffCannotTip: 'Las propinas solo pueden enviarse desde una cuenta de huésped.',
  tipHistoryTitle: 'Mis propinas',
  tipHistoryEmpty: 'Aún no ha enviado propinas.',
  tipStatus_pending: 'Pendiente',
  tipStatus_confirmed: 'Confirmada',
  tipStatus_cancelled: 'Cancelada',
  tipStatus_refunded: 'Reembolsada',
  tipToStaff: '{{name}}',
  tipMyTipsLink: 'Historial de propinas',
  tipAlertInfo: 'Info',
  tipAlertError: 'Error',
  tipAlertOk: 'OK',
  tipReturnSuccessBody: 'Su propina {{amount}} se envió a {{name}}.',
  tipReturnPaymentSuccessBody: 'Pago recibido. Redirigiendo al inicio.',
  tipReturnPaymentCancelBody: 'Pago no completado. Puede intentarlo de nuevo.',
  tipReturnToApp: 'Volver a Valoria',
  tipReturnAutoHint: 'Redirección automática en unos segundos.',
  tipReturnStaffNotified: 'El personal fue notificado al instante',
  tipThankYouTitle: 'Enviar agradecimiento',
  tipThankYouSubtitle: 'Envíe un breve agradecimiento al huésped',
  tipThankYouPlaceholder: 'Su mensaje de agradecimiento…',
  tipThankYouSend: 'Enviar agradecimiento',
  tipThankYouSending: 'Enviando…',
  tipThankYouSent: 'Agradecimiento enviado',
  tipThankYouAlreadySent: 'Agradecimiento ya enviado',
  tipThankYouPreset1: '¡Muchas gracias!',
  tipThankYouPreset2: 'Apreciamos mucho su apoyo.',
  tipThankYouPreset3: '¡Que disfrute su estancia!',
  tipStaffTipsScreenTitle: 'Propinas recibidas',
  tipStaffTipsEmpty: 'Aún no ha recibido propinas.',
  tipStaffTipsFromGuest: 'Huésped · {{name}}',
  tipStaffTipsSendThanks: 'Agradecer',
  tipGuestThankYouReceived: 'Agradecimiento del personal',
  tipErrorThankYouGeneric: 'No se pudo enviar el agradecimiento.',
  tipErrorThankYouUnauthorized: 'No puede enviar agradecimiento por esta propina.',
  tipErrorThankYouNotFound: 'Propina no encontrada o aún no confirmada.',
  tipErrorThankYouInvalid: 'Mensaje de agradecimiento no válido.',
  tipStaffTipsMenuTitle: 'Propinas',
  tipStaffTipsMenuSub: 'Propinas y agradecimientos',
  tipStaffFallback: 'Personal',
  tipRoomLabel: 'Habitación {{room}}',
  tipStripeProductTitle: 'Propina · {{name}}',
  tipReceiptTitle: 'Recibo de propina',
  tipReceiptSubtitle: 'Recibo de pago digital',
  tipReceiptNo: 'N.º de recibo',
  tipReceiptPaidAt: 'Fecha de pago',
  tipReceiptStaff: 'Personal receptor',
  tipReceiptAmount: 'Importe pagado',
  tipReceiptPayment: 'Método de pago',
  tipReceiptStatusPaid: 'Pago completado',
  tipReceiptNote: 'Nota del huésped',
  tipReceiptThankYou: 'Agradecimiento del personal',
  tipReceiptRoom: 'Habitación',
  tipReceiptGuest: 'Huésped',
  tipReceiptStaffRole: 'Función',
  tipReceiptServiceType: 'Tipo de servicio',
  tipReceiptServiceName: 'Propina al personal',
  tipReceiptTransactionRef: 'Ref. de transacción',
  tipReceiptStripeSecure: 'Pago procesado de forma segura con Stripe',
  tipReceiptLegalInvoice: 'No es factura fiscal; recibo informativo.',
  tipReceiptLegalGratuity: 'La propina es para el personal indicado.',
  tipReceiptDetailsHeading: 'Detalles de la transacción',
  tipReceiptFooter: 'Recibo digital informativo · consérvelo',
  tipReceiptFooterBrand: '{{hotelName}}',
  tipReceiptShare: 'Compartir recibo',
  tipReceiptShareWhatsApp: 'WhatsApp',
  tipReceiptSharePdf: 'Compartir PDF',
  tipReceiptPickAction: '¿Cómo desea compartir el recibo?',
  tipReceiptCaption: 'Recibo · {{amount}} · {{name}} · {{receiptNo}}',
  tipReceiptError: 'No se pudo crear el recibo.',
  tipReceiptNotReady: 'El pago aún no se ha completado.',
  tipReceiptButton: 'Enviar recibo',
  tipReceiptShareButton: 'Recibo · Compartir',
  paymentReceiptAdminCaption: 'Recibo · Admin',
  paymentReceiptSelectAdmin: 'Elija quién recibirá el recibo',
  paymentReceiptSelectRequired: 'Seleccione un administrador.',
  paymentReceiptRoleAdmin: 'Admin',
  paymentReceiptRoleOwner: 'Propietario',
  paymentReceiptSending: 'Enviando recibo…',
  paymentReceiptSentTitle: 'Recibo enviado',
  paymentReceiptSentBody: 'Su recibo se envió a {{name}} por mensaje en la app.',
  paymentReceiptSendFailed: 'No se pudo enviar el recibo.',
  paymentReceiptLoginRequired: 'Inicie sesión para enviar el recibo.',
  paymentReceiptAdminMissing: 'Contacto de recibo no encontrado.',
  paymentReceiptViewChat: 'Abrir mensaje',
  paymentReceiptMessageTitle: 'Recibo de pago',
  paymentReceiptMessageTitleField: 'Título',
  paymentReceiptMessageAmount: 'Importe',
  paymentReceiptMessageCategory: 'Categoría',
  paymentReceiptMessageDate: 'Fecha',
  paymentReceiptMessageRef: 'Referencia',
  paymentReceiptMessageStatus: 'Estado',
};

const MAP: Record<StaffTipLang, TipPack> = { tr: TR, en: EN, ar: AR, de: DE, fr: FR, ru: RU, es: ES };

export function staffTipLang(): StaffTipLang {
  const raw = (i18n.language || 'tr').toLowerCase();
  if (raw.startsWith('en')) return 'en';
  if (raw.startsWith('ar')) return 'ar';
  if (raw.startsWith('de')) return 'de';
  if (raw.startsWith('fr')) return 'fr';
  if (raw.startsWith('ru')) return 'ru';
  if (raw.startsWith('es')) return 'es';
  return 'tr';
}

export function staffTipText(key: StaffTipTextKey, vars?: Record<string, string | number>): string {
  const pack = MAP[staffTipLang()] ?? TR;
  let s: string = pack[key] ?? TR[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    }
  }
  return s;
}

/** Stripe Checkout locale */
export function staffTipStripeLocale(): string {
  const lang = staffTipLang();
  const stripeLocales: Record<StaffTipLang, string> = {
    tr: 'tr',
    en: 'en',
    ar: 'auto',
    de: 'de',
    fr: 'fr',
    ru: 'ru',
    es: 'es',
  };
  return stripeLocales[lang] ?? 'auto';
}

export function formatTipAmount(amount: number, currency = 'try'): string {
  const c = currency.toLowerCase();
  const sym =
    c === 'try' ? '₺' : c === 'usd' ? '$' : c === 'eur' ? '€' : c === 'sar' ? 'SAR' : c.toUpperCase();
  const n = Number(amount);
  const formatted = Number.isInteger(n) ? String(n) : n.toFixed(2);
  if (sym === '₺') return `${formatted} ₺`;
  if (sym === '$' || sym === '€') return `${sym}${formatted}`;
  return `${formatted} ${sym}`;
}

export const TIP_PRESET_AMOUNTS = [50, 100, 150, 200, 500] as const;

export const TIP_THANK_YOU_PRESET_KEYS = [
  'tipThankYouPreset1',
  'tipThankYouPreset2',
  'tipThankYouPreset3',
] as const satisfies readonly StaffTipTextKey[];

export function tipStatusLabel(status: StaffTipStatus): string {
  return staffTipText(`tipStatus_${status}` as StaffTipTextKey);
}

/** Misafir bahşiş geçmişi — Stripe için daha anlaşılır etiketler */
export function guestTipStatusLabel(status: StaffTipStatus, paymentMethod?: string): string {
  if (paymentMethod === 'stripe_card') {
    if (status === 'confirmed') return staffTipText('tipStatus_paidGuest');
    if (status === 'pending') return staffTipText('tipStatus_pendingPaymentGuest');
  }
  return tipStatusLabel(status);
}

const PAYMENT_METHOD_LABELS: Record<StaffTipPaymentMethod, StaffTipTextKey> = {
  stripe_card: 'tipSubmitPayShort',
  room_charge: 'tipPayMethodRoom',
  card_at_desk: 'tipPayMethodDeskCard',
  cash_at_desk: 'tipPayMethodCash',
};

export function tipPaymentMethodLabel(method: string): string {
  const key = PAYMENT_METHOD_LABELS[method as StaffTipPaymentMethod];
  if (key) return staffTipText(key);
  return method;
}

/** Edge function error_code → kullanıcı metni */
const EDGE_ERROR_CODES: Record<string, StaffTipTextKey> = {
  UNAUTHORIZED: 'tipErrorLogin',
  GUEST_ONLY: 'tipErrorStaffCannotTip',
  INVALID_AMOUNT: 'tipErrorAmount',
  STAFF_BLOCKED: 'tipErrorBlocked',
  GUEST_NOT_FOUND: 'tipErrorLogin',
};

export function mapGuestTipEdgeError(payload: { error?: string; error_code?: string } | null | undefined): string {
  const code = payload?.error_code?.trim();
  if (code && EDGE_ERROR_CODES[code]) {
    return staffTipText(EDGE_ERROR_CODES[code]);
  }
  const raw = payload?.error?.trim();
  if (!raw) return staffTipText('tipErrorGeneric');
  if (/stripe|STRIPE_SECRET/i.test(raw)) return staffTipText('tipErrorPay');
  return raw;
}
