# Valoria bildirim sesleri (bundle)

Push arka planı (iOS) ve Android kanal sesleri için uygulama içi (gömülü) ses dosyaları.

Bu dosyalar `app.config.js` → `expo-notifications.sounds` ile native'e gömülür.
**Değişiklik sonrası yeni native build (EAS) gerekir** (raw resource / bundle güncellenir).

## Üretim

Sesler sentezlenmiştir (telifsiz). Yeniden üretmek için:

```bash
python scripts/generate_notification_sounds.py
```

## Özellik bazlı varsayılan sesler

| Dosya | Özellik (feature_key) | Android kanalı |
|-------|------------------------|----------------|
| `emergency_alert.wav` | `emergency_alert` (acil durum) | `valoria_emergency_alert` |
| `task_ping.wav` | `new_task` (görev) | `valoria_task_v1` |
| `meal_chime.wav` | `kitchen_request` (yemek listesi) | `valoria_meal_v1` |
| `salary_cash.wav` | `salary` (maaş) | `valoria_salary_v1` |
| `warning_alert.wav` | `staff_call` (resmi uyarılar) | `valoria_warning_v1` |
| `kbs_scan.wav` | `kbs_notification` (kimlik/pasaport) | `valoria_kbs_v1` |
| `message_pop.wav` | `new_message` (mesaj — Instagram tarzı) | `valoria_messages_v2` |

Diğer tüm özellikler **sistem varsayılanı** (`valoria_urgent` + `default`) kullanır.

## Akış

- **Varsayılan ses/kanal:** `get_notification_sound_push_config` RPC'sinin varsayılan dalı
  (migration `500_notification_sound_default_feature_channels.sql`) yukarıdaki eşlemeyi döndürür.
- **Kanallar:** `lib/notificationsPush.ts` → `FEATURE_SOUND_CHANNELS` (uygulamada herkeste oluşturulur).
- **Org özel ses:** Admin panelden ses yüklenirse RPC bunun yerine `valoria_ns_<feature>_v<n>`
  kanalını ve özel sesi döndürür (varsayılanı geçersiz kılar).

Format: WAV/MP3/CAF, max 512 KB, kısa (1–7 sn). Android raw adı küçük harf + alt çizgi olmalı.
