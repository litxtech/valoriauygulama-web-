import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  buildFamilyIndex,
  buildStaffFilterOptions,
  captureDate,
  fetchCaptures,
  listAccessibleHotels,
  resolveOpsContext,
  subscribeCaptures,
  type CaptureItem,
  type KbsWebHotel,
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
    item.hotel_name ?? '',
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
  const day = (d.getDay() + 6) % 7;
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
  const [hotels, setHotels] = useState<KbsWebHotel[]>([]);
  const [canViewAllHotels, setCanViewAllHotels] = useState(false);
  const [hotelFilter, setHotelFilter] = useState<string>('all');
  const [staffFilter, setStaffFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [range, setRange] = useState<RangeKey>('all');
  const [selected, setSelected] = useState<CaptureItem | null>(null);
  const [live, setLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [visibleCount, setVisibleCount] = useState(36);
  const [, startTransition] = useTransition();

  const defaultHotelRef = useRef<string | null>(null);
  const hotelNameByIdRef = useRef<Map<string, string>>(new Map());
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const initialLoadDone = useRef(false);

  const load = useCallback(
    async (opts?: { soft?: boolean; hotelIdOverride?: string | null }) => {
      const soft = opts?.soft === true && initialLoadDone.current;
      try {
        setError(null);
        if (soft) setRefreshing(true);
        else setLoading(true);

        let hotelId = defaultHotelRef.current;
        let viewAll = canViewAllHotels;
        if (!hotelId) {
          const ctx = await resolveOpsContext();
          if (!ctx.ok) {
            setError(ctx.message);
            setLoading(false);
            setRefreshing(false);
            return;
          }
          hotelId = ctx.hotelId;
          viewAll = ctx.canViewAllHotels;
          defaultHotelRef.current = hotelId;
          setCanViewAllHotels(viewAll);
        }

        const hotelList = await listAccessibleHotels();
        const nameMap = new Map(hotelList.map((h) => [h.id, h.short_label]));
        hotelNameByIdRef.current = nameMap;
        setHotels(hotelList);

        const activeFilter = opts?.hotelIdOverride !== undefined ? opts.hotelIdOverride : hotelFilter;
        const fetchHotelId =
          activeFilter === 'all' ? (viewAll ? null : hotelId) : activeFilter;

        const data = await fetchCaptures({
          hotelId: fetchHotelId,
          hotelNameById: nameMap,
          limit: viewAll && activeFilter === 'all' ? 400 : 300,
        });
        startTransition(() => {
          setItems(data);
          setLastUpdated(new Date());
          setVisibleCount(36);
        });
        initialLoadDone.current = true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Liste yüklenemedi');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [canViewAllHotels, hotelFilter]
  );

  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => {
      void load({ soft: true });
    }, 1100);
  }, [load]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initialLoadDone.current) return;
    void load({ soft: true, hotelIdOverride: hotelFilter });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelFilter]);

  useEffect(() => {
    if (!defaultHotelRef.current && !items.length) return;
    const unsub = subscribeCaptures(() => {
      setLive(true);
      scheduleReload();
    });
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      unsub();
    };
  }, [scheduleReload, items.length]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      startTransition(() => {
        setQuery(queryInput.trim());
        setVisibleCount(36);
      });
    }, 220);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [queryInput]);

  const familyIndex = useMemo(() => buildFamilyIndex(items), [items]);

  const staffOptions = useMemo(() => buildStaffFilterOptions(items), [items]);

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

  const filtered = useMemo(
    () =>
      items.filter((i) => {
        if (!inRange(i, range)) return false;
        if (staffFilter !== 'all' && i.scanned_by_user_id !== staffFilter) return false;
        if (!matchesQuery(i, query)) return false;
        return true;
      }),
    [items, range, query, staffFilter]
  );

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visible.length < filtered.length;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          startTransition(() => setVisibleCount((n) => Math.min(n + 24, filtered.length)));
        }
      },
      { rootMargin: '500px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, filtered.length, visible.length]);

  const handlePhoneSaved = useCallback((id: string, phone: string | null) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, guest_phone_submitted: phone } : it)));
    setSelected((cur) => (cur && cur.id === id ? { ...cur, guest_phone_submitted: phone } : cur));
  }, []);

  const openCard = useCallback((item: CaptureItem) => {
    setSelected(item);
  }, []);

  const setRangeSafe = useCallback((next: RangeKey | ((r: RangeKey) => RangeKey)) => {
    startTransition(() => {
      setRange(next);
      setVisibleCount(36);
    });
  }, []);

  const setStaffFilterSafe = useCallback((next: string) => {
    startTransition(() => {
      setStaffFilter(next);
      setVisibleCount(36);
    });
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
              <span className={`live-dot ${live ? 'on' : ''}`}>{live ? 'Canlı' : 'Bağlı'}</span>
            </span>
          </div>
        </div>
        <div className="topbar-actions">
          <input
            className="search"
            placeholder="Ad, oda, no, uyruk, personel ara…"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
          />
          <button
            type="button"
            className={`btn-ghost${refreshing ? ' is-busy' : ''}`}
            onClick={() => void load({ soft: true })}
            disabled={refreshing}
          >
            {refreshing ? 'Güncelleniyor…' : 'Yenile'}
          </button>
          <div className="user-chip" title={email}>
            {email}
          </div>
          <button type="button" className="btn-ghost" onClick={() => void signOut()}>
            Çıkış
          </button>
        </div>
      </header>

      <div className="filter-bar">
        <div className="filter-group">
          <span className="filter-label">Otel</span>
          <div className="filter-chips">
            {(canViewAllHotels || hotels.length > 1) && (
              <button
                type="button"
                className={`filter-chip${hotelFilter === 'all' ? ' active' : ''}`}
                onClick={() => setHotelFilter('all')}
              >
                Tümü
              </button>
            )}
            {hotels.map((h) => (
              <button
                key={h.id}
                type="button"
                className={`filter-chip${hotelFilter === h.id ? ' active' : ''}`}
                onClick={() => setHotelFilter(h.id)}
              >
                {h.short_label}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <span className="filter-label">Personel</span>
          <select
            className="filter-select"
            value={staffFilter}
            onChange={(e) => setStaffFilterSafe(e.target.value)}
          >
            <option value="all">Tüm personel ({items.length})</option>
            {staffOptions.map((s) => (
              <option key={s.authId} value={s.authId}>
                {s.name} ({s.count})
              </option>
            ))}
          </select>
        </div>
      </div>

      <main className={`content${refreshing ? ' is-refreshing' : ''}`}>
        {error ? (
          <div className="state-box error">
            <p>{error}</p>
            <button type="button" className="btn-primary" onClick={() => void load()}>
              Tekrar dene
            </button>
          </div>
        ) : loading ? (
          <div className="grid grid-skeleton" aria-busy aria-label="Yükleniyor">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="card card-skeleton">
                <div className="card-thumb skeleton-block" />
                <div className="card-body">
                  <div className="skeleton-line w70" />
                  <div className="skeleton-line w40" />
                  <div className="skeleton-line w55" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="stats-bar">
              <button
                type="button"
                className={`stat ${range === 'today' ? 'active' : ''}`}
                onClick={() => setRangeSafe((r) => (r === 'today' ? 'all' : 'today'))}
              >
                <span className="stat-num">{stats.today}</span>
                <span className="stat-label">Bugün</span>
              </button>
              <button
                type="button"
                className={`stat ${range === 'week' ? 'active' : ''}`}
                onClick={() => setRangeSafe((r) => (r === 'week' ? 'all' : 'week'))}
              >
                <span className="stat-num">{stats.week}</span>
                <span className="stat-label">Bu hafta</span>
              </button>
              <button
                type="button"
                className={`stat ${range === 'all' ? 'active' : ''}`}
                onClick={() => setRangeSafe('all')}
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
                {query || range !== 'all' || staffFilter !== 'all' ? 'Seçime uygun kayıt yok.' : 'Henüz çekilen kimlik yok.'}
              </div>
            ) : (
              <>
                <div className="content-meta">
                  <span>
                    {filtered.length} kayıt
                    {hotelFilter !== 'all'
                      ? ` · ${hotels.find((h) => h.id === hotelFilter)?.short_label ?? 'Otel'}`
                      : canViewAllHotels
                        ? ' · Tüm oteller'
                        : ''}
                    {staffFilter !== 'all'
                      ? ` · ${staffOptions.find((s) => s.authId === staffFilter)?.name ?? 'Personel'}`
                      : ''}
                    {range === 'today' ? ' · Bugün' : range === 'week' ? ' · Bu hafta' : ''}
                    {hasMore ? ` · ${visible.length} gösteriliyor` : ''}
                  </span>
                </div>
                <div className="grid">
                  {visible.map((item) => (
                    <CaptureCard
                      key={item.id}
                      item={item}
                      onOpen={openCard}
                      familyCount={
                        item.mrz_batch_key ? familyIndex.get(item.mrz_batch_key)?.length ?? 0 : 0
                      }
                    />
                  ))}
                </div>
                {hasMore ? <div ref={sentinelRef} className="grid-sentinel" aria-hidden /> : null}
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
