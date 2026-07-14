import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import {
  familyMembersOf,
  isRecentlyAddedCapture,
  requestCaptureRead,
  updateCaptureGuestPhone,
  updateCaptureManualFields,
  type CaptureItem,
} from '../lib/captures';
import { buildKbsCopyFields, kbsCaptureCardStatus, kbsDisplayFullName } from '../lib/parse';
import { fetchOpsRooms, notifyCaptureToKbs, type OpsRoom } from '../lib/kbsOpsApi';
import { useAuth } from '../auth/AuthContext';
import { StatusBadge } from './StatusBadge';
import { ZoomLightbox } from './ZoomLightbox';

type Props = {
  item: CaptureItem;
  familyIndex: Map<string, CaptureItem[]>;
  onClose: () => void;
  onSelect: (item: CaptureItem) => void;
  onPhoneSaved?: (id: string, phone: string | null) => void;
  onReadRequested?: (item: CaptureItem) => void;
  onCaptureUpdated?: (item: CaptureItem) => void;
};

export function CaptureDetailModal({
  item,
  familyIndex,
  onClose,
  onSelect,
  onPhoneSaved,
  onReadRequested,
  onCaptureUpdated,
}: Props) {
  const { staffPerms } = useAuth();
  const canNotify = staffPerms?.kbs_bildir === true;
  const parsed = item.parsed;
  const name = kbsDisplayFullName(parsed) ?? 'İsim okunamadı';
  const status = kbsCaptureCardStatus(parsed);
  const fields = buildKbsCopyFields(parsed, { showEmpty: true });
  const [copied, setCopied] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [phone, setPhone] = useState(item.guest_phone_submitted ?? '');
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneMsg, setPhoneMsg] = useState<string | null>(null);
  const [readBusy, setReadBusy] = useState(false);
  const [readMsg, setReadMsg] = useState<string | null>(null);

  const [firstName, setFirstName] = useState(parsed?.firstName ?? '');
  const [lastName, setLastName] = useState(parsed?.lastName ?? '');
  const [docNo, setDocNo] = useState(parsed?.documentNumber ?? '');
  const [birthDate, setBirthDate] = useState(parsed?.birthDate?.slice(0, 10) ?? '');
  const [nationality, setNationality] = useState(parsed?.nationalityCode ?? '');
  const [rooms, setRooms] = useState<OpsRoom[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [opsBusy, setOpsBusy] = useState(false);
  const [opsMsg, setOpsMsg] = useState<string | null>(null);
  const dirtyKeys = useRef(new Set<string>());

  useEffect(() => {
    setPhone(item.guest_phone_submitted ?? '');
    setPhoneMsg(null);
    setReadMsg(null);
    setOpsMsg(null);
    setZoom(null);
    setRoomId(null);
    dirtyKeys.current = new Set();
    setFirstName(item.parsed?.firstName ?? '');
    setLastName(item.parsed?.lastName ?? '');
    setDocNo(item.parsed?.documentNumber ?? '');
    setBirthDate(item.parsed?.birthDate?.slice(0, 10) ?? '');
    setNationality(item.parsed?.nationalityCode ?? '');
  }, [item.id]);

  // OCR sonucu gelince boş/elle dokunulmayan alanları doldur
  useEffect(() => {
    const p = item.parsed;
    if (!p) return;
    if (!dirtyKeys.current.has('firstName')) setFirstName(p.firstName ?? '');
    if (!dirtyKeys.current.has('lastName')) setLastName(p.lastName ?? '');
    if (!dirtyKeys.current.has('docNo')) setDocNo(p.documentNumber ?? '');
    if (!dirtyKeys.current.has('birthDate')) setBirthDate(p.birthDate?.slice(0, 10) ?? '');
    if (!dirtyKeys.current.has('nationality')) setNationality(p.nationalityCode ?? '');
  }, [item.parsed]);

  useEffect(() => {
    if (!canNotify) return;
    void fetchOpsRooms().then((res) => {
      if (res.ok) setRooms(res.data);
    });
  }, [canNotify, item.id]);

  const setDirty = (key: string, value: string, setter: (v: string) => void) => {
    dirtyKeys.current.add(key);
    setter(value);
  };

  const savePhone = async () => {
    const next = phone.trim() ? phone.trim() : null;
    if ((item.guest_phone_submitted ?? '') === (next ?? '')) {
      setPhoneMsg('Değişiklik yok');
      return;
    }
    setPhoneSaving(true);
    setPhoneMsg(null);
    try {
      await updateCaptureGuestPhone(item.id, next);
      setPhoneMsg('Kaydedildi');
      onPhoneSaved?.(item.id, next);
    } catch (e) {
      setPhoneMsg(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setPhoneSaving(false);
    }
  };

  const saveManual = async () => {
    setOpsBusy(true);
    setOpsMsg(null);
    try {
      const updated = await updateCaptureManualFields(item, {
        firstName,
        lastName,
        documentNumber: docNo,
        birthDate,
        nationalityCode: nationality,
      });
      onCaptureUpdated?.(updated);
      setOpsMsg('Düzeltmeler kaydedildi');
    } catch (e) {
      setOpsMsg(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setOpsBusy(false);
    }
  };

  const onNotify = async () => {
    if (!canNotify) return;
    if (!roomId) {
      setOpsMsg('Bildirmeden önce oda seçin');
      return;
    }
    setOpsBusy(true);
    setOpsMsg(null);
    try {
      const saved = await updateCaptureManualFields(item, {
        firstName,
        lastName,
        documentNumber: docNo,
        birthDate,
        nationalityCode: nationality,
      });
      onCaptureUpdated?.(saved);
      const res = await notifyCaptureToKbs({ guestDocumentId: item.id, roomId });
      if (!res.ok) {
        setOpsMsg(res.error.message);
        return;
      }
      setOpsMsg(
        res.data.transactionId
          ? `Bildirildi · ${String(res.data.transactionId).slice(0, 8)}…`
          : 'KBS bildirimi alındı'
      );
    } catch (e) {
      setOpsMsg(e instanceof Error ? e.message : 'Bildirim başarısız');
    } finally {
      setOpsBusy(false);
    }
  };

  const family = familyMembersOf(item, familyIndex);

  useEffect(() => {
    if (zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, zoom]);

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1200);
    } catch {
      /* ignore */
    }
  };

  const copyAll = () => {
    const text = fields.map((f) => `${f.label}: ${f.value}`).join('\n');
    void copy('__all__', text);
  };

  const requestRead = async () => {
    if (!item.front_image_url) {
      setReadMsg('Görsel yok, okuma başlatılamaz.');
      return;
    }
    setReadBusy(true);
    setReadMsg(null);
    try {
      const updated = await requestCaptureRead(item);
      onReadRequested?.(updated);
      setReadMsg('Okuma kuyruğa alındı. Sonuç geldiğinde liste otomatik güncellenecek.');
    } catch (e) {
      setReadMsg(e instanceof Error ? e.message : 'Okuma başlatılamadı');
    } finally {
      setReadBusy(false);
    }
  };

  const images = [item.front_image_url, item.back_image_url].filter(Boolean) as string[];
  const capturedAt = new Date(item.captured_at ?? item.created_at).toLocaleString('tr-TR');

  const openZoom = useCallback((src: string) => {
    setZoom(src);
  }, []);

  const selectMember = useCallback(
    (m: CaptureItem) => {
      startTransition(() => onSelect(m));
    },
    [onSelect]
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>{name}</h2>
            <div className="modal-sub">
              <StatusBadge status={status} />
              {isRecentlyAddedCapture(item) ? (
                <span className="chip chip-new" title="Son 1 saat içinde eklendi">
                  ✓ Yeni
                </span>
              ) : null}
              {item.room_number ? <span className="chip">Oda {item.room_number}</span> : null}
              {(item.hotel_name ?? item.captured_by_hotel_name) ? (
                <span className="chip">🏨 {item.hotel_name ?? item.captured_by_hotel_name}</span>
              ) : null}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Kapat">
            ×
          </button>
        </header>

        <div className="modal-body">
          <div className="modal-images">
            {images.length ? (
              images.map((src) => (
                <button
                  key={src}
                  type="button"
                  className="modal-img-btn"
                  onClick={() => openZoom(src)}
                  aria-label="Yakınlaştır"
                >
                  <img src={src} alt={name} decoding="async" />
                </button>
              ))
            ) : (
              <div className="card-thumb-empty">Görsel yok</div>
            )}
          </div>

          <div className="modal-fields">
            <div className="phone-block">
              <div className="phone-block-head">
                <span className="phone-ico" aria-hidden>
                  📞
                </span>
                <div>
                  <h3>Müşteri Numarası</h3>
                  <span className="phone-sub">
                    {name}
                    {item.room_number ? ` · Oda ${item.room_number}` : ''}
                  </span>
                </div>
              </div>
              <div className="phone-row">
                <input
                  className="phone-input"
                  type="tel"
                  inputMode="tel"
                  placeholder="Telefon numarası ekle"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void savePhone();
                  }}
                />
                <button
                  type="button"
                  className="btn-primary phone-save"
                  onClick={() => void savePhone()}
                  disabled={phoneSaving}
                >
                  {phoneSaving ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </div>
              {phoneMsg ? <div className="phone-msg">{phoneMsg}</div> : null}
            </div>

            <div className="ops-edit-block">
              <div className="ops-edit-head">
                <h3>Okunan bilgiler</h3>
                <button
                  type="button"
                  className="btn-primary btn-read"
                  onClick={() => void requestRead()}
                  disabled={readBusy || opsBusy || !item.front_image_url}
                >
                  {readBusy ? 'Okunuyor…' : 'Oku'}
                </button>
              </div>
              <p className="muted ops-hint">
                OCR ile doldurulur. Yanlışsa değiştirin
                {canNotify ? ', kaydedin veya oda seçip Bildir’e basın' : ' ve kaydedin'}.
              </p>
              {readMsg ? <div className="read-msg">{readMsg}</div> : null}
              <div className="ops-grid">
                <label>
                  Ad
                  <input
                    value={firstName}
                    onChange={(e) => setDirty('firstName', e.target.value, setFirstName)}
                    disabled={opsBusy}
                  />
                </label>
                <label>
                  Soyad
                  <input
                    value={lastName}
                    onChange={(e) => setDirty('lastName', e.target.value, setLastName)}
                    disabled={opsBusy}
                  />
                </label>
                <label>
                  Belge no
                  <input
                    value={docNo}
                    onChange={(e) => setDirty('docNo', e.target.value, setDocNo)}
                    disabled={opsBusy}
                  />
                </label>
                <label>
                  Doğum (YYYY-MM-DD)
                  <input
                    value={birthDate}
                    onChange={(e) => setDirty('birthDate', e.target.value, setBirthDate)}
                    disabled={opsBusy}
                  />
                </label>
                <label>
                  Uyruk
                  <input
                    value={nationality}
                    onChange={(e) => setDirty('nationality', e.target.value, setNationality)}
                    disabled={opsBusy}
                  />
                </label>
              </div>
              <div className="ops-actions">
                <button type="button" className="btn-ghost" onClick={() => void saveManual()} disabled={opsBusy}>
                  {opsBusy ? '…' : 'Düzeltmeleri kaydet'}
                </button>
              </div>
              {canNotify ? (
                <div className="ops-notify">
                  <h3>Bildir (KBS)</h3>
                  <div className="ops-rooms">
                    {rooms.length === 0 ? (
                      <p className="muted">OPS odası yok.</p>
                    ) : (
                      rooms.slice(0, 48).map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          className={`chip-btn${roomId === r.id ? ' on' : ''}`}
                          onClick={() => setRoomId(r.id)}
                          disabled={opsBusy}
                        >
                          {r.room_number}
                        </button>
                      ))
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-primary ops-bildir"
                    onClick={() => void onNotify()}
                    disabled={opsBusy || !roomId}
                  >
                    {opsBusy ? 'Gönderiliyor…' : 'Bildir'}
                  </button>
                </div>
              ) : null}
              {opsMsg ? <div className="ops-msg">{opsMsg}</div> : null}
            </div>

            <div className="fields-head">
              <h3>Kopyalanabilir alanlar</h3>
              <div className="fields-actions">
                <button type="button" className="btn-ghost" onClick={copyAll}>
                  {copied === '__all__' ? 'Kopyalandı' : 'Tümünü kopyala'}
                </button>
              </div>
            </div>

            {fields.length === 0 ? (
              <p className="muted">Henüz okunabilir alan yok — üstteki Oku ile başlatın veya alanları elle girin.</p>
            ) : (
              <ul className="field-list">
                {fields.map((f) => (
                  <li key={f.key} onClick={() => void copy(f.key, f.value)} title="Kopyalamak için tıkla">
                    <span className="field-label">{f.label}</span>
                    <span className="field-value">{f.value}</span>
                    <span className="field-copy">{copied === f.key ? '✓' : '⧉'}</span>
                  </li>
                ))}
              </ul>
            )}

            <dl className="field-list secondary">
              <div>
                <dt>Çeken personel</dt>
                <dd>{item.captured_by_staff_name ?? '—'}</dd>
              </div>
              <div>
                <dt>Otel</dt>
                <dd>{item.hotel_name ?? item.captured_by_hotel_name ?? '—'}</dd>
              </div>
              <div>
                <dt>Kayıt zamanı</dt>
                <dd>{capturedAt}</dd>
              </div>
              <div>
                <dt>Durum</dt>
                <dd>{item.scan_status}</dd>
              </div>
              {parsed?.rawMrz ? (
                <div className="mrz-row">
                  <dt>MRZ</dt>
                  <dd>
                    <code>{parsed.rawMrz}</code>
                  </dd>
                </div>
              ) : null}
            </dl>

            {family.length > 1 ? (
              <div className="family-block">
                <h3>Aynı grup / aile · {family.length} kişi</h3>
                <ul className="family-list">
                  {family.map((m) => {
                    const mName = kbsDisplayFullName(m.parsed) ?? 'İsim okunamadı';
                    const isCurrent = m.id === item.id;
                    return (
                      <li
                        key={m.id}
                        className={isCurrent ? 'current' : ''}
                        onClick={() => !isCurrent && selectMember(m)}
                        title={isCurrent ? 'Görüntülenen kişi' : 'Aç'}
                      >
                        {m.front_image_url ? (
                          <img src={m.front_image_url} alt="" loading="lazy" decoding="async" />
                        ) : (
                          <span className="family-noimg">—</span>
                        )}
                        <span className="family-name">{mName}</span>
                        <span className="family-room">{m.room_number ? `Oda ${m.room_number}` : ''}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {zoom ? <ZoomLightbox src={zoom} alt={name} onClose={() => setZoom(null)} /> : null}
    </div>
  );
}
