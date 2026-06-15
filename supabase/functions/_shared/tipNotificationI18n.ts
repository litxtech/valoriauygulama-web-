type Lang = "tr" | "en" | "ar" | "de" | "fr" | "ru" | "es";

export function parseTipNotifLang(raw: string | null | undefined): Lang {
  const l = (raw ?? "tr").toLowerCase().split("-")[0];
  if (l === "en" || l === "ar" || l === "de" || l === "fr" || l === "ru" || l === "es") return l;
  return "tr";
}

export function staffTipReceivedNotif(lang: Lang, amountLabel: string): { title: string; body: string } {
  const map: Record<Lang, { title: string; body: string }> = {
    tr: { title: "Bahşiş aldınız", body: `Kart ödemesi tamamlandı · ${amountLabel}` },
    en: { title: "You received a tip", body: `Card payment completed · ${amountLabel}` },
    ar: { title: "تلقيت بقشيشاً", body: `اكتمل الدفع بالبطاقة · ${amountLabel}` },
    de: { title: "Trinkgeld erhalten", body: `Kartenzahlung abgeschlossen · ${amountLabel}` },
    fr: { title: "Pourboire reçu", body: `Paiement par carte confirmé · ${amountLabel}` },
    ru: { title: "Вы получили чаевые", body: `Оплата картой завершена · ${amountLabel}` },
    es: { title: "Propina recibida", body: `Pago con tarjeta completado · ${amountLabel}` },
  };
  return map[lang] ?? map.tr;
}

export function guestTipPaidNotif(
  lang: Lang,
  amountLabel: string,
  staffName: string
): { title: string; body: string } {
  const name = staffName.trim() || (lang === "en" ? "the team member" : lang === "tr" ? "personele" : "staff");
  const map: Record<Lang, { title: string; body: (n: string, a: string) => string }> = {
    tr: {
      title: "Ödemeniz alındı",
      body: (n, a) => `${a} bahşişiniz ${n} personeline iletildi. Bildirim gönderildi.`,
    },
    en: {
      title: "Payment received",
      body: (n, a) => `Your ${a} tip was sent to ${n}. They have been notified.`,
    },
    ar: {
      title: "تم استلام الدفع",
      body: (n, a) => `تم إرسال بقشيش ${a} إلى ${n}. تم إبلاغه بالإشعار.`,
    },
    de: {
      title: "Zahlung erhalten",
      body: (n, a) => `Ihr Trinkgeld ${a} wurde an ${n} gesendet. Die Person wurde benachrichtigt.`,
    },
    fr: {
      title: "Paiement reçu",
      body: (n, a) => `Votre pourboire de ${a} a été envoyé à ${n}. Notification envoyée.`,
    },
    ru: {
      title: "Оплата получена",
      body: (n, a) => `Чаевые ${a} отправлены сотруднику ${n}. Уведомление доставлено.`,
    },
    es: {
      title: "Pago recibido",
      body: (n, a) => `Su propina de ${a} se envió a ${n}. Se le notificó.`,
    },
  };
  const pack = map[lang] ?? map.tr;
  return { title: pack.title, body: pack.body(name, amountLabel) };
}

export function staffTipRefundedNotif(lang: Lang, amountLabel: string): { title: string; body: string } {
  const map: Record<Lang, { title: string; body: string }> = {
    tr: { title: "Bahşiş iade edildi", body: `${amountLabel} tutarındaki bahşiş misafire iade edildi.` },
    en: { title: "Tip refunded", body: `The ${amountLabel} tip was refunded to the guest.` },
    ar: { title: "تم استرداد البقشيش", body: `تم استرداد بقشيش ${amountLabel} للضيف.` },
    de: { title: "Trinkgeld erstattet", body: `Das Trinkgeld ${amountLabel} wurde dem Gast erstattet.` },
    fr: { title: "Pourboire remboursé", body: `Le pourboire de ${amountLabel} a été remboursé au client.` },
    ru: { title: "Чаевые возвращены", body: `Чаевые ${amountLabel} возвращены гостю.` },
    es: { title: "Propina reembolsada", body: `La propina de ${amountLabel} fue reembolsada al huésped.` },
  };
  return map[lang] ?? map.tr;
}

export function guestTipRefundedNotif(
  lang: Lang,
  amountLabel: string,
  staffName: string
): { title: string; body: string } {
  const name = staffName.trim() || (lang === "en" ? "the team member" : lang === "tr" ? "personele" : "staff");
  const map: Record<Lang, { title: string; body: (n: string, a: string) => string }> = {
    tr: {
      title: "Bahşiş iadeniz işlendi",
      body: (n, a) => `${n} personeline gönderdiğiniz ${a} bahşiş kartınıza iade edildi.`,
    },
    en: {
      title: "Your tip was refunded",
      body: (n, a) => `Your ${a} tip to ${n} was refunded to your card.`,
    },
    ar: {
      title: "تم استرداد بقشيشك",
      body: (n, a) => `تم استرداد بقشيش ${a} إلى ${n} على بطاقتك.`,
    },
    de: {
      title: "Trinkgeld erstattet",
      body: (n, a) => `Ihr Trinkgeld ${a} an ${n} wurde auf Ihre Karte erstattet.`,
    },
    fr: {
      title: "Pourboire remboursé",
      body: (n, a) => `Votre pourboire de ${a} pour ${n} a été remboursé sur votre carte.`,
    },
    ru: {
      title: "Чаевые возвращены",
      body: (n, a) => `Чаевые ${a} для ${n} возвращены на вашу карту.`,
    },
    es: {
      title: "Propina reembolsada",
      body: (n, a) => `Su propina de ${a} para ${n} fue reembolsada a su tarjeta.`,
    },
  };
  const pack = map[lang] ?? map.tr;
  return { title: pack.title, body: pack.body(name, amountLabel) };
}
