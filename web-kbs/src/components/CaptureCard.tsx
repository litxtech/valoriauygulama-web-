import { memo, useCallback } from 'react';
import { isRecentlyAddedCapture, type CaptureItem } from '../lib/captures';
import {
  buildKbsCopyFields,
  isKbsReturningGuest,
  kbsCaptureCardStatus,
  kbsDisplayFullName,
} from '../lib/parse';
import { StatusBadge } from './StatusBadge';

type Props = {
  item: CaptureItem;
  onOpen: (item: CaptureItem) => void;
  familyCount?: number;
  freshnessTick?: number;
};

const DOC_TYPE_LABEL: Record<string, string> = {
  passport: 'Pasaport',
  id_card: 'Kimlik',
  residence_permit: 'İkamet',
};

function personInitial(name: string): string {
  const ch = name.trim().charAt(0);
  return ch ? ch.toLocaleUpperCase('tr-TR') : '?';
}

function formatCapturedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Bugün ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Dün ${time}`;
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CaptureCardInner({ item, onOpen, familyCount = 0, freshnessTick = 0 }: Props) {
  const parsed = item.parsed;
  const name = kbsDisplayFullName(parsed) ?? 'İsim okunamadı';
  const status = kbsCaptureCardStatus(parsed, { ocrStatus: item.ocr_status });
  const isNew = isRecentlyAddedCapture(item);
  void freshnessTick;
  const fields = buildKbsCopyFields(parsed);
  const docNo = fields.find((f) => f.key === 'documentNumber')?.value;
  const nationality = fields.find((f) => f.key === 'nationalityCode')?.value;
  const docType = parsed?.documentType ? DOC_TYPE_LABEL[parsed.documentType] : null;
  const hotel = item.hotel_name ?? item.captured_by_hotel_name ?? null;
  const staff = item.captured_by_staff_name?.trim() || null;
  const capturedLabel = formatCapturedAt(item.captured_at ?? item.created_at);
  const returning = isKbsReturningGuest(parsed);

  const handleOpen = useCallback(() => {
    onOpen(item);
  }, [onOpen, item]);

  return (
    <button
      type="button"
      className={`cap-card${isNew ? ' is-new' : ''}${status.tone === 'warn' ? ' is-warn' : ''}${status.tone === 'progress' ? ' is-busy' : ''}`}
      onClick={handleOpen}
    >
      <div className="cap-thumb">
        {item.front_image_url ? (
          <img
            src={item.front_image_url}
            alt=""
            loading="lazy"
            decoding="async"
            fetchPriority="low"
          />
        ) : (
          <div className="cap-thumb-fallback" aria-hidden>
            {personInitial(name)}
          </div>
        )}
      </div>

      <div className="cap-body">
        <div className="cap-top">
          <div className="cap-title-block">
            <h3 title={name}>{name}</h3>
            <div className="cap-primary-meta">
              <span className={`cap-room${item.room_number ? '' : ' empty'}`}>
                {item.room_number ? `Oda ${item.room_number}` : 'Oda yok'}
              </span>
              {docType ? <span className="cap-sep">·</span> : null}
              {docType ? <span className="cap-doc-type">{docType}</span> : null}
              {familyCount > 1 ? (
                <>
                  <span className="cap-sep">·</span>
                  <span className="cap-family">{familyCount} kişi</span>
                </>
              ) : null}
            </div>
          </div>
          <div className="cap-status-col">
            <StatusBadge status={status} />
            {isNew ? <span className="cap-new">Yeni</span> : null}
          </div>
        </div>

        {(docNo || nationality || returning) && (
          <div className="cap-id-row">
            {docNo ? <span className="cap-doc-no">{docNo}</span> : null}
            {nationality ? <span className="cap-nat">{nationality}</span> : null}
            {returning ? <span className="cap-returning">Tekrar konuk</span> : null}
          </div>
        )}

        <div className={`cap-phone${item.guest_phone_submitted ? ' has' : ' empty'}`}>
          {item.guest_phone_submitted ? item.guest_phone_submitted : 'Telefon eklenmedi'}
        </div>

        <div className="cap-foot">
          <span className="cap-meta" title={hotel ?? undefined}>
            {hotel ?? 'Otel —'}
          </span>
          <span className="cap-dot" aria-hidden>
            ·
          </span>
          <span className="cap-meta" title={staff ?? undefined}>
            {staff ?? 'Personel —'}
          </span>
          <span className="cap-dot" aria-hidden>
            ·
          </span>
          <span className="cap-time">{capturedLabel}</span>
        </div>
      </div>
    </button>
  );
}

export const CaptureCard = memo(CaptureCardInner);
