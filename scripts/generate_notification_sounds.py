#!/usr/bin/env python3
"""Valoria bildirim sesleri üretici.

Her özellik için kısa, telifsiz (sentezlenmiş) bir WAV bildirim sesi üretir.
Çıktı: assets/sounds/*.wav  (16-bit PCM, 44.1 kHz, mono)

Özellikler:
  emergency_alert.wav  - Acil durum alarmı (warble / iki tonlu, yüksek)
  task_ping.wav        - Yeni görev (temiz tek ping)
  meal_chime.wav       - Yemek listesi (yumuşak iki nota chime)
  salary_cash.wav      - Maaş (yükselen parlak arpej / "cha-ching")
  warning_alert.wav    - Resmi uyarı (ciddi çift bip)
  kbs_scan.wav         - Kimlik/pasaport (tarama onay bipleri)
  message_pop.wav      - Mesaj (Instagram DM tarzı yumuşak pop)
"""
import math
import os
import struct
import wave

SAMPLE_RATE = 44100
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "sounds")


def _write_wav(name, samples):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name)
    peak = max((abs(s) for s in samples), default=1.0) or 1.0
    norm = 0.95 / peak if peak > 0.95 else 1.0
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        frames = bytearray()
        for s in samples:
            v = int(max(-1.0, min(1.0, s * norm)) * 32767)
            frames += struct.pack("<h", v)
        w.writeframes(bytes(frames))
    print(f"  wrote {name}  ({len(samples)/SAMPLE_RATE:.2f}s)")


def _n(sec):
    return int(sec * SAMPLE_RATE)


def _adsr(i, total, attack=0.01, release=0.05):
    """Basit attack/release zarfı (tıklamayı önler)."""
    t = i / SAMPLE_RATE
    dur = total / SAMPLE_RATE
    a = _n(attack)
    r = _n(release)
    if i < a:
        return i / a
    if i > total - r:
        return max(0.0, (total - i) / r)
    return 1.0


def tone(freq, sec, amp=0.6, wave_type="sine", attack=0.01, release=0.06, vibrato=0.0):
    total = _n(sec)
    out = []
    for i in range(total):
        t = i / SAMPLE_RATE
        f = freq * (1.0 + vibrato * math.sin(2 * math.pi * 6 * t)) if vibrato else freq
        ph = 2 * math.pi * f * t
        if wave_type == "square":
            v = 1.0 if math.sin(ph) >= 0 else -1.0
        elif wave_type == "triangle":
            v = 2.0 / math.pi * math.asin(math.sin(ph))
        else:
            v = math.sin(ph)
        out.append(v * amp * _adsr(i, total, attack, release))
    return out


def bell(freq, sec, amp=0.6):
    """Çan/marimba: temel + harmonikler, üssel sönüm."""
    total = _n(sec)
    out = []
    for i in range(total):
        t = i / SAMPLE_RATE
        env = math.exp(-4.5 * t / sec)
        v = (
            math.sin(2 * math.pi * freq * t)
            + 0.5 * math.sin(2 * math.pi * freq * 2 * t)
            + 0.25 * math.sin(2 * math.pi * freq * 3 * t)
        )
        out.append(v * amp * env * _adsr(i, total, 0.004, 0.02))
    return out


def silence(sec):
    return [0.0] * _n(sec)


def mix(a, b):
    n = max(len(a), len(b))
    out = [0.0] * n
    for i in range(len(a)):
        out[i] += a[i]
    for i in range(len(b)):
        out[i] += b[i]
    return out


# 1) Acil durum: hızlı iki tonlu warble alarmı, yüksek ve ısrarlı
def make_emergency():
    out = []
    for _ in range(7):
        out += tone(1000, 0.16, amp=0.9, wave_type="triangle", attack=0.003, release=0.01)
        out += tone(760, 0.16, amp=0.9, wave_type="triangle", attack=0.003, release=0.01)
    return out


# 2) Görev: temiz tek ping (parlak çan)
def make_task():
    out = bell(1318, 0.5, amp=0.7)  # E6
    return out


# 3) Yemek listesi: yumuşak iki nota yükselen chime
def make_meal():
    out = bell(784, 0.42, amp=0.6)   # G5
    out += silence(0.05)
    out += bell(1046, 0.6, amp=0.6)  # C6
    return out


# 4) Maaş: yükselen parlak 4 notalı arpej (pozitif / "cha-ching")
def make_salary():
    out = []
    for f in (784, 988, 1318, 1568):  # G5 B5 E6 G6
        out += bell(f, 0.18, amp=0.55)
    out += bell(2093, 0.5, amp=0.45)  # parıltı C7
    return out


# 5) Resmi uyarı: ciddi çift düşük bip (kare dalga)
def make_warning():
    out = tone(523, 0.18, amp=0.6, wave_type="square", attack=0.004, release=0.03)
    out += silence(0.08)
    out += tone(523, 0.18, amp=0.6, wave_type="square", attack=0.004, release=0.03)
    out += silence(0.05)
    out += tone(392, 0.26, amp=0.55, wave_type="square", attack=0.004, release=0.05)
    return out


# 6) Kimlik/pasaport: tarama onay bipleri (2 kısa yüksek + onay)
def make_kbs():
    out = tone(1900, 0.07, amp=0.5, wave_type="sine", attack=0.003, release=0.02)
    out += silence(0.04)
    out += tone(1900, 0.07, amp=0.5, wave_type="sine", attack=0.003, release=0.02)
    out += silence(0.04)
    out += bell(1245, 0.4, amp=0.55)  # onay tonu
    return out


# 7) Mesaj: Instagram DM tarzı yumuşak, yuvarlak pop (kısa, mellow)
def make_message():
    total = _n(0.34)
    out = []
    for i in range(total):
        t = i / SAMPLE_RATE
        # 560 Hz -> 430 Hz hafif düşüş, yumuşak çan zarfı
        f = 560 - 130 * (t / 0.34)
        env = math.exp(-7.0 * t / 0.34)
        v = math.sin(2 * math.pi * f * t) + 0.3 * math.sin(2 * math.pi * f * 2 * t)
        out.append(v * 0.6 * env * _adsr(i, total, 0.006, 0.04))
    return out


def main():
    print("Valoria bildirim sesleri üretiliyor...")
    _write_wav("emergency_alert.wav", make_emergency())
    _write_wav("task_ping.wav", make_task())
    _write_wav("meal_chime.wav", make_meal())
    _write_wav("salary_cash.wav", make_salary())
    _write_wav("warning_alert.wav", make_warning())
    _write_wav("kbs_scan.wav", make_kbs())
    _write_wav("message_pop.wav", make_message())
    print("Tamamlandı:", os.path.normpath(OUT_DIR))


if __name__ == "__main__":
    main()
