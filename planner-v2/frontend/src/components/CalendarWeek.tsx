import { useMemo } from "react";
import {
  WEEK_GRID_H, WEEK_START_HOUR, blockGeom, hourLabels, nowLineTop,
} from "../lib/weekLayout";
import { layoutColumns } from "../lib/timelineLayout";
import { dowShort, localISO, sameDay, weekDays } from "../lib/calDates";
import { priorityColor, resolveColor, tint } from "../lib/projectColor";
import type { Milestone, Project, Task } from "../types";

function parseMin(t: string | null | undefined): number {
  if (!t) return 0;
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * Неделя — тайм-блокинг (Sunsama/Akiflow). 7 колонок-дней, окно WEEK_START..END.
 * Цвет блока = проект (тинт), кант = приоритет. Веха = флажок на числе (F1).
 * Наложения = каскад-веер (G2). Полоска «весь день» (C1) над сеткой.
 * Лоток «Без даты» (A8) — свёрнутая полка снизу, тап → ряд карточек.
 * Драг таймблока / драг из лотка (flow 5/8) отложены (COVERAGE-DEFER).
 */
export function CalendarWeek({
  weekStart, tasks, milestones, byId, today, onTapBlock, onTapSlot,
}: {
  weekStart: Date;
  tasks: Task[];
  milestones: Milestone[];
  byId: Map<number, Project>;
  today: Date;
  onTapBlock: (t: Task) => void;
  onTapSlot: (day: Date, hour: number) => void;
}) {
  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const labels = hourLabels();

  // C1: задачи с датой без времени, по дням
  const allDayByDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      if (t.due_date && !t.due_time) (m.get(t.due_date) ?? m.set(t.due_date, []).get(t.due_date)!).push(t);
    }
    return m;
  }, [tasks]);

  // таймблоки по дням
  const blocksByDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      if (t.due_date && t.due_time) (m.get(t.due_date) ?? m.set(t.due_date, []).get(t.due_date)!).push(t);
    }
    return m;
  }, [tasks]);

  const flagsByDay = useMemo(() => {
    const m = new Map<string, Milestone[]>();
    for (const ms of milestones) (m.get(ms.milestone_date) ?? m.set(ms.milestone_date, []).get(ms.milestone_date)!).push(ms);
    return m;
  }, [milestones]);

  const hasAllDay = days.some((d) => (allDayByDay.get(localISO(d)) ?? []).length > 0);

  return (
    <div className="cw" data-testid="cal-week">
      {hasAllDay && (
        <>
          <div className="cw-adcap">весь день</div>
          <div className="cw-adrow">
            {days.map((d) => {
              const items = allDayByDay.get(localISO(d)) ?? [];
              return (
                <div className="cw-slot" key={localISO(d)}>
                  {items.slice(0, 1).map((t) => {
                    const c = resolveColor(t.project_id, byId);
                    return (
                      <div
                        key={t.id}
                        className="cw-pill"
                        style={{ ["--c" as string]: c ?? "var(--accent)" }}
                        onClick={() => onTapBlock(t)}
                      >
                        {t.title}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="cw-days">
        {days.map((d) => {
          const iso = localISO(d);
          const isToday = sameDay(d, today);
          const flags = flagsByDay.get(iso) ?? [];
          const dayBlocks = blocksByDay.get(iso) ?? [];
          const cols = layoutColumns(
            dayBlocks.map((t) => ({ id: t.id, startMin: parseMin(t.due_time), endMin: Math.max(parseMin(t.end_time) || parseMin(t.due_time) + 45, parseMin(t.due_time) + 15) })),
          );
          const nowTop = isToday ? nowLineTop(today) : null;
          return (
            <div className="cw-col" key={iso} data-testid={`cw-col-${iso}`}>
              <div className={`cw-dh${isToday ? " today" : ""}`}>
                <div className="dn">{dowShort(d)}</div>
                <div className="dd">
                  {flags.slice(0, 1).map((f) => {
                    const c = resolveColor(f.project_id, byId) ?? "var(--text-muted)";
                    return (
                      <svg key={f.id} className="cw-pen" viewBox="0 0 12 12" aria-label={`веха: ${f.name}`}>
                        <path d="M2 1v10" stroke={c} strokeWidth="1.4" fill="none" />
                        <path d="M2 1.5h6l-1.4 2L8 5.5H2z" fill={c} />
                      </svg>
                    );
                  })}
                  {d.getDate()}
                </div>
              </div>
              <div
                className="cw-grid"
                onClick={(e) => {
                  // тап пустой сетки → создать на этот час (flow 2)
                  if ((e.target as HTMLElement).closest(".cw-blk")) return;
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const y = e.clientY - rect.top;
                  const hour = WEEK_START_HOUR + Math.floor((y / WEEK_GRID_H) * (labels.length * 2));
                  onTapSlot(d, hour);
                }}
              >
                {labels.map((l) => (
                  <div className="cw-hr" key={l.hour} style={{ top: l.top }}>
                    <span className="cw-hrlbl">{l.hour}</span>
                  </div>
                ))}
                {nowTop != null && <div className="cw-now" data-testid="cw-now" style={{ top: nowTop }} />}
                {dayBlocks.map((t) => {
                  const g = blockGeom(t.due_time, t.end_time);
                  if (!g) return null;
                  const col = cols.get(t.id);
                  const cascade = col && col.colCount > 1 ? (col.colIndex === 0 ? " c1" : " c2") : "";
                  const c = resolveColor(t.project_id, byId);
                  const pr = priorityColor(t.priority);
                  const done = t.status === "done";
                  return (
                    <div
                      key={t.id}
                      data-testid={`cw-blk-${t.id}`}
                      className={`cw-blk${cascade}${done ? " done" : ""}`}
                      style={{
                        top: g.top, height: g.height,
                        background: tint(c, 0.16),
                        borderLeftColor: pr ?? "var(--border)",
                      }}
                      onClick={() => onTapBlock(t)}
                    >
                      <div className="bn">{t.title}</div>
                      <div className="bt">{t.due_time?.slice(0, 5)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="cw-legend" data-testid="cw-legend">
        {[...byId.values()].filter((p) => !p.is_inbox && p.color).slice(0, 4).map((p) => (
          <span className="cw-lk" key={p.id}><i style={{ background: p.color! }} />{p.name}</span>
        ))}
        <span className="cw-lk"><i className="bar" style={{ background: "var(--danger)" }} />high</span>
        <span className="cw-lk"><i className="bar" style={{ background: "var(--warning)" }} />med</span>
        <span className="cw-lk"><i className="bar" style={{ background: "var(--accent)" }} />low</span>
      </div>
    </div>
  );
}
