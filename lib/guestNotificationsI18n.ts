import { GUEST_TYPES } from '@/lib/notificationTypes';
import { resolveAppLang, type AppLang } from '@/lib/appLang';

type GuestNotifKey =
  | (typeof GUEST_TYPES)[keyof typeof GUEST_TYPES]
  | 'guest_new_story'
  | 'guest_new_feed_post';

type CopyFn = (ctx: Record<string, string>) => { title: string; body: string };

const PACKS: Record<AppLang, Partial<Record<GuestNotifKey, CopyFn>>> = {
  tr: {
    [GUEST_TYPES.contract_approved]: () => ({
      title: 'Sözleşme Onaylandı',
      body: "📝 Sözleşmeniz onaylandı. Check-in talebiniz admin'e iletildi.",
    }),
    [GUEST_TYPES.admin_assigned_room]: (ctx) => ({
      title: 'Oda Hazır',
      body: `✅ Oda ${ctx.roomNumber ?? '?'} hazır! Dijital anahtarınız aktif. İyi tatiller!`,
    }),
    [GUEST_TYPES.stay_financial_updated]: (ctx) => ({
      title: 'Konaklama bilgisi güncellendi',
      body: `Resepsiyon konaklama tutarınızı güncelledi: ${ctx.summary ?? 'Detaylar uygulamada.'}`,
    }),
    [GUEST_TYPES.room_reassigned]: (ctx) => ({
      title: 'Odanız değiştirildi',
      body: `Yeni odanız: ${ctx.roomNumber ?? '?'}. Dijital anahtar ve oda hizmetleri bu odaya göre güncellendi.`,
    }),
    [GUEST_TYPES.room_settled]: (ctx) => ({
      title: 'Odaya Yerleştiniz',
      body: `🏨 Oda ${ctx.roomNumber ?? '?'}'ye yerleştiniz. İhtiyaçlarınız için resepsiyon 0.`,
    }),
    [GUEST_TYPES.checkout_reminder]: () => ({
      title: 'Çıkış Hatırlatması',
      body: '⏰ Çıkış saatinize 1 saat kaldı. Odadan ayrılmaya hazır mısınız?',
    }),
    [GUEST_TYPES.checkout_done]: () => ({
      title: 'Bizi Tercih Ettiniz İçin Teşekkürler',
      body: '👋 Bizi tercih ettiğiniz için teşekkürler! Tekrar bekleriz.',
    }),
    [GUEST_TYPES.request_received]: (ctx) => ({
      title: 'Talep Alındı',
      body: `🍽️ ${ctx.requestLabel ?? 'Siparişiniz'} alındı. Tahmini süre: ${ctx.estimate ?? '15 dakika'}`,
    }),
    [GUEST_TYPES.request_on_the_way]: () => ({
      title: 'Yolda',
      body: '🚀 Siparişiniz yolda! 2 dakika içinde odanızda',
    }),
    [GUEST_TYPES.request_completed]: (ctx) => ({
      title: 'Talep Tamamlandı',
      body: `✅ ${ctx.requestLabel ?? 'Talebiniz'} tamamlandı. İyi günler!`,
    }),
    [GUEST_TYPES.cleaning_reminder]: () => ({
      title: 'Temizlik Saati',
      body: '🧹 Odanızın temizlik saati yaklaşıyor. Uygun musunuz?',
    }),
    guest_new_story: (ctx) => ({
      title: 'Yeni hikaye',
      body: `${ctx.authorName ?? 'Bir personel'} yeni bir hikaye paylaştı`,
    }),
    guest_new_feed_post: () => ({
      title: 'Yeni paylaşım',
      body: 'Otelden yeni bir paylaşım var. Uygulamada görüntüleyin.',
    }),
  },
  en: {
    [GUEST_TYPES.contract_approved]: () => ({
      title: 'Contract approved',
      body: '📝 Your contract is approved. Your check-in request was sent to the hotel.',
    }),
    [GUEST_TYPES.admin_assigned_room]: (ctx) => ({
      title: 'Room ready',
      body: `✅ Room ${ctx.roomNumber ?? '?'} is ready! Your digital key is active. Enjoy your stay!`,
    }),
    [GUEST_TYPES.stay_financial_updated]: (ctx) => ({
      title: 'Stay details updated',
      body: `Reception updated your stay amount: ${ctx.summary ?? 'See details in the app.'}`,
    }),
    [GUEST_TYPES.room_reassigned]: (ctx) => ({
      title: 'Room changed',
      body: `Your new room: ${ctx.roomNumber ?? '?'}. Digital key and room services were updated.`,
    }),
    [GUEST_TYPES.room_settled]: (ctx) => ({
      title: 'Room assigned',
      body: `🏨 You are in room ${ctx.roomNumber ?? '?'}. Dial 0 for reception.`,
    }),
    [GUEST_TYPES.checkout_reminder]: () => ({
      title: 'Checkout reminder',
      body: '⏰ One hour until checkout. Are you ready to leave the room?',
    }),
    [GUEST_TYPES.checkout_done]: () => ({
      title: 'Thank you',
      body: '👋 Thank you for staying with us! We hope to see you again.',
    }),
    [GUEST_TYPES.request_received]: (ctx) => ({
      title: 'Request received',
      body: `🍽️ ${ctx.requestLabel ?? 'Your order'} received. Estimated: ${ctx.estimate ?? '15 minutes'}`,
    }),
    [GUEST_TYPES.request_on_the_way]: () => ({
      title: 'On the way',
      body: '🚀 Your order is on the way! At your room in about 2 minutes',
    }),
    [GUEST_TYPES.request_completed]: (ctx) => ({
      title: 'Request completed',
      body: `✅ ${ctx.requestLabel ?? 'Your request'} is done. Have a great day!`,
    }),
    [GUEST_TYPES.cleaning_reminder]: () => ({
      title: 'Cleaning time',
      body: '🧹 Housekeeping is coming soon. Is now a good time?',
    }),
    guest_new_story: (ctx) => ({
      title: 'New story',
      body: `${ctx.authorName ?? 'A staff member'} shared a new story`,
    }),
    guest_new_feed_post: () => ({
      title: 'New post',
      body: 'There is a new post from the hotel. View it in the app.',
    }),
  },
  ar: {
    [GUEST_TYPES.contract_approved]: () => ({
      title: 'تمت الموافقة على العقد',
      body: '📝 تمت الموافقة على عقدك. تم إرسال طلب تسجيل الوصول إلى الإدارة.',
    }),
    [GUEST_TYPES.admin_assigned_room]: (ctx) => ({
      title: 'الغرفة جاهزة',
      body: `✅ الغرفة ${ctx.roomNumber ?? '?'} جاهزة! مفتاحك الرقمي مفعّل. إقامة سعيدة!`,
    }),
    [GUEST_TYPES.stay_financial_updated]: (ctx) => ({
      title: 'تحديث معلومات الإقامة',
      body: `حدّثت الاستقبال مبلغ إقامتك: ${ctx.summary ?? 'التفاصيل في التطبيق.'}`,
    }),
    [GUEST_TYPES.room_reassigned]: (ctx) => ({
      title: 'تم تغيير الغرفة',
      body: `غرفتك الجديدة: ${ctx.roomNumber ?? '?'}. تم تحديث المفتاح الرقمي وخدمات الغرفة.`,
    }),
    [GUEST_TYPES.room_settled]: (ctx) => ({
      title: 'تم تسكينك',
      body: `🏨 تم تسكينك في الغرفة ${ctx.roomNumber ?? '?'}. للاستقبال اتصل 0.`,
    }),
    [GUEST_TYPES.checkout_reminder]: () => ({
      title: 'تذكير المغادرة',
      body: '⏰ ساعة واحدة على موعد المغادرة. هل أنت مستعد لمغادرة الغرفة؟',
    }),
    [GUEST_TYPES.checkout_done]: () => ({
      title: 'شكراً لكم',
      body: '👋 شكراً لاختياركم فندقنا! نتمنى رؤيتكم مجدداً.',
    }),
    [GUEST_TYPES.request_received]: (ctx) => ({
      title: 'تم استلام الطلب',
      body: `🍽️ ${ctx.requestLabel ?? 'طلبك'} قيد المعالجة. الوقت المتوقع: ${ctx.estimate ?? '15 دقيقة'}`,
    }),
    [GUEST_TYPES.request_on_the_way]: () => ({
      title: 'في الطريق',
      body: '🚀 طلبك في الطريق! سيصل إلى غرفتك خلال دقيقتين تقريباً',
    }),
    [GUEST_TYPES.request_completed]: (ctx) => ({
      title: 'اكتمل الطلب',
      body: `✅ ${ctx.requestLabel ?? 'طلبك'} مكتمل. نتمنى لكم يوماً سعيداً!`,
    }),
    [GUEST_TYPES.cleaning_reminder]: () => ({
      title: 'وقت التنظيف',
      body: '🧹 يقترب موعد تنظيف الغرفة. هل الوقت مناسب؟',
    }),
    guest_new_story: (ctx) => ({
      title: 'قصة جديدة',
      body: `${ctx.authorName ?? 'أحد الموظفين'} شارك قصة جديدة`,
    }),
    guest_new_feed_post: () => ({
      title: 'منشور جديد',
      body: 'منشور جديد من الفندق. اطلع عليه في التطبيق.',
    }),
  },
  de: {
    [GUEST_TYPES.contract_approved]: () => ({
      title: 'Vertrag bestätigt',
      body: '📝 Ihr Vertrag wurde bestätigt. Ihre Check-in-Anfrage wurde weitergeleitet.',
    }),
    [GUEST_TYPES.admin_assigned_room]: (ctx) => ({
      title: 'Zimmer bereit',
      body: `✅ Zimmer ${ctx.roomNumber ?? '?'} ist bereit! Ihr digitaler Schlüssel ist aktiv.`,
    }),
    [GUEST_TYPES.stay_financial_updated]: (ctx) => ({
      title: 'Aufenthaltsdaten aktualisiert',
      body: `Die Rezeption hat den Betrag aktualisiert: ${ctx.summary ?? 'Details in der App.'}`,
    }),
    [GUEST_TYPES.room_reassigned]: (ctx) => ({
      title: 'Zimmer gewechselt',
      body: `Neues Zimmer: ${ctx.roomNumber ?? '?'}. Schlüssel und Services wurden angepasst.`,
    }),
    [GUEST_TYPES.room_settled]: (ctx) => ({
      title: 'Zimmer zugewiesen',
      body: `🏨 Sie sind in Zimmer ${ctx.roomNumber ?? '?'}. Rezeption: 0.`,
    }),
    [GUEST_TYPES.checkout_reminder]: () => ({
      title: 'Abreise-Erinnerung',
      body: '⏰ Noch eine Stunde bis zur Abreise. Sind Sie bereit?',
    }),
    [GUEST_TYPES.checkout_done]: () => ({
      title: 'Danke',
      body: '👋 Vielen Dank für Ihren Aufenthalt! Wir freuen uns auf ein Wiedersehen.',
    }),
    [GUEST_TYPES.request_received]: (ctx) => ({
      title: 'Anfrage erhalten',
      body: `🍽️ ${ctx.requestLabel ?? 'Ihre Bestellung'} erhalten. Ca. ${ctx.estimate ?? '15 Minuten'}`,
    }),
    [GUEST_TYPES.request_on_the_way]: () => ({
      title: 'Unterwegs',
      body: '🚀 Ihre Bestellung ist unterwegs! In ca. 2 Minuten bei Ihnen',
    }),
    [GUEST_TYPES.request_completed]: (ctx) => ({
      title: 'Anfrage erledigt',
      body: `✅ ${ctx.requestLabel ?? 'Ihre Anfrage'} ist erledigt.`,
    }),
    [GUEST_TYPES.cleaning_reminder]: () => ({
      title: 'Reinigungszeit',
      body: '🧹 Die Zimmerreinigung steht an. Passt es gerade?',
    }),
    guest_new_story: (ctx) => ({
      title: 'Neue Story',
      body: `${ctx.authorName ?? 'Mitarbeiter'} hat eine neue Story geteilt`,
    }),
    guest_new_feed_post: () => ({
      title: 'Neuer Beitrag',
      body: 'Neuer Beitrag vom Hotel. In der App ansehen.',
    }),
  },
  fr: {
    [GUEST_TYPES.contract_approved]: () => ({
      title: 'Contrat approuvé',
      body: '📝 Votre contrat est approuvé. Votre demande d’enregistrement a été envoyée.',
    }),
    [GUEST_TYPES.admin_assigned_room]: (ctx) => ({
      title: 'Chambre prête',
      body: `✅ Chambre ${ctx.roomNumber ?? '?'} prête ! Clé numérique active.`,
    }),
    [GUEST_TYPES.stay_financial_updated]: (ctx) => ({
      title: 'Séjour mis à jour',
      body: `La réception a mis à jour le montant : ${ctx.summary ?? 'Détails dans l’app.'}`,
    }),
    [GUEST_TYPES.room_reassigned]: (ctx) => ({
      title: 'Chambre modifiée',
      body: `Nouvelle chambre : ${ctx.roomNumber ?? '?'}. Clé et services mis à jour.`,
    }),
    [GUEST_TYPES.room_settled]: (ctx) => ({
      title: 'Chambre attribuée',
      body: `🏨 Chambre ${ctx.roomNumber ?? '?'}. Réception : 0.`,
    }),
    [GUEST_TYPES.checkout_reminder]: () => ({
      title: 'Rappel départ',
      body: '⏰ Une heure avant le départ. Êtes-vous prêt ?',
    }),
    [GUEST_TYPES.checkout_done]: () => ({
      title: 'Merci',
      body: '👋 Merci pour votre séjour ! À bientôt.',
    }),
    [GUEST_TYPES.request_received]: (ctx) => ({
      title: 'Demande reçue',
      body: `🍽️ ${ctx.requestLabel ?? 'Votre commande'} reçue. Délai : ${ctx.estimate ?? '15 min'}`,
    }),
    [GUEST_TYPES.request_on_the_way]: () => ({
      title: 'En route',
      body: '🚀 Votre commande arrive ! Environ 2 minutes',
    }),
    [GUEST_TYPES.request_completed]: (ctx) => ({
      title: 'Demande terminée',
      body: `✅ ${ctx.requestLabel ?? 'Votre demande'} est terminée.`,
    }),
    [GUEST_TYPES.cleaning_reminder]: () => ({
      title: 'Heure de ménage',
      body: '🧹 Le ménage approche. Est-ce le bon moment ?',
    }),
    guest_new_story: (ctx) => ({
      title: 'Nouvelle story',
      body: `${ctx.authorName ?? 'Un employé'} a partagé une story`,
    }),
    guest_new_feed_post: () => ({
      title: 'Nouvelle publication',
      body: 'Nouvelle publication de l’hôtel. Voir dans l’app.',
    }),
  },
  ru: {
    [GUEST_TYPES.contract_approved]: () => ({
      title: 'Договор одобрен',
      body: '📝 Ваш договор одобрен. Запрос на заселение отправлен администрации.',
    }),
    [GUEST_TYPES.admin_assigned_room]: (ctx) => ({
      title: 'Номер готов',
      body: `✅ Номер ${ctx.roomNumber ?? '?'} готов! Цифровой ключ активен.`,
    }),
    [GUEST_TYPES.stay_financial_updated]: (ctx) => ({
      title: 'Данные проживания обновлены',
      body: `Ресепшен обновил сумму: ${ctx.summary ?? 'Подробности в приложении.'}`,
    }),
    [GUEST_TYPES.room_reassigned]: (ctx) => ({
      title: 'Номер изменён',
      body: `Новый номер: ${ctx.roomNumber ?? '?'}. Ключ и услуги обновлены.`,
    }),
    [GUEST_TYPES.room_settled]: (ctx) => ({
      title: 'Заселение',
      body: `🏨 Вы в номере ${ctx.roomNumber ?? '?'}. Ресепшен: 0.`,
    }),
    [GUEST_TYPES.checkout_reminder]: () => ({
      title: 'Напоминание о выезде',
      body: '⏰ До выезда остался час. Готовы покинуть номер?',
    }),
    [GUEST_TYPES.checkout_done]: () => ({
      title: 'Спасибо',
      body: '👋 Спасибо, что выбрали нас! Ждём вас снова.',
    }),
    [GUEST_TYPES.request_received]: (ctx) => ({
      title: 'Запрос получен',
      body: `🍽️ ${ctx.requestLabel ?? 'Заказ'} принят. Ожидание: ${ctx.estimate ?? '15 минут'}`,
    }),
    [GUEST_TYPES.request_on_the_way]: () => ({
      title: 'В пути',
      body: '🚀 Заказ в пути! Примерно через 2 минуты',
    }),
    [GUEST_TYPES.request_completed]: (ctx) => ({
      title: 'Запрос выполнен',
      body: `✅ ${ctx.requestLabel ?? 'Запрос'} выполнен.`,
    }),
    [GUEST_TYPES.cleaning_reminder]: () => ({
      title: 'Время уборки',
      body: '🧹 Скоро уборка номера. Удобно ли сейчас?',
    }),
    guest_new_story: (ctx) => ({
      title: 'Новая история',
      body: `${ctx.authorName ?? 'Сотрудник'} опубликовал историю`,
    }),
    guest_new_feed_post: () => ({
      title: 'Новая публикация',
      body: 'Новая публикация отеля. Смотрите в приложении.',
    }),
  },
  es: {
    [GUEST_TYPES.contract_approved]: () => ({
      title: 'Contrato aprobado',
      body: '📝 Su contrato está aprobado. La solicitud de check-in fue enviada.',
    }),
    [GUEST_TYPES.admin_assigned_room]: (ctx) => ({
      title: 'Habitación lista',
      body: `✅ ¡Habitación ${ctx.roomNumber ?? '?'} lista! Llave digital activa.`,
    }),
    [GUEST_TYPES.stay_financial_updated]: (ctx) => ({
      title: 'Estancia actualizada',
      body: `Recepción actualizó el importe: ${ctx.summary ?? 'Detalles en la app.'}`,
    }),
    [GUEST_TYPES.room_reassigned]: (ctx) => ({
      title: 'Habitación cambiada',
      body: `Nueva habitación: ${ctx.roomNumber ?? '?'}. Llave y servicios actualizados.`,
    }),
    [GUEST_TYPES.room_settled]: (ctx) => ({
      title: 'Habitación asignada',
      body: `🏨 Está en la habitación ${ctx.roomNumber ?? '?'}. Recepción: 0.`,
    }),
    [GUEST_TYPES.checkout_reminder]: () => ({
      title: 'Recordatorio de salida',
      body: '⏰ Queda una hora para el check-out. ¿Está listo?',
    }),
    [GUEST_TYPES.checkout_done]: () => ({
      title: 'Gracias',
      body: '👋 ¡Gracias por hospedarse con nosotros! Le esperamos de nuevo.',
    }),
    [GUEST_TYPES.request_received]: (ctx) => ({
      title: 'Solicitud recibida',
      body: `🍽️ ${ctx.requestLabel ?? 'Su pedido'} recibido. Estimado: ${ctx.estimate ?? '15 minutos'}`,
    }),
    [GUEST_TYPES.request_on_the_way]: () => ({
      title: 'En camino',
      body: '🚀 ¡Su pedido va en camino! En unos 2 minutos',
    }),
    [GUEST_TYPES.request_completed]: (ctx) => ({
      title: 'Solicitud completada',
      body: `✅ ${ctx.requestLabel ?? 'Su solicitud'} completada.`,
    }),
    [GUEST_TYPES.cleaning_reminder]: () => ({
      title: 'Hora de limpieza',
      body: '🧹 Se acerca la limpieza. ¿Es buen momento?',
    }),
    guest_new_story: (ctx) => ({
      title: 'Nueva historia',
      body: `${ctx.authorName ?? 'Un empleado'} compartió una historia`,
    }),
    guest_new_feed_post: () => ({
      title: 'Nueva publicación',
      body: 'Nueva publicación del hotel. Ver en la app.',
    }),
  },
};

export function guestNotificationCopy(
  type: string,
  ctx: Record<string, string> = {},
  lang?: string | null
): { title: string; body: string } {
  const l = resolveAppLang(lang);
  const fn = PACKS[l][type as GuestNotifKey] ?? PACKS.en[type as GuestNotifKey] ?? PACKS.tr[type as GuestNotifKey];
  if (fn) return fn(ctx);
  return { title: type, body: '' };
}
