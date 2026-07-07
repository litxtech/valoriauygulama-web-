import { useEffect, useState } from 'react';
import type { CaptureItem } from '../lib/captures';
import { buildKbsCopyFields, kbsCaptureCardStatus, kbsDisplayFullName } from '../lib/parse';
import { StatusBadge } from './StatusBadge';

type Props = {
  item: CaptureItem;
  onClose: () => void;
};

export function CaptureDetailModal({ item, onClose }: Props) {
  const parsed = item.parsed;
  const name = kbsDisplayFullName(parsed) ?? 'İsim okunamadı';
  const status = kbsCaptureCardStatus(parsed);
  const fields = buildKbsCopyFields(parsed);
  const [copied, setCopied] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') (zoom ? setZoom(null) : onClose());
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

  const images = [item.front_image_url, item.back_image_url].filter(Boolean) as string[];
  const capturedAt = new Date(item.captured_at ?? item.created_at).toLocaleString('tr-TR');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>{name}</h2>
            <div className="modal-sub">
              <StatusBadge status={status} />
              {item.room_number ? <span className="chip">Oda {item.room_number}</span> : null}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Kapat">
            ×
          </button>
        </header>

        <div className="modal-body">
          <div className="modal-images">
            {images.length ? (
              images.map((src) => (
                <img key={src} src={src} alt={name} onClick={() => setZoom(src)} />
              ))
            ) : (
              <div className="card-thumb-empty">Görsel yok</div>
            )}
          </div>

          <div className="modal-fields">
            <div className="fields-head">
              <h3>Kimlik Bilgileri</h3>
              <button className="btn-ghost" onClick={copyAll}>
                {copied === '__all__' ? 'Kopyalandı' : 'Tümünü kopyala'}
              </button>
            </div>

            {fields.length === 0 ? (
              <p className="muted">Okunabilir alan yok. Belge yeniden çekilmeli.</p>
            ) : (
              <ul className="field-list">
                {fields.map((f) => (
                  <li key={f.key} onClick={() => copy(f.key, f.value)} title="Kopyalamak için tıkla">
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
          </div>
        </div>
      </div>

      {zoom ? (
        <div className="zoom-overlay" onClick={() => setZoom(null)}>
          <img src={zoom} alt={name} />
        </div>
      ) : null}
    </div>
  );
}
