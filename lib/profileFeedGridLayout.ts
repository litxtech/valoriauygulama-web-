const NUM_COLUMNS = 3;

export type ProfileFeedGridMetrics = {
  width: number;
  cell: number;
  lastColExtra: number;
  gap: number;
};

/** Tam ekran genişliğinde 3 sütun — sağ/sol boşluk kalmaz. */
export function computeProfileFeedGridMetrics(
  width: number,
  gap = 1,
  numColumns = NUM_COLUMNS
): ProfileFeedGridMetrics {
  const w = Math.round(width);
  const cell = Math.floor((w - gap * (numColumns - 1)) / numColumns);
  const rowWidth = cell * numColumns + gap * (numColumns - 1);
  const lastColExtra = Math.max(0, w - rowWidth);
  return { width: w, cell, lastColExtra, gap };
}

export function profileFeedCellSize(index: number, metrics: ProfileFeedGridMetrics): {
  width: number;
  height: number;
  marginRight: number;
  marginBottom: number;
} {
  const col = index % NUM_COLUMNS;
  const rowEnd = col === NUM_COLUMNS - 1;
  const width = rowEnd ? metrics.cell + metrics.lastColExtra : metrics.cell;
  return {
    width,
    height: metrics.cell,
    marginRight: rowEnd ? 0 : metrics.gap,
    marginBottom: metrics.gap,
  };
}
