// Форк B — чистые даты для календаря (без побочек, тестируемо). Неделя с понедельника.

export function localISO(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** ISO "YYYY-MM-DD" → Date в локальную полночь (без сдвига часового пояса). */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isWeekend(d: Date): boolean {
  const w = d.getDay();
  return w === 0 || w === 6;
}

/** Понедельник недели, содержащей d (00:00). */
export function startOfWeek(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (r.getDay() + 6) % 7; // Пн=0 .. Вс=6
  r.setDate(r.getDate() - dow);
  return r;
}

/** 7 дней недели (Пн..Вс), содержащей d. */
export function weekDays(d: Date): Date[] {
  const s = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

/**
 * Список дней для вида «Дни» (T2d). count 2/3/4 = окно [anchor .. anchor+count-1].
 * count 7 = календарная неделя Пн–Вс, содержащая anchor (как старая «Неделя»).
 */
export function daysList(anchor: Date, count: number): Date[] {
  if (count >= 7) return weekDays(anchor);
  const base = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  return Array.from({ length: count }, (_, i) => addDays(base, i));
}

/**
 * Сетка месяца 6×7 = 42 ячейки, начиная с понедельника недели, в которой 1-е число.
 * Дни соседних месяцев попадают в начало/хвост (out-ячейки).
 */
export function monthMatrix(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];
const MONTHS_NOM = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];
const DOW_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function dowShort(d: Date): string {
  return DOW_SHORT[(d.getDay() + 6) % 7];
}

/** "9–15 июня" / "29 июня – 5 июля" (диапазон недели). */
export function fmtWeekRange(days: Date[]): string {
  const a = days[0];
  const b = days[days.length - 1];
  if (a.getMonth() === b.getMonth()) {
    return `${a.getDate()}–${b.getDate()} ${MONTHS_GEN[a.getMonth()]}`;
  }
  return `${a.getDate()} ${MONTHS_GEN[a.getMonth()]} – ${b.getDate()} ${MONTHS_GEN[b.getMonth()]}`;
}

/** "Июнь 2026". */
export function fmtMonthYear(d: Date): string {
  return `${MONTHS_NOM[d.getMonth()]} ${d.getFullYear()}`;
}

/** Заголовок дня ленты: «Сегодня» / «Завтра» / «Чт 11 июня». */
export function fmtAgendaDay(d: Date, today: Date): { label: string; meta: string | null } {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - t0.getTime()) / 86400000);
  const full = `${dowShort(d)} ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  if (diff === 0) return { label: "Сегодня", meta: `· ${full}` };
  if (diff === 1) return { label: "Завтра", meta: `· ${full}` };
  return { label: full, meta: null };
}
