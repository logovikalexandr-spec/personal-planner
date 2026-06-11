// Форк B — геометрия блока в колонке недели (чисто, тестируемо).

export const WEEK_START_HOUR = 8;   // окно недели 08:00–21:00
export const WEEK_END_HOUR = 21;
export const WEEK_PX_PER_HOUR = 34; // высота сетки = (21-8)*34 = 442px
export const WEEK_GRID_H = (WEEK_END_HOUR - WEEK_START_HOUR) * WEEK_PX_PER_HOUR;
const MIN_BLOCK_H = 16;

function parseMin(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}

/** {top,height} блока внутри сетки окна, или null если у задачи нет времени. Клампится в окно. */
export function blockGeom(
  due_time: string | null | undefined,
  end_time: string | null | undefined,
): { top: number; height: number } | null {
  const startMin = parseMin(due_time);
  if (startMin == null) return null;
  const winStart = WEEK_START_HOUR * 60;
  const winEnd = WEEK_END_HOUR * 60;
  const pxPerMin = WEEK_PX_PER_HOUR / 60;
  let endMin = parseMin(end_time);
  if (endMin == null || endMin <= startMin) endMin = startMin + 45; // дефолт-длительность
  const s = Math.max(startMin, winStart);
  const e = Math.min(endMin, winEnd);
  const top = (s - winStart) * pxPerMin;
  const height = Math.max((e - s) * pxPerMin, MIN_BLOCK_H);
  return { top, height: Math.min(height, WEEK_GRID_H - top) };
}

/** Y относительно верха сетки → "HH:MM:00", снап к 15 мин, кламп в окно. */
export function yToTime(yInGrid: number): string {
  const pxPerMin = WEEK_PX_PER_HOUR / 60;
  const winStart = WEEK_START_HOUR * 60;
  const winEnd = WEEK_END_HOUR * 60;
  let min = winStart + yInGrid / pxPerMin;
  min = Math.round(min / 15) * 15;
  min = Math.max(winStart, Math.min(winEnd - 15, min));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${`${h}`.padStart(2, "0")}:${`${m}`.padStart(2, "0")}:00`;
}

/** Метки часов окна (для подписей сетки), шаг 2ч. */
export function hourLabels(): { hour: number; top: number }[] {
  const out: { hour: number; top: number }[] = [];
  for (let h = WEEK_START_HOUR; h < WEEK_END_HOUR; h += 2) {
    out.push({ hour: h, top: (h - WEEK_START_HOUR) * WEEK_PX_PER_HOUR });
  }
  return out;
}
