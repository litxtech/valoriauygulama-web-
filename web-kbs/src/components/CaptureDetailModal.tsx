import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  familyMembersOf,
  findDuplicatePhoneHit,
  indexOfRoommate,
  isRecentlyAddedCapture,
  requestCaptureRead,
  roommatesOf,
  updateCaptureGuestPhone,
  updateCaptureManualFields,
  type CaptureItem,
  type DuplicatePhoneHit,
} from '../lib/captures';
import {
  buildKbsCopyFields,
  formatKbsReturningGuestWarning,
  isKbsReturningGuest,
  kbsCaptureCardStatus,
  kbsDisplayFullName,
} from '../lib/parse';
import { fetchOpsRooms, notifyCaptureToKbs, type OpsRoom } from '../lib/kbsOpsApi';
import { useAuth } from '../auth/AuthContext';
import { StatusBadge } from './StatusBadge';
import { ZoomLightbox } from './ZoomLightbox';

type Props = {
  item: CaptureItem;
  allItems: CaptureItem[];
  familyIndex: Map<string, CaptureItem[]>;
  onClose: () => void;
  onSelect: (item: CaptureItem) => void;
  onPhoneSaved?: (id: string, phone: string | null) => void;
  onReadRequested?: (item: CaptureItem) => void;
  onCaptureUpdated?: (item: CaptureItem) => void;
};

const QUICK_KEYS = new Set(['documentNumber', 'nationalityCode', 'birthDate', 'expiryDate', 'gender']);

