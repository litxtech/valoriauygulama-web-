import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { elapsedSecondsSince, formatElapsedClock } from '@/lib/attendancePresentation';

type Props = {
  startedAt: string;
  active?: boolean;
  style?: object;
  textStyle?: object;
};

export const LiveShiftDuration = memo(function LiveShiftDuration({
  startedAt,
  active = true,
  style,
  textStyle,
}: Props) {
  const [seconds, setSeconds] = useState(() => elapsedSecondsSince(startedAt));

  useEffect(() => {
    if (!active) {
      setSeconds(elapsedSecondsSince(startedAt));
      return;
    }
    const tick = () => setSeconds(elapsedSecondsSince(startedAt));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [active, startedAt]);

  return (
    <Text style={[styles.text, style, textStyle]}>{formatElapsedClock(seconds)}</Text>
  );
});

const styles = StyleSheet.create({
  text: {
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
});
