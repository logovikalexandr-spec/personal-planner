import type { Priority } from "../types";

export const HOUR_H = 96;   // высота часа в таймлайне. 96 (было 56): 15-мин слот = 24px ≥ min-height 22px →
                            // короткие задачи читаемы, без наложения «каши» (07:00 Подъём/Душ/Медитация/Валик).
                            // Все px-расчёты и now-линия/скролл производны от HOUR_H → масштабируются автоматически.
export const STEP_MIN = 15;
export const PX_PER_MIN = HOUR_H / 60;
export const DAY_END = 24 * 60;
export const MIN_BLOCK_PX = 22;   // мин. высота блока (короткий блок не схлопывается ниже читаемой строки)
/** Мин. высота в минутах: короткий блок ВИЗУАЛЬНО занимает столько, даже если реально короче.
 *  Раскладка по колонкам использует это → близкие короткие задачи разводятся бок-о-бок (Apple-стиль). */
export const MIN_BLOCK_MIN = Math.ceil(MIN_BLOCK_PX / PX_PER_MIN);

export function snap15(min: number): number { return Math.round(min / STEP_MIN) * STEP_MIN; }
export function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
export function parseMin(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}
function pad(n: number): string { return `${n}`.padStart(2, "0"); }
export function hhmm(min: number): string { return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`; }
export function hhmmss(min: number): string { return `${hhmm(min)}:00`; }

/** Y в координатах вьюпорта → минуты дня (учитывает скролл контейнера). */
export function pointerToMinutes(clientY: number, gridTop: number, scrollTop: number, offsetMin: number, pxPerMin = PX_PER_MIN): number {
  const yInGrid = clientY - gridTop + scrollTop;
  return offsetMin + yInGrid / pxPerMin;
}

/** Тап → блок 1ч на снапнутом часе. */
export function defaultRange(tapMin: number, snap: (m: number) => number = snap15): { startMin: number; endMin: number } {
  const s = snap(tapMin);
  return { startMin: s, endMin: s + 60 };
}

/** Протяжка → нормализованный диапазон (swap при движении вверх, <15мин→1ч). */
export function normalizeRange(a: number, b: number, snap: (m: number) => number = snap15): { startMin: number; endMin: number } {
  const start = snap(Math.min(a, b));
  let end = snap(Math.max(a, b));
  if (end - start < STEP_MIN) end = start + 60;
  return { startMin: start, endMin: end };
}

export interface CreatePayload { due_date: string; due_time: string; end_time: string; project_id: null; priority: Priority; }
export function createPayload(startMin: number, endMin: number, todayIso: string): CreatePayload {
  return { due_date: todayIso, due_time: hhmmss(startMin), end_time: hhmmss(endMin), project_id: null, priority: "none" };
}

/** Раскладка пересекающихся блоков по колонкам (greedy lane assignment, Apple-стиль). */
export function layoutColumns(
  blocks: { id: number; startMin: number; endMin: number }[],
): Map<number, { colIndex: number; colCount: number }> {
  const res = new Map<number, { colIndex: number; colCount: number }>();
  // визуальный конец блока: реальный конец ИЛИ старт+мин-высота (короткий блок занимает min-height-полосу).
  // близкие короткие задачи по нему «пересекаются» → разводятся по колонкам, даже если по времени встык.
  const visEnd = (b: { startMin: number; endMin: number }) => Math.max(b.endMin, b.startMin + MIN_BLOCK_MIN);
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  let cluster: typeof sorted = [];
  let clusterEnd = -1;
  const flush = (group: typeof sorted) => {
    const colEnds: number[] = []; // индекс колонки → визуальный конец последнего блока в ней
    const colOf = new Map<number, number>();
    for (const b of group) {
      let placed = -1;
      for (let c = 0; c < colEnds.length; c++) {
        if (colEnds[c] <= b.startMin) { colEnds[c] = visEnd(b); placed = c; break; }
      }
      if (placed === -1) { colEnds.push(visEnd(b)); placed = colEnds.length - 1; }
      colOf.set(b.id, placed);
    }
    const colCount = colEnds.length;
    for (const b of group) res.set(b.id, { colIndex: colOf.get(b.id)!, colCount });
  };
  for (const b of sorted) {
    if (cluster.length && b.startMin >= clusterEnd) { flush(cluster); cluster = []; clusterEnd = -1; }
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, visEnd(b));
  }
  if (cluster.length) flush(cluster);
  return res;
}
