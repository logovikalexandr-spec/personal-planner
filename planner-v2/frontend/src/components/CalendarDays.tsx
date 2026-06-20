import { useMemo } from "react";
import { DayTimeline } from "./DayTimeline";
import { dowShort, localISO, sameDay } from "../lib/calDates";
import { resolveColor } from "../lib/projectColor";
import type { Milestone, Project, Task } from "../types";

function parseMin(t: string | null | undefined): number {
  if (!t) return 0;
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}

const BASE_START_HOUR = 8; // как «Неделя»: сетка с 08:00 (растягиваем раньше, если есть ранняя задача)

/**
 * Вид «Дни» (T2d) — N колонок (2/3/4/7). Кросс-колоночная обвязка:
 * заголовки (имя+число+веха-флажок, тап → onOpenDay), полоса «весь день»,
 * тело каждой колонки = DayTimeline(compact) → drag внутри дня бесплатно.
 * Общий startHour для всех колонок (иначе разный earliest рассинхронит высоты).
 */
export function CalendarDays({
  days, tasks, milestones, byId, today, onOpenTask, onOpenDay, onToggle, onResize,
}: {
  days: Date[];
  tasks: Task[];
  milestones: Milestone[];
  byId: Map<number, Project>;
  today: Date;
  /** Тап таймблока → открыть деталь. */
  onOpenTask: (t: Task) => void;
  /** Тап числа/пустой колонки → перейти на таб «Задачи» с этой датой. */
  onOpenDay: (d: Date) => void;
  onToggle: (t: Task) => void;
  /** Коммит drag (перенос/ресайз) блока. */
  onResize: (t: Task, patch: { due_time: string; end_time: string }) => void;
}) {
  // задачи по дню: timed (в сетку) и all-day (в полосу сверху)
  const timedByDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      if (t.due_date && t.due_time) (m.get(t.due_date) ?? m.set(t.due_date, []).get(t.due_date)!).push(t);
    }
    return m;
  }, [tasks]);

  const allDayByDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      if (t.due_date && !t.due_time) (m.get(t.due_date) ?? m.set(t.due_date, []).get(t.due_date)!).push(t);
    }
    return m;
  }, [tasks]);

  const flagsByDay = useMemo(() => {
    const m = new Map<string, Milestone[]>();
    for (const ms of milestones) (m.get(ms.milestone_date) ?? m.set(ms.milestone_date, []).get(ms.milestone_date)!).push(ms);
    return m;
  }, [milestones]);

  // общий старт сетки: 08:00, но раньше — если есть ранняя timed-задача в любой видимой колонке
  const startHour = useMemo(() => {
    let min = BASE_START_HOUR;
    for (const d of days) {
      for (const t of timedByDay.get(localISO(d)) ?? []) {
        min = Math.min(min, Math.floor(parseMin(t.due_time) / 60));
      }
    }
    return min;
  }, [days, timedByDay]);

  const hasAllDay = days.some((d) => (allDayByDay.get(localISO(d)) ?? []).length > 0);

  return (
    <div className="cd" data-testid="cal-days" data-count={days.length}>
      {hasAllDay && (
        <div className="cd-adrow">
          {days.map((d) => {
            const items = allDayByDay.get(localISO(d)) ?? [];
            return (
              <div className="cd-slot" key={localISO(d)}>
                {items.slice(0, 1).map((t) => {
                  const c = resolveColor(t.project_id, byId);
                  return (
                    <button
                      key={t.id}
                      className="cd-pill"
                      style={{ ["--c" as string]: c ?? "var(--accent)" }}
                      onClick={() => onOpenTask(t)}
                    >
                      {t.title}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      <div className="cd-cols">
        {days.map((d) => {
          const iso = localISO(d);
          const isToday = sameDay(d, today);
          const flags = flagsByDay.get(iso) ?? [];
          const dayTimed = timedByDay.get(iso) ?? [];
          return (
            <div className="cd-col" key={iso} data-testid={`cd-col-${iso}`}>
              <button
                className={`cd-dh${isToday ? " today" : ""}`}
                onClick={() => onOpenDay(d)}
                aria-label={`Открыть задачи на ${iso}`}
              >
                <span className="dn">{dowShort(d)}</span>
                <span className="dd">
                  {flags.slice(0, 1).map((f) => {
                    const c = resolveColor(f.project_id, byId) ?? "var(--text-muted)";
                    return (
                      <svg key={f.id} className="cd-pen" viewBox="0 0 12 12" aria-label={`веха: ${f.name}`}>
                        <path d="M2 1v10" stroke={c} strokeWidth="1.4" fill="none" />
                        <path d="M2 1.5h6l-1.4 2L8 5.5H2z" fill={c} />
                      </svg>
                    );
                  })}
                  {d.getDate()}
                </span>
              </button>
              {/* тело: DayTimeline compact. Тап ПУСТОЙ сетки → открыть день (onTapHour). */}
              <DayTimeline
                tasks={dayTimed}
                byId={byId}
                isToday={isToday}
                compact
                startHourOverride={startHour}
                autoScroll={false}
                onTapHour={() => onOpenDay(d)}
                onToggle={onToggle}
                onOpen={onOpenTask}
                onResize={onResize}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
