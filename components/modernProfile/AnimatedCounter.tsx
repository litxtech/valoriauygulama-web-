import { useEffect, useRef, useState } from 'react';
import { Text, type TextStyle } from 'react-native';

type Props = {
  value: number;
  durationMs?: number;
  style?: TextStyle;
  formatter?: (n: number) => string;
};

export function AnimatedCounter({ value, durationMs = 900, style, formatter }: Props) {
  const [display, setDisplay] = useState(0);
  const raf = useRef<number | null>(null);
  const start = useRef(0);
  const from = useRef(0);

  useEffect(() => {
    from.current = display;
    start.current = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - start.current) / durationMs);
      const eased = 1 - (1 - p) ** 3;
      const next = Math.round(from.current + (value - from.current) * eased);
      setDisplay(next);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [value, durationMs]);

  const text = formatter ? formatter(display) : String(display);
  return <Text style={style}>{text}</Text>;
}
