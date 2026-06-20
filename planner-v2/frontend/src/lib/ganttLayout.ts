// T3 «Гант» — чистая раскладка таймлайна (без побочек, юнит-тестируемо).
// Модель: px-таймлайн. Зум меняет плотность (пикс/день); шкала шире вьюпорта →
// горизонт-скролл (T3-flows #8). Все позиции считаются от общего [from..to].
import { addDays, parseISO, startOfWeek } from "./calDates";
import type { Stage } from "../types";

export type Zoom = "day" | "week" | "month";

// Пикселей на день по зуму: месяц = обзор, день = детально (T3-flows #6).
export const PPD: Record<Zoom, number> = { month: 2.6, week: 7, day: 24 };

const MS_DAY = 86_400_000;
const MONTH_ABBR = [
  "ЯНВ", "ФЕВ", "МАР", "АПР", "МАЙ", "ИЮН",
  "ИЮЛ", "АВГ", "СЕН", "ОКТ", "НОЯ", "ДЕК",
];

/** Целых дней между a и b (b - a), по локальной полуночи. */
export function dayDiff(a: Date, b: Date): number {
  const a0 = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const b0 = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((b0 - a0) / MS_DAY);
}

/** X-координата даты в px от начала шкалы. */
export function xPx(date: Date, from: Date, ppd: number): number {
  return dayDiff(from, date) * ppd;
}

export interface BarBox { left: number; width: number; }

/** Бокс бара этапа: [start..end] включительно, минимум 1 день. */
export function barPx(start: Date, end: Date, from: Date, ppd: number): BarBox {
  const left = xPx(start, from, ppd);
  const days = Math.max(1, dayDiff(start, end) + 1); // inclusive, min 1 день
  return { left, width: days * ppd };
}

/** Полная ширина дорожки в px (вкл. последний день). */
export function trackWidth(from: Date, to: Date, ppd: number): number {
  return (dayDiff(from, to) + 1) * ppd;
}

export interface DateRange { from: Date; to: Date; }

function monthFloor(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1); }
function monthCeil(d: Date): Date { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function daysInMonth(d: Date): number { return monthCeil(d).getDate(); }

/**
 * Окно шкалы из дат данных + «сегодня».
 * Пусто → [today-7, today+30]. month-зум выравнивает по границам месяцев,
 * week — по понедельникам, day — с небольшим запасом по краям.
 */
export function rangeOf(dates: Date[], today: Date, zoom: Zoom): DateRange {
  const all = [...dates, today];
  let from = new Date(Math.min(...all.map((d) => d.getTime())));
  let to = new Date(Math.max(...all.map((d) => d.getTime())));
  if (dates.length === 0) { from = addDays(today, -7); to = addDays(today, 30); }
  if (from.getTime() > to.getTime()) { const t = from; from = to; to = t; }

  if (zoom === "month") {
    from = monthFloor(from);
    to = monthCeil(to);
  } else if (zoom === "week") {
    from = startOfWeek(from);
    to = addDays(startOfWeek(to), 6);
  } else {
    from = addDays(from, -1);
    to = addDays(to, 1);
  }
  return { from, to };
}

export interface Col { label: string; leftPx: number; widthPx: number; }

function weekOfMonth(d: Date): number { return Math.ceil(d.getDate() / 7); }

/** Колонки шапки/сетки по зуму (месяцы / недели / дни). */
export function buildColumns(r: DateRange, zoom: Zoom): Col[] {
  const ppd = PPD[zoom];
  const cols: Col[] = [];
  if (zoom === "month") {
    let m = monthFloor(r.from);
    while (m.getTime() <= r.to.getTime()) {
      cols.push({ label: MONTH_ABBR[m.getMonth()], leftPx: xPx(m, r.from, ppd), widthPx: daysInMonth(m) * ppd });
      m = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    }
  } else if (zoom === "week") {
    let w = startOfWeek(r.from);
    while (w.getTime() <= r.to.getTime()) {
      cols.push({ label: `${MONTH_ABBR[w.getMonth()]} W${weekOfMonth(w)}`, leftPx: xPx(w, r.from, ppd), widthPx: 7 * ppd });
      w = addDays(w, 7);
    }
  } else {
    let d = new Date(r.from);
    while (d.getTime() <= r.to.getTime()) {
      cols.push({ label: String(d.getDate()), leftPx: xPx(d, r.from, ppd), widthPx: ppd });
      d = addDays(d, 1);
    }
  }
  return cols;
}

export type BarKind = "done" | "cur" | "fut" | "late";

export function barStatusClass(status: string | null | undefined): BarKind {
  switch (status) {
    case "done": return "done";
    case "current": return "cur";
    case "late": return "late";
    default: return "fut";
  }
}

function stageDurationDays(s: Stage): number {
  if (!s.start_date || !s.end_date) return 0;
  return Math.max(1, dayDiff(parseISO(s.start_date), parseISO(s.end_date)) + 1);
}

/**
 * Критический путь = самая длинная по сумме длительностей цепочка зависимостей.
 * StageDependency: depends_on_ids = предшественники. Возвращает id всех этапов цепочки.
 */
export function criticalPathIds(stages: Stage[]): Set<number> {
  const byId = new Map(stages.map((s) => [s.id, s]));
  const best = new Map<number, number>();   // id → макс. кумулятивная длительность до него вкл.
  const prev = new Map<number, number | null>();

  const visiting = new Set<number>();
  function longest(id: number): number {
    if (best.has(id)) return best.get(id)!;
    if (visiting.has(id)) return 0; // защита от цикла
    visiting.add(id);
    const s = byId.get(id);
    const dur = s ? stageDurationDays(s) : 0;
    let bestDep = 0;
    let bestPrev: number | null = null;
    for (const dep of s?.depends_on_ids ?? []) {
      if (!byId.has(dep)) continue;
      const v = longest(dep);
      if (v > bestDep) { bestDep = v; bestPrev = dep; }
    }
    visiting.delete(id);
    best.set(id, dur + bestDep);
    prev.set(id, bestPrev);
    return dur + bestDep;
  }

  let endId: number | null = null;
  let endVal = -1;
  for (const s of stages) {
    const v = longest(s.id);
    if (v > endVal) { endVal = v; endId = s.id; }
  }

  const path = new Set<number>();
  let cur = endId;
  while (cur != null) {
    path.add(cur);
    cur = prev.get(cur) ?? null;
  }
  // цепочка из одного этапа без зависимостей = не критпуть (нечего подсвечивать)
  if (path.size < 2) path.clear();
  return path;
}

/**
 * Конфликт зависимости: этап стартует РАНЬШЕ, чем закрывается его предшественник.
 * Та же эвристика-флаг, что красит late (T3-flows #5, не live-LLM).
 */
export function hasConflict(stage: Stage, byId: Map<number, Stage>): boolean {
  if (!stage.start_date) return false;
  const start = parseISO(stage.start_date);
  for (const dep of stage.depends_on_ids ?? []) {
    const d = byId.get(dep);
    if (d?.end_date && start.getTime() < parseISO(d.end_date).getTime()) return true;
  }
  return false;
}
