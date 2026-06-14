import { parseISO } from "./calDates";

export interface SpanParts {
  due_date: string | null;
  due_time: string | null;
  end_date: string | null;
  end_time: string | null;
}

function pluralDays(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} день`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return `${n} дня`;
  return `${n} дней`;
}

/** Производная метка длительности. Дни — для многодневного спана, иначе часы/минуты. null если считать нечего. */
export function durationLabel(p: SpanParts): string | null {
  if (p.end_date && p.due_date && p.end_date !== p.due_date) {
    const days = Math.round((parseISO(p.end_date).getTime() - parseISO(p.due_date).getTime()) / 86400000) + 1;
    return days >= 2 ? pluralDays(days) : null;
  }
  if (!p.due_time || !p.end_time) return null;
  const [sh, sm] = p.due_time.split(":").map(Number);
  const [eh, em] = p.end_time.split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h} ч ${m} мин`;
  if (h) return `${h} ч`;
  return `${m} мин`;
}

/** Выбор дня в календаре (TickTick: 1й тап=начало, 2й позже=дедлайн, иначе перезапуск). */
export function pickCalendarDay(
  state: { due_date: string | null; end_date: string | null },
  iso: string,
): { due_date: string; end_date: string | null } {
  // нет начала, либо спан уже задан → начинаем заново
  if (!state.due_date || state.end_date) return { due_date: iso, end_date: null };
  // тап позже текущего начала → дедлайн
  if (iso > state.due_date) return { due_date: state.due_date, end_date: iso };
  // тап раньше/равен → новое начало, дедлайн снят
  return { due_date: iso, end_date: null };
}
