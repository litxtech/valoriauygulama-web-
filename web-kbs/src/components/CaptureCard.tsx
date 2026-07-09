import { memo, useCallback } from 'react';
import type { CaptureItem } from '../lib/captures';
import { buildKbsCopyFields, kbsCaptureCardStatus, kbsDisplayFullName } from '../lib/parse';
import { StatusBadge } from './StatusBadge';

type Props = {
  item: CaptureItem;
  onOpen: (item: CaptureItem) => void;
  familyCount?: number;
};

const DOC_TYPE_LABEL: Record<string, string> = {
  passport: 'Pasaport',
  id_card: 'Kimlik',
  residence_permit: 'İkamet',
};

function CaptureCardInner({ item, onOpen, familyCount = 0 }: Props) {
  const parsed = item.parsed;
  const name = kbsDisplayFullName(parsed) ?? 'İsim okunamadı';
  const status = kbsCaptureCardStatus(parsed);
  const fields = buildKbsCopyFields(parsed);
  const docNo = fields.find((f) => f.key === 'documentNumber')?.value;
  const nationality = fields.find((f) => f.key === 'nationalityCode')?.value;
  const docType = parsed?.documentType ? DOC_TYPE_LABEL[parsed.documentType] : null;
  const capturedAt = new Date(item.captured_at ?? item.created_at).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleOpen = useCallback(() => {
    onOpen(item);
  }, [onOpen, item]);

  return (
    <button type="button" className="card" onClick={handleOpen}>
      <div className="card-thumb">
        {item.front_image_url ? (
          <img
            src={item.front_image_url}
            alt=""
            loading="lazy"
            decoding="async"
            fetchPriority="low"
          />
        ) : (
          <div className="card-thumb-empty">Görsel yok</div>
        )}
        <div className="card-thumb-badges">
          {item.room_number ? <span className="pill pill-room">Oda {item.room_number}</span> : null}
          {docType ? <span className="pill pill-doc">{docType}</span> : null}
        </div>
        {familyCount > 1 ? (
          <span className="pill pill-family" title="Aynı grupta çekilen kişi sayısı">
            👪 {familyCount}
          </span>
        ) : null}
      </div>

      <div className="card-body">
        <div className="card-head">
          <h3 title={name}>{name}</h3>
          <StatusBadge status={status} />
        </div>

        <div className="card-tags">
          {nationality ? <span className="tag">{nationality}</span> : null}
          {docNo ? <span className="tag tag-mono">{docNo}</span> : null}
        </div>

        <div className={`card-phone ${item.guest_phone_submitted ? 'has' : 'empty'}`}>
          <span className="ico" aria-hidden>
            📞
          </span>
          {item.guest_phone_submitted ? item.guest_phone_submitted : 'Numara ekle'}
        </div>

        <div className="card-foot">
          <span className="card-hotel" title={item.hotel_name ?? item.captured_by_hotel_name ?? ''}>
            <span className="ico" aria-hidden>
              🏨
            </span>
            {item.hotel_name ?? item.captured_by_hotel_name ?? 'Otel —'}
          </span>
          <span className="card-staff" title={item.captured_by_staff_name ?? ''}>
            <span className="ico" aria-hidden>
              👤
            </span>
            {item.captured_by_staff_name ?? '—'}
          </span>
        </div>
        <div className="card-time">{capturedAt}</div>
      </div>
    </button>
  );
}

export const CaptureCard = memo(CaptureCardInner);
