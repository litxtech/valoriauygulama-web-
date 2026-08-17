import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CachedImage } from '@/components/CachedImage';
import type { PttStaffPreview } from '@/lib/ptt/rooms';

type Props = {
  people: PttStaffPreview[];
  size?: number;
  max?: number;
  borderColor: string;
  overlap?: number;
};

function initials(name: string | null | undefined): string {
  const s = (name || '').trim();
  if (!s) return '?';
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

export const PttAvatarStack = memo(function PttAvatarStack({
  people,
  size = 24,
  max = 4,
  borderColor,
  overlap = 8,
}: Props) {
  const shown = people.slice(0, max);
  const extra = Math.max(0, people.length - shown.length);
  if (shown.length === 0) return null;

  return (
    <View style={styles.row}>
      {shown.map((p, i) => (
        <View
          key={p.id}
          style={[
            styles.av,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              marginLeft: i === 0 ? 0 : -overlap,
              zIndex: shown.length - i,
              borderColor,
            },
          ]}
        >
          {p.profile_image ? (
            <CachedImage uri={p.profile_image} style={styles.img} contentFit="cover" />
          ) : (
            <View style={styles.fallback}>
              <Text style={[styles.initials, { fontSize: Math.max(8, size * 0.36) }]}>{initials(p.full_name)}</Text>
            </View>
          )}
        </View>
      ))}
      {extra > 0 ? (
        <View
          style={[
            styles.av,
            styles.more,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              marginLeft: -overlap,
              borderColor,
            },
          ]}
        >
          <Text style={[styles.moreText, { fontSize: Math.max(8, size * 0.34) }]}>+{extra}</Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  av: {
    overflow: 'hidden',
    borderWidth: 2,
    backgroundColor: '#0f766e',
  },
  img: { width: '100%', height: '100%' },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,118,110,0.2)',
  },
  initials: { fontWeight: '800', color: '#0f766e' },
  more: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#134e4a',
  },
  moreText: { fontWeight: '800', color: '#fff' },
});
