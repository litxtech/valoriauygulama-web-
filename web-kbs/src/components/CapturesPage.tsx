import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  fetchCaptures,
  resolveOpsContext,
  subscribeCaptures,
  type CaptureItem,
} from '../lib/captures';
import { buildKbsCopyFields, kbsDisplayFullName } from '../lib/parse';
import { CaptureCard } from './CaptureCard';
import { CaptureDetailModal } from './CaptureDetailModal';

function matchesQuery(item: CaptureItem, q: string): boolean {
  if (!q) return true;
  const parsed = item.parsed;
  const haystack = [
    kbsDisplayFullName(parsed) ?? '',
    item.room_number ?? '',
    item.captured_by_staff_name ?? '',
    ...buildKbsCopyFields(parsed).map((f) => f.value),
  ]
    .join(' ')
    .toLocaleLowerCase('tr-TR');
  return haystack.includes(q.toLocaleLowerCase('tr-TR'));
}

export function CapturesPage() {
  const { session, signOut } = useAuth();
  const [items, setItems] = useState<CaptureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<CaptureItem | null>(null);
  const [live, setLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const hotelRef = useRef<string | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      let hotelId = hotelRef.current;
      if (!hotelId) {
        const ctx = await resolveOpsContext();
        if (!ctx.ok) {
          setError(ctx.message);
          setLoading(false);
          return;
        }
        hotelId = ctx.hotelId;
        hotelRef.current = hotelId;
      }
      const data = await fetchCaptures(hotelId);
      setItems(data);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Liste yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => {
      void load();
    }, 400);
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!hotelRef.current && !items.length) return;
    const unsub = subscribeCaptures(() => {
      setLive(true);
      scheduleReload();
    });
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      unsub();
    };
  }, [scheduleReload, items.length]);

  const filtered = useMemo(() => items.filter((i) => matchesQuery(i, query)), [items, query]);

  const email = session?.user?.email ?? '';

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="login-logo sm">V</span>
          <div>
            <strong>Çekilen Kimlikler</strong>
            <span className={`live-dot ${live ? 'on' : ''}`}>
              {live ? 'Canlı' : 'Bağlı'}
            </span>
          </div>
        </div>
        <div className="topbar-actions">
          <input
            className="search"
            placeholder="Ad, oda, no, uyruk ara…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn-ghost" onClick={() => void load()}>
            Yenile
          </button>
          <div className="user-chip" title={email}>
            {email}
          </div>
          <button className="btn-ghost" onClick={() => void signOut()}>
            Çıkış
          </button>
        </div>
      </header>

      <main className="content">
        {error ? (
          <div className="state-box error">
            <p>{error}</p>
            <button className="btn-primary" onClick={() => void load()}>
              Tekrar dene
            </button>
          </div>
        ) : loading ? (
          <div className="state-box">Yükleniyor…</div>
        ) : filtered.length === 0 ? (
          <div className="state-box">
            {query ? 'Aramaya uygun kayıt yok.' : 'Henüz çekilen kimlik yok.'}
          </div>
        ) : (
          <>
            <div className="content-meta">
              <span>{filtered.length} kayıt</span>
              {lastUpdated ? (
                <span>Son güncelleme {lastUpdated.toLocaleTimeString('tr-TR')}</span>
              ) : null}
            </div>
            <div className="grid">
              {filtered.map((item) => (
                <CaptureCard key={item.id} item={item} onOpen={setSelected} />
              ))}
            </div>
          </>
        )}
      </main>

      {selected ? (
        <CaptureDetailModal item={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}
