import type { CaptureItem } from '../lib/captures';
import { buildKbsCopyFields, kbsCaptureCardStatus, kbsDisplayFullName } from '../lib/parse';
import { StatusBadge } from './StatusBadge';

type Props = {
  item: CaptureItem;
  onOpen: (item: CaptureItem) => void;
};

export function CaptureCard({ item, onOpen }: Props) {
  const parsed = item.parsed;
  const name = kbsDisplayFullName(parsed) ?? 'İsim okunamadı';
  const status = kbsCaptureCardStatus(parsed);
  const fields = buildKbsCopyFields(parsed);
  const docNo = fields.find((f) => f.key === 'documentNumber')?.value;
  const nationality = fields.find((f) => f.key === 'nationalityCode')?.value;
  const capturedAt = new Date(item.captured_at ?? item.created_at).toLocaleString('tr-TR');

  return (
    <button className="card" onClick={() => onOpen(item)}>
      <div className="card-thumb">
        {item.front_image_url ? (
          <img src={item.front_image_url} alt={name} loading="lazy" />
        ) : (
          <div className="card-thumb-empty">Görsel yok</div>
        )}
        {item.room_number ? <span className="card-room">Oda {item.room_number}</span> : null}
      </div>
      <div className="card-body">
        <div className="card-head">
          <h3 title={name}>{name}</h3>
          <StatusBadge status={status} />
        </div>
        <dl className="card-meta">
          {docNo ? (
            <div>
              <dt>No</dt>
              <dd>{docNo}</dd>
            </div>
          ) : null}
          {nationality ? (
            <div>
              <dt>Uyruk</dt>
              <dd>{nationality}</dd>
            </div>
          ) : null}
        </dl>
        <div className="card-foot">
          <span>{item.captured_by_staff_name ?? '—'}</span>
          <span>{capturedAt}</span>
        </div>
      </div>
    </button>
  );
}
