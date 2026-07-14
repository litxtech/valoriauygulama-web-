import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { submitCheckOut } from '../lib/kbsOpsApi';
import { useAuth } from '../auth/AuthContext';
import { resolveOpsContext } from '../lib/captures';

type StayRow = {
  id: string;
  room_no: string;
  first_name: string | null;
  last_name: string | null;
  nationality: string | null;
  stay_status: string;
  guest_document_id: string | null;
  checkin_at: string;
  kbs_reference_no: string | null;
};

const ACTIVE = new Set(['checked_in', 'checkout_pending', 're_submitted']);

export function InHousePage() {
  const { staffPerms } = useAuth();
  const canCheckout = staffPerms?.kbs_cikis === true;
  const [rows, setRows] = useState<StayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const ctx = await resolveOpsContext();
    if (!ctx.ok) {
      setError(ctx.message);
      setLoading(false);
      return;
    }
    const { data, error: qErr } = await supabase
      .schema('ops')
      .from('guest_stays')
      .select(
        'id, room_no, first_name, last_name, nationality, stay_status, guest_document_id, checkin_at, kbs_reference_no'
      )
      .eq('hotel_id', ctx.hotelId)
      .in('stay_status', [...ACTIVE])
      .order('checkin_at', { ascending: false })
      .limit(200);
    if (qErr) {
      setError(qErr.message);
      setRows([]);
    } else {
      setRows((data ?? []) as StayRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const checkout = async (row: StayRow) => {
    if (!canCheckout) {
      setMsg('Çıkış yetkiniz yok');
      return;
    }
    if (!row.guest_document_id) {
      setMsg('Belge kaydı yok — çıkış yapılamaz');
      return;
    }
    if (!window.confirm(`${[row.first_name, row.last_name].filter(Boolean).join(' ')} çıkış yapılsın mı?`)) {
      return;
    }
    setBusyId(row.id);
    setMsg(null);
    const res = await submitCheckOut(row.guest_document_id);
    setBusyId(null);
    if (!res.ok) {
      setMsg(res.error.message);
      return;
    }
    setMsg(`Çıkış gönderildi${res.data.transactionId ? ` · ${String(res.data.transactionId).slice(0, 8)}…` : ''}`);
    void load();
  };

  return (
    <div className="inhouse-page">
      <header className="page-head">
        <div>
          <h1>İçeride</h1>
          <p className="muted">Bildirilmiş konaklayanlar — çıkış buradan.</p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void load()}>
          Yenile
        </button>
      </header>

      {msg ? <div className="ops-msg">{msg}</div> : null}
      {error ? <div className="state-box">{error}</div> : null}
      {loading ? <div className="state-box">Yükleniyor…</div> : null}

      {!loading && !error && rows.length === 0 ? (
        <div className="state-box">Aktif konaklayan yok.</div>
      ) : null}

      <ul className="inhouse-list">
        {rows.map((r) => {
          const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || '—';
          return (
            <li key={r.id} className="inhouse-card">
              <div>
                <strong>{name}</strong>
                <div className="muted">
                  Oda {r.room_no} · {r.nationality ?? '—'} · {r.stay_status}
                </div>
                <div className="muted tiny">
                  Giriş {new Date(r.checkin_at).toLocaleString('tr-TR')}
                  {r.kbs_reference_no ? ` · ref ${r.kbs_reference_no}` : ''}
                </div>
              </div>
              {canCheckout ? (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busyId === r.id}
                  onClick={() => void checkout(r)}
                >
                  {busyId === r.id ? '…' : 'Çıkış'}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