export function CaptureDetailModal({
  item,
  allItems,
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
  const status = kbsCaptureCardStatus(parsed, { ocrStatus: item.ocr_status });
  const fields = buildKbsCopyFields(parsed, { showEmpty: true });
  const quickFields = fields.filter((f) => QUICK_KEYS.has(f.key));
  const detailFields = fields.filter((f) => !QUICK_KEYS.has(f.key));
  const returningWarn = formatKbsReturningGuestWarning(parsed);
  const [copied, setCopied] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const roommates = useMemo(() => roommatesOf(item, allItems), [item, allItems]);
  const pageIndex = indexOfRoommate(item.id, roommates);
  const hasMultiple = roommates.length > 1;

  const [phone, setPhone] = useState(item.guest_phone_submitted ?? '');
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneMsg, setPhoneMsg] = useState<string | null>(null);
  const [phoneDup, setPhoneDup] = useState<DuplicatePhoneHit | null>(null);
  const [readBusy, setReadBusy] = useState(false);
  const [readMsg, setReadMsg] = useState<string | null>(null);

  const [firstName, setFirstName] = useState(parsed?.firstName ?? '');
  const [lastName, setLastName] = useState(parsed?.lastName ?? '');
  const [docNo, setDocNo] = useState(parsed?.documentNumber ?? '');
  const [birthDate, setBirthDate] = useState(parsed?.birthDate?.slice(0, 10) ?? '');
  const [nationality, setNationality] = useState(parsed?.nationalityCode ?? '');
  const [expiryDate, setExpiryDate] = useState(parsed?.expiryDate?.slice(0, 10) ?? '');
  const [gender, setGender] = useState(parsed?.gender ?? '');
  const [docSeries, setDocSeries] = useState(parsed?.documentSeries ?? '');
  const [rooms, setRooms] = useState<OpsRoom[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [opsBusy, setOpsBusy] = useState(false);
  const [opsMsg, setOpsMsg] = useState<string | null>(null);
  const dirtyKeys = useRef(new Set<string>());

  useEffect(() => {
    setPhone(item.guest_phone_submitted ?? '');
    setPhoneMsg(null);
    setPhoneDup(null);
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
    setExpiryDate(item.parsed?.expiryDate?.slice(0, 10) ?? '');
    setGender(item.parsed?.gender ?? '');
    setDocSeries(item.parsed?.documentSeries ?? '');
  }, [item.id]);

  useEffect(() => {
    const phoneVal = item.guest_phone_submitted?.trim();
    if (!phoneVal) {
      setPhoneDup(null);
      return;
    }
    let cancelled = false;
    void findDuplicatePhoneHit({
      phone: phoneVal,
      excludeDocumentId: item.id,
      hotelId: item.hotel_id,
      items: allItems,
    }).then((hit) => {
      if (!cancelled) setPhoneDup(hit);
    });
    return () => {
      cancelled = true;
    };
  }, [item.id, item.guest_phone_submitted, item.hotel_id, allItems]);

  useEffect(() => {
    const p = item.parsed;
    if (!p) return;
    if (!dirtyKeys.current.has('firstName')) setFirstName(p.firstName ?? '');
    if (!dirtyKeys.current.has('lastName')) setLastName(p.lastName ?? '');
    if (!dirtyKeys.current.has('docNo')) setDocNo(p.documentNumber ?? '');
    if (!dirtyKeys.current.has('birthDate')) setBirthDate(p.birthDate?.slice(0, 10) ?? '');
    if (!dirtyKeys.current.has('nationality')) setNationality(p.nationalityCode ?? '');
    if (!dirtyKeys.current.has('expiryDate')) setExpiryDate(p.expiryDate?.slice(0, 10) ?? '');
    if (!dirtyKeys.current.has('gender')) setGender(p.gender ?? '');
    if (!dirtyKeys.current.has('docSeries')) setDocSeries(p.documentSeries ?? '');
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
    setPhoneDup(null);
    try {
      await updateCaptureGuestPhone(item.id, next);
      setPhoneMsg('Kaydedildi');
      onPhoneSaved?.(item.id, next);
      if (next) {
        const hit = await findDuplicatePhoneHit({
          phone: next,
          excludeDocumentId: item.id,
          hotelId: item.hotel_id,
          items: allItems,
        });
        if (hit) {
          setPhoneDup(hit);
          const when = new Date(hit.capturedAt).toLocaleString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          setPhoneMsg(
            `✓ Daha önce eklendi — ${hit.guestName}${hit.roomNumber ? ` · Oda ${hit.roomNumber}` : ''} · ${when}`
          );
        }
      }
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
        expiryDate,
        gender,
        documentSeries: docSeries,
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
        expiryDate,
        gender,
        documentSeries: docSeries,
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
  const capturedAt = new Date(item.captured_at ?? item.created_at).toLocaleString('tr-TR');
  const images = [item.front_image_url, item.back_image_url].filter(Boolean) as string[];

  const goTo = useCallback(
    (index: number) => {
      const target = roommates[index];
      if (target && target.id !== item.id) {
        startTransition(() => onSelect(target));
      }
    },
    [item.id, onSelect, roommates]
  );

  const goPrev = useCallback(() => {
    if (pageIndex > 0) goTo(pageIndex - 1);
  }, [goTo, pageIndex]);

  const goNext = useCallback(() => {
    if (pageIndex < roommates.length - 1) goTo(pageIndex + 1);
  }, [goTo, pageIndex, roommates.length]);

  useEffect(() => {
    if (zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, zoom, goPrev, goNext]);

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
      setReadMsg('Okuma kuyruğa alındı. Sonuç gelmezse alanları elle girin.');
    } catch (e) {
      setReadMsg(e instanceof Error ? e.message : 'Okuma başlatılamadı');
    } finally {
      setReadBusy(false);
    }
  };

  const selectMember = useCallback(
    (m: CaptureItem) => {
      startTransition(() => onSelect(m));
    },
    [onSelect]
  );

  return (
    <div className="pv-overlay" onClick={onClose}>
      <div className="pv-modal" onClick={(e) => e.stopPropagation()}>
        <header className="pv-head">
          <div className="pv-head-left">
            {hasMultiple ? (
              <div className="pv-nav">
                <button
                  type="button"
                  className="pv-nav-btn"
                  onClick={goPrev}
                  disabled={pageIndex <= 0}
                  aria-label="Önceki pasaport"
                >
                  ‹
                </button>
                <span className="pv-counter">
                  {pageIndex + 1} / {roommates.length}
                </span>
                <button
                  type="button"
                  className="pv-nav-btn"
                  onClick={goNext}
                  disabled={pageIndex >= roommates.length - 1}
                  aria-label="Sonraki pasaport"
                >
                  ›
                </button>
              </div>
            ) : null}
            <div>
              <h2 className="pv-title">{name}</h2>
              <div className="pv-sub">
                <StatusBadge status={status} />
                {item.room_number ? <span className="chip chip-room">Oda {item.room_number}</span> : null}
                {isRecentlyAddedCapture(item) ? <span className="chip chip-new">Yeni</span> : null}
                {isKbsReturningGuest(parsed) ? <span className="chip chip-returning">Daha önce geldi</span> : null}
              </div>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Kapat">
            ×
          </button>
        </header>

        {returningWarn ? (
          <div className="returning-banner pv-banner" role="alert">
            <span aria-hidden>✓</span>
            <span>{returningWarn}</span>
          </div>
        ) : null}

        <div className="pv-body">
          <div className="pv-image-panel">
            <div className="pv-image-stage">
              {images.length ? (
                images.map((src) => (
                  <button
                    key={src}
                    type="button"
                    className="pv-image-btn"
                    onClick={() => setZoom(src)}
                    aria-label="Yakınlaştır"
                  >
                    <img src={src} alt={name} decoding="async" />
                  </button>
                ))
              ) : (
                <div className="pv-image-empty">Görsel yok</div>
              )}
            </div>

            {hasMultiple ? (
              <div className="pv-thumb-strip">
                <span className="pv-thumb-label">Oda pasaportları</span>
                <div className="pv-thumbs">
                  {roommates.map((m) => {
                    const mName = kbsDisplayFullName(m.parsed) ?? '?';
                    const active = m.id === item.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={`pv-thumb${active ? ' active' : ''}`}
                        onClick={() => selectMember(m)}
                        title={mName}
                      >
                        {m.front_image_url ? (
                          <img src={m.front_image_url} alt="" loading="lazy" decoding="async" />
                        ) : (
                          <span className="pv-thumb-fallback">{mName.charAt(0)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="pv-swipe-hint">← → ok tuşları veya küçük resimlere tıklayın</p>
              </div>
            ) : null}
          </div>

          <div className="pv-info-panel">
            {quickFields.length > 0 ? (
              <div className="pv-quick-grid">
                {quickFields.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className="pv-quick-chip"
                    onClick={() => void copy(f.key, f.value)}
                    title="Kopyala"
                  >
                    <span className="pv-quick-label">{f.label}</span>
                    <span className="pv-quick-value">{f.value}</span>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="phone-block">
              <div className="phone-block-head">
                <span className="phone-ico" aria-hidden>
                  📞
                </span>
                <div>
                  <h3>Müşteri Numarası</h3>
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
              {phoneDup ? (
                <div className="phone-dup-banner" role="alert">
                  <div>
                    <strong>✓ Daha önce eklendi</strong>
                    <p>
                      {phoneDup.guestName}
                      {phoneDup.roomNumber ? ` · Oda ${phoneDup.roomNumber}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-primary phone-compare"
                    onClick={() => {
                      const prev = allItems.find((x) => x.id === phoneDup.documentId);
                      if (prev) onSelect(prev);
                    }}
                  >
                    Önceki kaydı aç
                  </button>
                </div>
              ) : null}
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
                  {readBusy ? 'Okunuyor…' : 'Yeniden oku'}
                </button>
              </div>
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
                  Doğum
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
                <label>
                  Son geçerlilik
                  <input
                    value={expiryDate}
                    onChange={(e) => setDirty('expiryDate', e.target.value, setExpiryDate)}
                    disabled={opsBusy}
                  />
                </label>
                <label>
                  Seri no
                  <input
                    value={docSeries}
                    onChange={(e) => setDirty('docSeries', e.target.value, setDocSeries)}
                    disabled={opsBusy}
                  />
                </label>
                <label>
                  Cinsiyet
                  <input
                    value={gender}
                    onChange={(e) => setDirty('gender', e.target.value, setGender)}
                    disabled={opsBusy}
                    maxLength={1}
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

            {detailFields.length > 0 ? (
              <div className="pv-detail-section">
                <div className="fields-head">
                  <h3>Tüm alanlar</h3>
                  <button type="button" className="btn-ghost" onClick={copyAll}>
                    {copied === '__all__' ? 'Kopyalandı' : 'Tümünü kopyala'}
                  </button>
                </div>
                <div className="pv-field-grid">
                  {detailFields.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      className="pv-field-card"
                      onClick={() => void copy(f.key, f.value)}
                      title="Kopyala"
                    >
                      <span className="field-label">{f.label}</span>
                      <span className="field-value">{f.value}</span>
                      <span className="field-copy">{copied === f.key ? '✓' : '⧉'}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

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
