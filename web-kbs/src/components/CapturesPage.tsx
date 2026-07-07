import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  buildFamilyIndex,
  captureDate,
  fetchCaptures,
  resolveOpsContext,
  subscribeCaptures,
  type CaptureItem,
} from '../lib/captures';
import { buildKbsCopyFields, kbsDisplayFullName } from '../lib/parse';
import { CaptureCard } from './CaptureCard';
import { CaptureDetailModal } from './CaptureDetailModal';

type RangeKey = 'all' | 'today' | 'week';

function matchesQuery(item: CaptureItem, q: string): boolean {
  if (!q) return true;
  const parsed = item.parsed;
  const haystack = [
    kbsDisplayFullName(parsed) ?? '',
    item.room_number ?? '',
    item.captured_by_staff_name ?? '',
    item.captured_by_hotel_name ?? '',
    item.guest_phone_submitted ?? '',
    ...buildKbsCopyFields(parsed).map((f) => f.value),
  ]
    .join(' ')
    .toLocaleLowerCase('tr-TR');
  return haystack.includes(q.toLocaleLowerCase('tr-TR'));
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeek(): number {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Pazartesi = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function inRange(item: CaptureItem, range: RangeKey): boolean {
  if (range === 'all') return true;
  const t = captureDate(item).getTime();
  return range === 'today' ? t >= startOfToday() : t >= startOfWeek();
}

export function CapturesPage() {
  const { session, signOut } = useAuth();
  const [items, setItems] = useState<CaptureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [range, setRange] = useState<RangeKey>('all');
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

  const familyIndex = useMemo(() => buildFamilyIndex(items), [items]);

  const stats = useMemo(() => {
    const todayStart = startOfToday();
    const weekStart = startOfWeek();
    let today = 0;
    let week = 0;
    for (const it of items) {
      const t = captureDate(it).getTime();
      if (t >= todayStart) today++;
      if (t >= weekStart) week++;
    }
    return { total: items.length, today, week };
  }, [items]);

  const hotelLabel = useMemo(() => {
    const names = [...new Set(items.map((i) => i.captured_by_hotel_name).filter(Boolean))] as string[];
    if (names.length === 1) return names[0]!;
    if (names.length > 1) return `${names.length} otel`;
    return null;
  }, [items]);

  const filtered = useMemo(
    () => items.filter((i) => inRange(i, range) && matchesQuery(i, query)),
    [items, range, query]
  );

  const handlePhoneSaved = useCallback((id: string, phone: string | null) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, guest_phone_submitted: phone } : it)));
    setSelected((cur) => (cur && cur.id === id ? { ...cur, guest_phone_submitted: phone } : cur));
  }, []);

  const email = session?.user?.email ?? '';

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="login-logo sm">V</span>
          <div>
            <strong>Çekilen Kimlikler</strong>
            <span className="brand-sub">
              {hotelLabel ? <span className="hotel-tag">🏨 {hotelLabel}</span> : null}
              <span className={`live-dot ${live ? 'on' : ''}`}>{live ? 'Canlı' : 'Bağlı'}</span>
            </span>
          </div>
        </div>
        <div className="topbar-actions">
          <input
            className="search"
            placeholder="Ad, oda, no, uyruk, personel ara…"
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
        ) : (
          <>
            <div className="stats-bar">
              <button
                className={`stat ${range === 'today' ? 'active' : ''}`}
                onClick={() => setRange((r) => (r === 'today' ? 'all' : 'today'))}
              >
                <span className="stat-num">{stats.today}</span>
                <span className="stat-label">Bugün</span>
              </button>
              <button
                className={`stat ${range === 'week' ? 'active' : ''}`}
                onClick={() => setRange((r) => (r === 'week' ? 'all' : 'week'))}
              >
                <span className="stat-num">{stats.week}</span>
                <span className="stat-label">Bu hafta</span>
              </button>
              <button
                className={`stat ${range === 'all' ? 'active' : ''}`}
                onClick={() => setRange('all')}
              >
                <span className="stat-num">{stats.total}</span>
                <span className="stat-label">Toplam</span>
              </button>
              {lastUpdated ? (
                <span className="stats-updated">
                  Son güncelleme {lastUpdated.toLocaleTimeString('tr-TR')}
                </span>
              ) : null}
            </div>

            {filtered.length === 0 ? (
              <div className="state-box">
                {query || range !== 'all'
                  ? 'Seçime uygun kayıt yok.'
                  : 'Henüz çekilen kimlik yok.'}
              </div>
            ) : (
              <>
                <div className="content-meta">
                  <span>
                    {filtered.length} kayıt
                    {range === 'today' ? ' · Bugün' : range === 'week' ? ' · Bu hafta' : ''}
                  </span>
                </div>
                <div className="grid">
                  {filtered.map((item) => (
                    <CaptureCard
                      key={item.id}
                      item={item}
                      onOpen={setSelected}
                      familyCount={
                        item.mrz_batch_key
                          ? familyIndex.get(item.mrz_batch_key)?.length ?? 0
                          : 0
                      }
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>

      {selected ? (
        <CaptureDetailModal
          item={selected}
          familyIndex={familyIndex}
          onClose={() => setSelected(null)}
          onSelect={setSelected}
          onPhoneSaved={handlePhoneSaved}
        />
      ) : null}
    </div>
  );
}
