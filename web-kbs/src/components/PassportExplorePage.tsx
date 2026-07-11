import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  buildFamilyIndex,
  buildNationalityFilterOptions,
  captureDate,
  fetchPassportHotelBreakdown,
  fetchPassports,
  fetchCaptureStats,
  listAccessibleHotels,
  nationalityCodeOf,
  resolveOpsContext,
  subscribeCaptures,
  type CaptureItem,
  type CaptureStats,
  type KbsWebHotel,
  type PassportHotelBreakdown,
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
    item.hotel_name ?? '',
    item.document_number ?? '',
    nationalityCodeOf(item),
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

export function PassportExplorePage() {
  const { session, signOut } = useAuth();
  const [items, setItems] = useState<CaptureItem[]>([]);
  const [hotels, setHotels] = useState<KbsWebHotel[]>([]);
  const [canViewAllHotels, setCanViewAllHotels] = useState(false);
  const [hotelFilter, setHotelFilter] = useState<string>('all');
  const [nationalityFilter, setNationalityFilter] = useState<string>('all');
  const [hotelBreakdown, setHotelBreakdown] = useState<PassportHotelBreakdown[]>([]);
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
  const [freshnessTick, setFreshnessTick] = useState(0);
  const [stats, setStats] = useState<CaptureStats>({ total: 0, today: 0, week: 0 });
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

        const [data, exactStats, breakdown] = await Promise.all([
          fetchPassports({
            hotelId: fetchHotelId,
            hotelNameById: nameMap,
            limit: viewAll && activeFilter === 'all' ? 400 : 300,
          }),
          fetchCaptureStats({
            hotelId: fetchHotelId,
            documentType: 'passport',
          }),
          viewAll && activeFilter === 'all'
            ? fetchPassportHotelBreakdown(hotelList)
            : Promise.resolve([] as PassportHotelBreakdown[]),
        ]);

        startTransition(() => {
          setItems(data);
          setStats(exactStats);
          setHotelBreakdown(breakdown);
          setLastUpdated(new Date());
          setVisibleCount(36);
          setNationalityFilter('all');
        });
        initialLoadDone.current = true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Pasaport listesi yüklenemedi');
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
    const id = window.setInterval(() => setFreshnessTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
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
  const nationalityOptions = useMemo(() => buildNationalityFilterOptions(items), [items]);

  const filtered = useMemo(
    () =>
      items.filter((i) => {
        if (!inRange(i, range)) return false;
        if (nationalityFilter !== 'all' && nationalityCodeOf(i) !== nationalityFilter) return false;
        if (!matchesQuery(i, query)) return false;
        return true;
      }),
    [items, range, query, nationalityFilter]
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

  const handleReadRequested = useCallback((updated: CaptureItem) => {
    setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
    setSelected((cur) => (cur && cur.id === updated.id ? updated : cur));
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

  const setNationalityFilterSafe = useCallback((next: string) => {
    startTransition(() => {
      setNationalityFilter(next);
      setVisibleCount(36);
    });
  }, []);

  const selectHotelFromBreakdown = useCallback((hotelId: string) => {
    setHotelFilter(hotelId);
  }, []);

  const email = session?.user?.email ?? '';
  const showHotelOverview = hotelFilter === 'all' && canViewAllHotels && hotelBreakdown.length > 0;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="login-logo sm">V</span>
          <div>
            <strong>Pasaport Keşfeti</strong>
            <span className="brand-sub">
              <span className={`live-dot ${live ? 'on' : ''}`}>{live ? 'Canlı' : 'Bağlı'}</span>
            </span>
          </div>
        </div>
        <div className="topbar-actions">
          <input
            className="search"
            placeholder="Ad, pasaport no, uyruk, otel ara…"
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
          <span className="filter-label">İşletme</span>
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
        {nationalityOptions.length > 1 ? (
          <div className="filter-group">
            <span className="filter-label">Uyruk</span>
            <div className="filter-chips">
              <button
                type="button"
                className={`filter-chip${nationalityFilter === 'all' ? ' active' : ''}`}
                onClick={() => setNationalityFilterSafe('all')}
              >
                Tümü ({items.length})
              </button>
              {nationalityOptions.slice(0, 12).map((n) => (
                <button
                  key={n.code}
                  type="button"
                  className={`filter-chip${nationalityFilter === n.code ? ' active' : ''}`}
                  onClick={() => setNationalityFilterSafe(n.code)}
                >
                  {n.label} ({n.count})
                </button>
              ))}
            </div>
          </div>
        ) : null}
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
                <span className="stat-label">Toplam pasaport</span>
              </button>
              {lastUpdated ? (
                <span className="stats-updated">
                  Son güncelleme {lastUpdated.toLocaleTimeString('tr-TR')}
                </span>
              ) : null}
            </div>

            {showHotelOverview ? (
              <section className="passport-hotel-overview" aria-label="Otel bazlı pasaport özeti">
                <div className="passport-overview-head">
                  <h2>Hangi otelde kaç pasaport bildirildi</h2>
                  <p>İşletmeye tıklayarak yalnızca o otelin pasaportlarını görüntüleyin.</p>
                </div>
                <div className="passport-hotel-grid">
                  {hotelBreakdown.map((row) => (
                    <button
                      key={row.hotelId}
                      type="button"
                      className="passport-hotel-card"
                      onClick={() => selectHotelFromBreakdown(row.hotelId)}
                    >
                      <span className="passport-hotel-name">{row.hotelName}</span>
                      <span className="passport-hotel-count">{row.count}</span>
                      <span className="passport-hotel-label">pasaport</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {filtered.length === 0 ? (
              <div className="state-box">
                {query || range !== 'all' || nationalityFilter !== 'all'
                  ? 'Seçime uygun pasaport yok.'
                  : hotelFilter !== 'all'
                    ? 'Bu işletmede henüz bildirilen pasaport yok.'
                    : 'Henüz bildirilen pasaport yok.'}
              </div>
            ) : (
              <>
                <div className="content-meta">
                  <span>
                    {filtered.length} pasaport
                    {hotelFilter !== 'all'
                      ? ` · ${hotels.find((h) => h.id === hotelFilter)?.short_label ?? 'İşletme'}`
                      : canViewAllHotels
                        ? ' · Tüm işletmeler'
                        : ''}
                    {nationalityFilter !== 'all'
                      ? ` · ${nationalityOptions.find((n) => n.code === nationalityFilter)?.label ?? 'Uyruk'}`
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
                      freshnessTick={freshnessTick}
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
          onReadRequested={handleReadRequested}
        />
      ) : null}
    </div>
  );
}
