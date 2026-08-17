/**
 * Personel bas-konuş — arka plan sesi (Apple / Google uyumu)
 *
 * ÖNERİLEN (mağaza-güvenli) mimari:
 *
 * 1) Uygulama açıkken (ön plan)
 *    - LiveKit ile canlı dinle / bas-konuş
 *    - Telsiz bip sesleri (walkie_ptt_open / close)
 *
 * 2) Uygulama arka planda / kilitliyken
 *    - Sürekli mikrofon veya gizli WebRTC DINLEME AÇMAYIN.
 *      Apple Guideline 2.5.4 / arka plan audio kötüye kullanımı → red.
 *      Google Play: FOREGROUND_SERVICE_MICROPHONE / mediaPlayback gerekçesiz → red.
 *    - Bunun yerine: org başına telsiz OTURUMU (≈90 sn sessizlik = yeni oturum).
 *      İlk konuşmalarda kısa toplama → tek Expo push (walkie bip + time-sensitive):
 *      “X konuşuyor” / “X ve N kişi daha konuşuyor — dinlemek için aç”.
 *      Aynı oturumda her basışta yeni bildirim YOK.
 *    - Kullanıcı bildirime basınca /staff/ptt veya kanala bağlanır.
 *
 * 3) İleride “sürekli dinle” isterseniz (opsiyonel, bilinçli oturum)
 *    - Kullanıcı “Kanalda dinliyorum”u AÇIKÇA açar (görünür UI + kapatma).
 *    - iOS: UIBackgroundModes=audio yalnız bu oturumdayken; Control Center’da
 *      Now Playing / ses oturumu görünür olmalı.
 *    - Android: türü doğru foreground service + kalıcı bildirim
 *      (“Valoria telsiz — dinleniyor”). Gizli arka plan servisi yok.
 *    - Review notunda: otel personel telsizi, kullanıcı kontrollü dinleme.
 *
 * Şu anki sürüm: (1) + bip sesi. (2)/(3) ayrı iş olarak eklenir.
 */
export const PTT_BACKGROUND_POLICY = 'push-wake-preferred' as const;
