import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';

type Props = {
  src: string;
  alt: string;
  onClose: () => void;
};

const MIN = 1;
const MAX = 8;
const STEP = 0.35;

type Point = { x: number; y: number };

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Pinch / wheel / buton yakınlaştırma + pan.
 * Transform GPU üzerinde; yeniden decode yok.
 */
export function ZoomLightbox({ src, alt, onClose }: Props) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const offsetRef = useRef<Point>({ x: 0, y: 0 });
  const dragRef = useRef<{ active: boolean; last: Point; pointerId: number | null }>({
    active: false,
    last: { x: 0, y: 0 },
    pointerId: null,
  });
  const pinchRef = useRef<{
    active: boolean;
    startDist: number;
    startScale: number;
  } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  const apply = useCallback((nextScale: number, nextOffset: Point) => {
    const s = clamp(nextScale, MIN, MAX);
    const off = s <= MIN ? { x: 0, y: 0 } : nextOffset;
    scaleRef.current = s;
    offsetRef.current = off;
    setScale(s);
    setOffset(off);
  }, []);

  const zoomBy = useCallback(
    (delta: number, origin?: Point) => {
      const prev = scaleRef.current;
      const next = clamp(prev + delta, MIN, MAX);
      if (next === prev) return;
      if (next <= MIN) {
        apply(MIN, { x: 0, y: 0 });
        return;
      }
      const ratio = next / prev;
      const ox = offsetRef.current.x;
      const oy = offsetRef.current.y;
      if (origin && stageRef.current) {
        const rect = stageRef.current.getBoundingClientRect();
        const cx = origin.x - rect.left - rect.width / 2;
        const cy = origin.y - rect.top - rect.height / 2;
        apply(next, {
          x: cx - (cx - ox) * ratio,
          y: cy - (cy - oy) * ratio,
        });
      } else {
        apply(next, { x: ox * ratio, y: oy * ratio });
      }
    },
    [apply]
  );

  const reset = useCallback(() => apply(1, { x: 0, y: 0 }), [apply]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        zoomBy(STEP);
      } else if (e.key === '-') {
        zoomBy(-STEP);
      } else if (e.key === '0') {
        reset();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, zoomBy, reset]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -STEP * 0.6 : STEP * 0.6;
      zoomBy(delta, { x: e.clientX, y: e.clientY });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  const touchDist = (a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }) => {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.hypot(dx, dy);
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (scaleRef.current <= 1) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { active: true, last: { x: e.clientX, y: e.clientY }, pointerId: e.pointerId };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragRef.current.active || dragRef.current.pointerId !== e.pointerId) return;
    const dx = e.clientX - dragRef.current.last.x;
    const dy = e.clientY - dragRef.current.last.y;
    dragRef.current.last = { x: e.clientX, y: e.clientY };
    apply(scaleRef.current, {
      x: offsetRef.current.x + dx,
      y: offsetRef.current.y + dy,
    });
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (dragRef.current.pointerId === e.pointerId) {
      dragRef.current.active = false;
      dragRef.current.pointerId = null;
    }
  };

  const onTouchStart = (e: ReactTouchEvent) => {
    if (e.touches.length === 2) {
      pinchRef.current = {
        active: true,
        startDist: touchDist(e.touches[0]!, e.touches[1]!),
        startScale: scaleRef.current,
      };
      dragRef.current.active = false;
    } else if (e.touches.length === 1 && scaleRef.current > 1) {
      dragRef.current = {
        active: true,
        last: { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY },
        pointerId: null,
      };
    }
  };

  const onTouchMove = (e: ReactTouchEvent) => {
    if (pinchRef.current?.active && e.touches.length === 2) {
      e.preventDefault();
      const dist = touchDist(e.touches[0]!, e.touches[1]!);
      const next = pinchRef.current.startScale * (dist / pinchRef.current.startDist);
      const mid = {
        x: (e.touches[0]!.clientX + e.touches[1]!.clientX) / 2,
        y: (e.touches[0]!.clientY + e.touches[1]!.clientY) / 2,
      };
      const prev = scaleRef.current;
      const s = clamp(next, MIN, MAX);
      if (s === prev) return;
      if (s <= MIN) {
        apply(MIN, { x: 0, y: 0 });
        return;
      }
      const ratio = s / prev;
      if (stageRef.current) {
        const rect = stageRef.current.getBoundingClientRect();
        const cx = mid.x - rect.left - rect.width / 2;
        const cy = mid.y - rect.top - rect.height / 2;
        apply(s, {
          x: cx - (cx - offsetRef.current.x) * ratio,
          y: cy - (cy - offsetRef.current.y) * ratio,
        });
      } else {
        apply(s, offsetRef.current);
      }
      return;
    }
    if (dragRef.current.active && e.touches.length === 1) {
      const t = e.touches[0]!;
      const dx = t.clientX - dragRef.current.last.x;
      const dy = t.clientY - dragRef.current.last.y;
      dragRef.current.last = { x: t.clientX, y: t.clientY };
      apply(scaleRef.current, {
        x: offsetRef.current.x + dx,
        y: offsetRef.current.y + dy,
      });
    }
  };

  const onTouchEnd = () => {
    if (pinchRef.current?.active) pinchRef.current = null;
    dragRef.current.active = false;
  };

  const onDoubleClick = (e: ReactMouseEvent) => {
    e.stopPropagation();
    if (scaleRef.current > 1.2) reset();
    else zoomBy(2.2, { x: e.clientX, y: e.clientY });
  };

  const pct = Math.round(scale * 100);

  return (
    <div
      className="zoom-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Görsel yakınlaştırma"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="zoom-toolbar" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="zoom-tool-btn" onClick={() => zoomBy(-STEP)} aria-label="Uzaklaştır">
          −
        </button>
        <button type="button" className="zoom-tool-btn zoom-pct" onClick={reset} title="Sıfırla">
          {pct}%
        </button>
        <button type="button" className="zoom-tool-btn" onClick={() => zoomBy(STEP)} aria-label="Yakınlaştır">
          +
        </button>
        <button type="button" className="zoom-tool-btn zoom-close" onClick={onClose} aria-label="Kapat">
          ×
        </button>
      </div>

      <div
        ref={stageRef}
        className={`zoom-stage${scale > 1 ? ' zoom-panning' : ''}${loaded ? ' ready' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onDoubleClick={onDoubleClick}
        onClick={(e) => e.stopPropagation()}
      >
        {!loaded ? <div className="zoom-skeleton" aria-hidden /> : null}
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={false}
          decoding="async"
          className="zoom-img"
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
            opacity: loaded ? 1 : 0,
          }}
          onLoad={() => setLoaded(true)}
        />
      </div>

      <p className="zoom-hint">Kaydır · pinch · çift tık · +/−</p>
    </div>
  );
}
