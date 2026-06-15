# Valoria bildirim sesleri (bundle)

Push arka planı (iOS) ve Android kanal sesleri için uygulama içi dosyalar.

## Zorunlu

- `emergency_alert.wav` — acil durum (3–7 sn, alarm tonu)

## Önerilen presetler (isteğe bağlı, build ile eklenir)

| Dosya | Özellik |
|-------|---------|
| `task_ping.wav` | Görev |
| `message_soft.wav` | Mesaj |
| `announcement_chime.wav` | Duyuru |
| `warning_beep.wav` | Stok uyarısı |

## Admin panelden yüklenen sesler

`notification-sounds` Supabase bucket — **uygulama açıkken (foreground) anında** çalar, build gerekmez.

iOS arka plan push için bundle preset veya `default` kullanılır (Apple kısıtı).

Format: WAV/MP3/CAF, max 512 KB, 1–7 saniye.
