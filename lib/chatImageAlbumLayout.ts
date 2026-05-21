import { CHAT_MEDIA_CARD_GAP } from '@/constants/chatMediaCardMetrics';

export type AlbumLayoutCell = {
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

export type AlbumLayout = {
  width: number;
  height: number;
  cells: AlbumLayoutCell[];
  overflowCount: number;
};

/** WhatsApp benzeri 1–10 resim ızgarası */
export function layoutChatImageAlbum(count: number, totalWidth: number): AlbumLayout {
  const gap = CHAT_MEDIA_CARD_GAP;
  const n = Math.min(Math.max(count, 1), 10);
  const cells: AlbumLayoutCell[] = [];
  let overflowCount = 0;

  if (n === 1) {
    const h = totalWidth * 0.78;
    cells.push({ index: 0, left: 0, top: 0, width: totalWidth, height: h });
    return { width: totalWidth, height: h, cells, overflowCount: 0 };
  }

  if (n === 2) {
    const cw = (totalWidth - gap) / 2;
    const h = cw * 1.12;
    cells.push({ index: 0, left: 0, top: 0, width: cw, height: h });
    cells.push({ index: 1, left: cw + gap, top: 0, width: cw, height: h });
    return { width: totalWidth, height: h, cells, overflowCount: 0 };
  }

  if (n === 3) {
    const leftW = Math.round((totalWidth - gap) * 0.58);
    const rightW = totalWidth - leftW - gap;
    const h = leftW * 0.92;
    const rh = (h - gap) / 2;
    cells.push({ index: 0, left: 0, top: 0, width: leftW, height: h });
    cells.push({ index: 1, left: leftW + gap, top: 0, width: rightW, height: rh });
    cells.push({ index: 2, left: leftW + gap, top: rh + gap, width: rightW, height: rh });
    return { width: totalWidth, height: h, cells, overflowCount: 0 };
  }

  if (n === 4) {
    const cw = (totalWidth - gap) / 2;
    const ch = cw;
    const h = ch * 2 + gap;
    for (let i = 0; i < 4; i++) {
      const row = Math.floor(i / 2);
      const col = i % 2;
      cells.push({
        index: i,
        left: col * (cw + gap),
        top: row * (ch + gap),
        width: cw,
        height: ch,
      });
    }
    return { width: totalWidth, height: h, cells, overflowCount: 0 };
  }

  if (n === 5) {
    const topH = ((totalWidth - gap) / 2) * 0.95;
    const botH = ((totalWidth - gap * 2) / 3) * 0.95;
    const h = topH + gap + botH;
    const topW = (totalWidth - gap) / 2;
    const botW = (totalWidth - gap * 2) / 3;
    for (let i = 0; i < 2; i++) {
      cells.push({ index: i, left: i * (topW + gap), top: 0, width: topW, height: topH });
    }
    for (let i = 0; i < 3; i++) {
      cells.push({
        index: i + 2,
        left: i * (botW + gap),
        top: topH + gap,
        width: botW,
        height: botH,
      });
    }
    return { width: totalWidth, height: h, cells, overflowCount: 0 };
  }

  const cols = n <= 6 ? 3 : 3;
  const maxVisible = n > 6 ? 6 : n;
  overflowCount = n > maxVisible ? n - maxVisible : 0;
  const rows = Math.ceil(maxVisible / cols);
  const cw = (totalWidth - gap * (cols - 1)) / cols;
  const ch = cw;
  const h = rows * ch + gap * (rows - 1);

  for (let i = 0; i < maxVisible; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    cells.push({
      index: i,
      left: col * (cw + gap),
      top: row * (ch + gap),
      width: cw,
      height: ch,
    });
  }

  return { width: totalWidth, height: h, cells, overflowCount };
}
