import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Empty } from "../components/Empty";
import { TaskItem } from "../components/TaskItem";
import { Sheet } from "../components/Sheet";
import { IcoEdit, IcoTrash } from "../components/icons";
import { useLongPress } from "../lib/useLongPress";
import { tg } from "../telegram";
import { confirmDialog } from "../lib/confirm";
import {
  backfillHabit, completeTask, createHabit, createMetric, deleteHabit, deleteMetric, deleteMetricEntry,
  getHabits, getHabitHistory, getMetrics, getRetro, measureMetric, patchHabit, patchMetric, toggleHabit,
  type HabitHistoryOut, type RetroOut,
} from "../api";
import type { HabitInput, HabitOut, MetricOut, Task } from "../types";

// ── Форк E (T5): таб «Привычки» на реальном API. ZERO-AFK — бэк LLM не зовёт.
// Сегменты: Привычки | Метрики | Ретро. Зачёт привычки-счётчика = градиент (heat7 0-4 с бэка).

type View = "habits" | "metrics" | "retro";
const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const RING_R = 19;
const RING_CIRC = 2 * Math.PI * RING_R;

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function mondayISO(): string {
  const d = new Date();
  const wd = (d.getDay() + 6) % 7; // Пн=0
  d.setDate(d.getDate() - wd);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Flame() {
  return (
    <span className="hc-flame" aria-hidden>
      <svg width="11" height="13" viewBox="0 0 11 13" fill="currentColor">
        <path d="M5.5 0C5.5 0 1 3.2 1 7.3 1 10.4 3 12.5 5.5 12.5S10 10.4 10 7.3c0-1.6-.8-2.8-1.5-3.6 0 1.1-.6 1.8-1.3 1.8-.8 0-1.2-.6-1.2-1.6C5.9 2.6 5.5 0 5.5 0z" />
      </svg>
    </span>
  );
}
function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
function StreakRing({ pct, num, color }: { pct: number; num: number; color: string }) {
  const offset = RING_CIRC * (1 - Math.max(0, Math.min(1, pct)));
  return (
    <div className="sring">
      <svg width="46" height="46" viewBox="0 0 46 46">
        <circle cx="23" cy="23" r={RING_R} fill="none" stroke="var(--ring-track)" strokeWidth="4" />
        <circle cx="23" cy="23" r={RING_R} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={RING_CIRC} strokeDashoffset={offset} />
      </svg>
      <div className="num" style={{ color }}>{num}</div>
    </div>
  );
}

// дни недели Пн..Вс (индекс 0=Пн, как schedule_days/week бэка)
const DOW = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
// русское склонение: plural(2,["день","дня","дней"]) → "дня"
function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}
// сколько дней осталось до даты (вкл. сегодня = 0); null если нет даты
function daysLeftTo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(iso + "T00:00:00");
  return Math.max(0, Math.round((d.getTime() - today.getTime()) / 86400000));
}

function HabitCard({ h, onToggle, onCount, onOpen, onMenu }: {
  h: HabitOut; onToggle: (h: HabitOut) => void; onCount: (h: HabitOut) => void;
  onOpen: (h: HabitOut) => void; onMenu: (h: HabitOut) => void;
}) {
  const sk = (h.schedule_kind || "daily") as "daily" | "weekly_n" | "by_days" | "goal_date";
  const isCount = h.mark_type === "count";
  const isGoalDate = sk === "goal_date";
  const goalTotal = h.goal_total ?? 0;
  const weekDone = h.week.filter(Boolean).length;
  const days = h.schedule_days ?? [];

  // недельная цель + выполнено под тип расписания
  const wkTarget = sk === "weekly_n" ? (h.schedule_n ?? 3)
    : sk === "by_days" ? (days.length || 7)
      : 7;
  const wkDone = sk === "by_days" ? days.filter((d) => h.week[d]).length : weekDone;

  // edge #11: стрик прерван (был рекорд) / цель-дата достигнута
  const broken = !isCount && h.streak === 0 && h.record_streak > 0 && !h.done_today;
  const reached = isGoalDate && goalTotal > 0 && h.streak >= goalTotal;
  // заполнение кольца под тип. count = прогресс дня (today_value/норма), подливается каждым +шагом
  const pct = reached ? 1
    : isCount ? (h.target ? Math.min(1, (h.today_value ?? 0) / h.target) : (h.done_today ? 1 : 0))
      : isGoalDate ? (goalTotal ? h.streak / goalTotal : 0)
        : wkTarget ? wkDone / wkTarget : 0;
  const ringColor = broken ? "var(--text-muted)" : h.color;
  const daysLeft = isGoalDate ? daysLeftTo(h.goal_date) : null;

  // строка стрика под тип расписания
  let streakNode: ReactNode;
  if (broken) streakNode = <>стрик прерван · рекорд был {h.record_streak}</>;
  else if (reached) streakNode = <>цель достигнута · {goalTotal}/{goalTotal} ✓</>;
  else if (isGoalDate)
    streakNode = <><b>{h.streak} / {goalTotal} {plural(goalTotal, ["день", "дня", "дней"])}</b>
      {daysLeft != null ? ` · осталось ${daysLeft} ${plural(daysLeft, ["день", "дня", "дней"])}` : ""}</>;
  else if (sk === "weekly_n")
    streakNode = h.streak > 0
      ? <><b>{h.streak} {plural(h.streak, ["неделя", "недели", "недель"])}</b> подряд</>
      : <>{wkDone}/{wkTarget} на этой неделе</>;
  else
    streakNode = <><b>{h.streak} {plural(h.streak, ["день", "дня", "дней"])}</b>{" "}
      {h.done_today ? "подряд" : "· сегодня ещё нет"}</>;

  // long-press → контекст-меню; тап → деталь (подавляем клик после long-press)
  const { pressed, handlers } = useLongPress(() => onMenu(h), () => onOpen(h));

  return (
    <div className={"hcard" + (pressed ? " pressed" : "")} style={{ ["--c" as string]: h.color, cursor: "pointer" }} {...handlers}>
      <div className="hc-row">
        <StreakRing pct={pct} num={h.streak} color={ringColor} />
        <div className="hc-body">
          <div className="hc-name">{h.name}</div>
          <div className="hc-streak" style={broken ? { color: "var(--danger)" } : reached ? { color: h.color } : undefined}>
            {!broken && <Flame />}
            <span>{streakNode}</span>
          </div>
        </div>
        {isCount ? (
          <button className="hchk" style={{ ["--c" as string]: h.color }}
            onClick={(e) => { e.stopPropagation(); onCount(h); }}
            aria-label="Добавить замер">+</button>
        ) : (
          <button className={"hchk" + (h.done_today ? " done" : "")} style={{ ["--c" as string]: h.color }}
            onClick={(e) => { e.stopPropagation(); onToggle(h); }}
            aria-label={h.done_today ? "Снять отметку" : "Отметить выполнено"}>
            {h.done_today && <Check />}
          </button>
        )}
      </div>

      {isCount ? (
        <div className="hpgoal">
          сегодня: <b>{h.today_value}{h.unit ? ` ${h.unit}` : ""}</b>
          {h.target ? ` / ${h.target}${h.unit ? ` ${h.unit}` : ""}` : ""}
        </div>
      ) : isGoalDate ? (
        <>
          <div className="hpbar"><i style={{ width: `${Math.min(100, pct * 100)}%` }} /></div>
          <div className="hpgoal">до цели: <b>{h.streak} / {goalTotal} {plural(goalTotal, ["день", "дня", "дней"])}</b></div>
        </>
      ) : sk === "by_days" ? (
        <div className="wkrow wkrow--days">
          {days.map((d) => (
            <span key={d} className="wkday">
              <i className={h.week[d] ? "fill" : ""} style={{ ["--c" as string]: h.color }} />
              <em>{DOW[d]}</em>
            </span>
          ))}
          <span className="wklbl">{wkDone >= days.length && days.length > 0 ? "неделя закрыта ✓" : `${wkDone} / ${days.length} за неделю`}</span>
        </div>
      ) : sk === "weekly_n" ? (
        <div className="wkrow">
          {Array.from({ length: wkTarget }).map((_, i) => (
            <i key={i} className={i < wkDone ? "fill" : ""} style={{ ["--c" as string]: h.color }} />
          ))}
          <span className="wklbl">{wkDone >= wkTarget ? "цель недели ✓" : `${wkDone} / ${wkTarget} за неделю`}</span>
        </div>
      ) : (
        <div className="wkrow">
          {h.week.map((on, i) => <i key={i} className={on ? "fill" : ""} style={{ ["--c" as string]: h.color }} />)}
          <span className="wklbl">{weekDone} / 7 за неделю</span>
        </div>
      )}
    </div>
  );
}

// 7 ISO-дат текущей недели Пн..Вс + индекс сегодня (Пн=0)
function weekDates(): { dates: string[]; todayIdx: number } {
  const d = new Date();
  const todayIdx = (d.getDay() + 6) % 7;
  const mon = new Date(d); mon.setDate(d.getDate() - todayIdx);
  const dates = Array.from({ length: 7 }, (_, i) => {
    const x = new Date(mon); x.setDate(mon.getDate() + i);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  });
  return { dates, todayIdx };
}

function HabitsView({ habits, onToggle, onCount, onOpen, onMenu, onCellTap, onNew }: {
  habits: HabitOut[]; onToggle: (h: HabitOut) => void; onCount: (h: HabitOut) => void;
  onOpen: (h: HabitOut) => void; onMenu: (h: HabitOut) => void;
  onCellTap: (h: HabitOut, iso: string, level: number) => void; onNew: () => void;
}) {
  if (habits.length === 0) {
    return <Empty text="Пока нет привычек. Заведи первую рутину — стрик начнётся с сегодня."
      action={<button className="btn-primary" onClick={onNew}>Новая привычка</button>} />;
  }
  const { dates, todayIdx } = weekDates();
  return (
    <>
      <div className="trk-seclbl" style={{ display: "flex", justifyContent: "space-between" }}>
        <span>Сегодня</span><button className="lnk" onClick={onNew}>+ Привычка</button>
      </div>
      {habits.map((h) => (
        <HabitCard key={h.id} h={h} onToggle={onToggle} onCount={onCount} onOpen={onOpen} onMenu={onMenu} />
      ))}

      <div className="trk-seclbl">Тепловая карта</div>
      <div className="heat">
        <div className="hgrid">
          <div className="hd" />
          {WD.map((d) => <div className="hd" key={d}>{d}</div>)}
          {habits.map((h) => (
            <HeatRow key={h.id} habit={h} dates={dates} todayIdx={todayIdx} onCellTap={onCellTap} />
          ))}
        </div>
        <div className="hleg">
          меньше <span className="lv0" /><span className="lv1" /><span className="lv2" /><span className="lv3" /><span className="lv4" /> больше
        </div>
        <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 7 }}>Тап по прошлому дню — отметить, снять или вписать значение.</div>
      </div>
    </>
  );
}

function HeatRow({ habit, dates, todayIdx, onCellTap }: {
  habit: HabitOut; dates: string[]; todayIdx: number; onCellTap: (h: HabitOut, iso: string, level: number) => void;
}) {
  const levels = habit.heat7 ?? [];
  return (
    <>
      <div className="rn">{habit.name}</div>
      {dates.map((iso, i) => {
        const lv = levels[i] ?? 0;
        const isFuture = i > todayIdx;
        const canTap = i < todayIdx; // любой прошлый день: отметить / снять / вписать
        return (
          <div key={i} className={`cell lv${lv}`}
            onClick={canTap ? () => onCellTap(habit, iso, lv) : undefined}
            style={{ opacity: isFuture ? 0.3 : 1, cursor: canTap ? "pointer" : "default" }} />
        );
      })}
    </>
  );
}

function MetricRow({ m, onOpen, onMeasure, onMenu }: {
  m: MetricOut; onOpen: (m: MetricOut) => void; onMeasure: (m: MetricOut) => void; onMenu: (m: MetricOut) => void;
}) {
  // дельта: цвет по направлению «хорошо» — улучшение зелёным (down)/синим (up), ухудшение красным
  let cls = "flat", txt = "— без изменений";
  if (m.delta != null && m.delta !== 0) {
    const improving = m.good_direction === "down" ? m.delta < 0 : m.delta > 0;
    const arrow = m.delta < 0 ? "▼" : "▲";
    cls = improving ? (m.good_direction === "down" ? "good" : "up") : "bad";
    txt = `${arrow} ${Math.abs(m.delta).toFixed(1)} за неделю`;
  }
  const pts = sparkPoints(m.entries.map((e) => e.value).reverse());
  const { pressed, handlers } = useLongPress(() => onMenu(m), () => onOpen(m));
  return (
    <div className={"mrow" + (pressed ? " pressed" : "")} {...handlers}>
      <div className="mtop">
        <div className="mn">{m.name}{m.unit ? <span>{m.unit}</span> : null}</div>
        <button className="madd" aria-label="Добавить замер"
          onClick={(e) => { e.stopPropagation(); onMeasure(m); }}>+</button>
      </div>
      <div className="mvrow">
        <div className="mbig">{m.latest ?? "—"}</div>
        <div className={"md " + cls}>{txt}</div>
      </div>
      {pts && (
        <svg className="mrow-spark" width="100%" height="34" viewBox="0 0 120 26" preserveAspectRatio="none">
          <polyline points={pts} fill="none" stroke={m.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

function MetricsView({ metrics, onOpen, onNew, onMeasure, onMenu }: {
  metrics: MetricOut[]; onOpen: (m: MetricOut) => void; onNew: () => void;
  onMeasure: (m: MetricOut) => void; onMenu: (m: MetricOut) => void;
}) {
  if (metrics.length === 0) {
    return <Empty text="Нет метрик. Следи за любым числом — вес, сон, настроение."
      action={<button className="btn-primary" onClick={onNew}>Новая метрика</button>} />;
  }
  return (
    <>
      <div className="trk-seclbl" style={{ display: "flex", justifyContent: "space-between" }}>
        <span>Метрики недели</span><button className="lnk" onClick={onNew}>+ Метрика</button>
      </div>
      <div className="mlist">
        {metrics.map((m) => (
          <MetricRow key={m.id} m={m} onOpen={onOpen} onMeasure={onMeasure} onMenu={onMenu} />
        ))}
      </div>
    </>
  );
}

function sparkPoints(vals: number[]): string {
  if (vals.length === 0) return "";
  if (vals.length === 1) return `0,13 120,13`;
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const stepX = 120 / (vals.length - 1);
  return vals.map((v, i) => `${(i * stepX).toFixed(1)},${(22 - ((v - min) / span) * 18).toFixed(1)}`).join(" ");
}

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
function weekLabel(startISO: string, endISO: string): string {
  const s = new Date(startISO + "T00:00:00"), e = new Date(endISO + "T00:00:00");
  return `${s.getDate()}–${e.getDate()} ${MONTHS[e.getMonth()]}`;
}

function RingPct({ pct }: { pct: number }) {
  const r = 20, circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.max(0, Math.min(1, pct)));
  return (
    <div style={{ position: "relative", width: 50, height: 50, flex: "0 0 auto" }}>
      <svg width="50" height="50" viewBox="0 0 50 50" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="25" cy="25" r={r} fill="none" stroke="var(--ring-track)" strokeWidth="5" />
        <circle cx="25" cy="25" r={r} fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent)" }}>
        {Math.round(pct * 100)}%
      </div>
    </div>
  );
}

function RetroView({ retro, metrics, onTaskToggle }: { retro: RetroOut | null; metrics: MetricOut[]; onTaskToggle: (t: Task) => void }) {
  const [odOpen, setOdOpen] = useState(false); // просрочка в Ретро свёрнута по умолчанию
  if (!retro) return <Empty text="Нет данных за неделю. Отмечай задачи и привычки." />;

  const { tasks, habits } = retro;
  const taskPct = tasks.planned ? tasks.done / tasks.planned : 0;
  const habPct = habits.total_days ? habits.done_days / habits.total_days : 0;
  const avg = habits.count ? (habits.done_days / 7).toFixed(1) : "0";
  const weak = [...habits.items].sort((a, b) => a.week_done - b.week_done)[0];
  const recordHabit = habits.items.find((h) => h.tag?.startsWith("рекорд"));
  const weakProj = [...tasks.by_project].sort((a, b) => a.done / (a.total || 1) - b.done / (b.total || 1))[0];

  return (
    <>
      <div className="trk-seclbl">Итог недели · {weekLabel(retro.week_start, retro.week_end)}</div>

      {/* ЗАДАЧИ */}
      <div className="trk-seclbl" style={{ marginTop: 6 }}>Задачи</div>
      <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 11 }}>
        <RingPct pct={taskPct} />
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{tasks.done} / {tasks.planned} закрыто</div>
          <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>вклад в цели: +{tasks.impact_sum}%</div>
        </div>
      </div>
      {tasks.by_project.length > 0 && (
        <div className="hcard" style={{ padding: "2px 12px" }}>
          {tasks.by_project.map((p, i) => (
            <div key={p.project_id ?? "inbox"} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 0", borderBottom: i < tasks.by_project.length - 1 ? "1px solid var(--border)" : "none", fontSize: 13.5 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: p.color }} />
              <span style={{ flex: 1 }}>{p.name}</span>
              <span className="mono" style={{ color: "var(--text-muted)", fontSize: 12.5 }}><b style={{ color: "var(--text)" }}>{p.done}</b> / {p.total}</span>
            </div>
          ))}
        </div>
      )}

      {/* ПРОСРОЧЕНО — шторка */}
      {tasks.overdue.length > 0 && (
        <div className="hcard" style={{ padding: "2px 12px", marginTop: 9, border: "1px solid rgba(255,92,92,.5)", background: "rgba(255,92,92,.05)" }}>
          <button onClick={() => setOdOpen((v) => !v)} style={{ width: "100%", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0 9px", color: "var(--danger)", fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".4px" }}>
            <span>Просрочено · {tasks.overdue.length}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ transform: odOpen ? "none" : "rotate(-90deg)", transition: "transform .2s" }}><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {odOpen && (
            <div className="retro-od" style={{ display: "flex", flexDirection: "column", gap: 7, padding: "6px 0 10px" }}>
              {tasks.overdue.map((o) => (
                <TaskItem key={o.id} task={o} color={o.color} onToggle={onTaskToggle} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ПРИВЫЧКИ */}
      <div className="trk-seclbl">Привычки</div>
      <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 11 }}>
        <RingPct pct={habPct} />
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{habits.done_days} / {habits.total_days} зачётов</div>
          <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{habits.count} привычки · ср. {avg}/день</div>
        </div>
      </div>
      {habits.items.map((h) => (
        <div key={h.id} className="hcard" style={{ ["--c" as string]: h.color, display: "flex", alignItems: "center", gap: 11 }}>
          <span style={{ width: 4, alignSelf: "stretch", borderRadius: 3, background: h.color }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="hc-name">{h.name}</div>
            <div className="wkrow" style={{ marginTop: 4 }}>
              {h.week.map((on, i) => <i key={i} className={on ? "fill" : ""} style={{ ["--c" as string]: h.color }} />)}
              <span className="wklbl">{h.week_done}/7</span>
            </div>
          </div>
          {h.tag && <span className="imp" style={{ color: h.tag.startsWith("рекорд") ? "var(--accent)" : h.tag === "слабое" ? "var(--danger)" : "var(--success)" }}>{h.tag}</span>}
        </div>
      ))}

      {/* МЕТРИКИ НЕДЕЛИ */}
      {metrics.length > 0 && (
        <>
          <div className="trk-seclbl">Метрики недели</div>
          <div className="hcard" style={{ padding: "2px 12px" }}>
            {metrics.map((m, i) => {
              const good = m.delta == null ? null : (m.good_direction === "down" ? m.delta < 0 : m.delta > 0);
              return (
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: i < metrics.length - 1 ? "1px solid var(--border)" : "none", fontSize: 13.5 }}>
                  <span>{m.name}{m.good_direction === "up" ? <span style={{ color: "var(--text-muted)", fontSize: 11 }}> · цель ↑</span> : null}</span>
                  {m.delta != null && (
                    <span className="mono" style={{ fontWeight: 600, color: good ? "var(--success)" : "var(--text-muted)" }}>
                      {m.delta < 0 ? "▼" : "▲"} {Math.abs(m.delta).toFixed(1)} {m.unit ?? ""}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ХАЙЛАЙТЫ */}
      <div className="trk-seclbl">Хайлайты</div>
      <div className="hcard" style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 13, lineHeight: 1.4 }}>
        {tasks.top_task && (
          <div style={{ display: "flex", gap: 9 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--accent)" style={{ flex: "0 0 auto", marginTop: 1 }}><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>
            <span><b>Двинул больше всего:</b> «{tasks.top_task.title}»{tasks.top_task.project ? ` (${tasks.top_task.project}, вклад ${tasks.top_task.impact}%)` : ""}</span>
          </div>
        )}
        {recordHabit && (
          <div style={{ display: "flex", gap: 9 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" style={{ flex: "0 0 auto", marginTop: 1 }}><path d="M5 3v4M3 5h4M13 3l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5z" /></svg>
            <span><b>Рекорд стрика:</b> {recordHabit.name} — {recordHabit.streak} дней</span>
          </div>
        )}
        {(weakProj || weak) && (
          <div style={{ display: "flex", gap: 9 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" style={{ flex: "0 0 auto", marginTop: 1 }}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" /></svg>
            <span><b>Слабое место:</b>{weakProj ? ` ${weakProj.name} ${weakProj.done}/${weakProj.total}` : ""}{weakProj && weak ? " · " : ""}{weak ? `${weak.name} ${weak.week_done}/7` : ""}</span>
          </div>
        )}
      </div>

      {/* ЗАМЕТКА АССИСТЕНТА (ZERO-AFK: пишет Claude в чате, app показывает) */}
      <div className="hcard" style={{ display: "flex", gap: 10, marginTop: 8, background: "var(--accent-soft)", borderColor: "rgba(238,138,60,.2)", fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.45 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)" style={{ flex: "0 0 auto", marginTop: 1 }}><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>
        <span><b style={{ color: "var(--text)" }}>Заметка ассистента:</b> появится после разбора недели в чате — обсуди итоги с Claude, и подсказка ляжет сюда.</span>
      </div>
    </>
  );
}

export function Tracking() {
  const [view, setView] = useState<View>("habits");
  const [habits, setHabits] = useState<HabitOut[]>([]);
  const [metrics, setMetrics] = useState<MetricOut[]>([]);
  const [retro, setRetro] = useState<RetroOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sheet, setSheet] = useState<null | "habit" | "metric">(null);
  const [measure, setMeasure] = useState<MetricOut | null>(null);
  const [detail, setDetail] = useState<HabitOut | null>(null);
  const [editHabit, setEditHabit] = useState<HabitOut | null>(null);
  const [countSheet, setCountSheet] = useState<{ habit: HabitOut; date: string } | null>(null);
  const [menu, setMenu] = useState<HabitOut | null>(null);
  const [metricDetail, setMetricDetail] = useState<MetricOut | null>(null);
  const [metricMenu, setMetricMenu] = useState<MetricOut | null>(null);
  const [editMetric, setEditMetric] = useState<MetricOut | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [h, m, r] = await Promise.all([getHabits(todayISO()), getMetrics(), getRetro(mondayISO())]);
      setHabits(h); setMetrics(m); setRetro(r);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const replaceHabit = (h: HabitOut) => setHabits((p) => p.map((x) => (x.id === h.id ? h : x)));
  const replaceMetric = (m: MetricOut) => setMetrics((p) => p.map((x) => (x.id === m.id ? m : x)));

  async function onToggle(h: HabitOut) {
    tg()?.HapticFeedback?.impactOccurred?.("light");
    try { replaceHabit(await toggleHabit(h.id, todayISO())); } catch { load(); }
  }
  // тап по ячейке heatmap прошлого дня: check = тоггл (вкл/снять), count = открыть степпер ввода значения дня
  async function onCellTap(h: HabitOut, iso: string, level: number) {
    if (h.mark_type === "count") { setCountSheet({ habit: h, date: iso }); return; }
    tg()?.HapticFeedback?.impactOccurred?.("light");
    try { replaceHabit(await backfillHabit(h.id, iso, level > 0 ? 0 : 1)); } catch { load(); } // value<=0 = снять
  }
  function archiveHabit(h: HabitOut) {
    confirmDialog(`Архивировать «${h.name}»?`, { body: "Скроется, история сохранится.", confirmText: "Архивировать", danger: false }).then(async (ok) => {
      if (!ok) return;
      try { await patchHabit(h.id, { archived: true }); setHabits((p) => p.filter((x) => x.id !== h.id)); setDetail(null); setMenu(null); } catch { load(); }
    });
  }
  function removeHabit(h: HabitOut) {
    confirmDialog(`Удалить «${h.name}»?`, { body: "Стрики и история сотрутся навсегда." }).then(async (ok) => {
      if (!ok) return;
      try { await deleteHabit(h.id); setHabits((p) => p.filter((x) => x.id !== h.id)); setDetail(null); setMenu(null); } catch { load(); }
    });
  }
  function onDeleteMetric(m: MetricOut) {
    confirmDialog(`Удалить метрику «${m.name}»?`, { body: "Все замеры удалятся навсегда." }).then(async (ok) => {
      if (!ok) return;
      try { await deleteMetric(m.id); setMetrics((p) => p.filter((x) => x.id !== m.id)); setMetricDetail(null); setMetricMenu(null); } catch { load(); }
    });
  }
  function onOverdueDone(t: Task) {
    tg()?.HapticFeedback?.impactOccurred?.("light");
    completeTask(t.id).then(load).catch(load);  // закрыл просроченную → пересчёт ретро
  }

  if (loading) return <div className="screen"><div className="screen-hero"><h1>Привычки</h1></div><div className="trk-seclbl">Загрузка…</div></div>;
  if (error) return (
    <div className="screen"><div className="screen-hero"><h1>Привычки</h1></div>
      <Empty text="Не удалось загрузить." action={<button className="btn-primary" onClick={load}>Повторить</button>} />
    </div>
  );

  return (
    <div className="screen">
      <div className="screen-hero"><h1>Привычки</h1></div>
      <div className="seg">
        <button className={view === "habits" ? "seg-on" : ""} onClick={() => setView("habits")}>Привычки</button>
        <button className={view === "metrics" ? "seg-on" : ""} onClick={() => setView("metrics")}>Метрики</button>
        <button className={view === "retro" ? "seg-on" : ""} onClick={() => setView("retro")}>Ретро</button>
      </div>

      {view === "habits" && <HabitsView habits={habits} onToggle={onToggle} onCount={(h) => setCountSheet({ habit: h, date: todayISO() })} onOpen={setDetail} onMenu={setMenu} onCellTap={onCellTap} onNew={() => setSheet("habit")} />}
      {view === "metrics" && <MetricsView metrics={metrics} onOpen={setMetricDetail} onNew={() => setSheet("metric")} onMeasure={(m) => setMeasure(m)} onMenu={(m) => setMetricMenu(m)} />}
      {view === "retro" && <RetroView retro={retro} metrics={metrics} onTaskToggle={onOverdueDone} />}

      {sheet === "habit" && <NewHabitSheet onClose={() => setSheet(null)} onCreated={(h) => { setHabits((p) => [...p, h]); setSheet(null); }} />}
      {sheet === "metric" && <NewMetricSheet onClose={() => setSheet(null)} onCreated={(m) => { setMetrics((p) => [...p, m]); setSheet(null); }} />}
      {measure && <MeasureSheet metric={measure} onClose={() => setMeasure(null)} onSaved={(m) => { replaceMetric(m); setMeasure(null); }} />}

      {detail && (
        <HabitDetail
          habit={detail}
          onClose={() => setDetail(null)}
          onChange={(h) => { replaceHabit(h); setDetail(h); }}
          onMenu={(h) => setMenu(h)}
        />
      )}
      {countSheet && (
        <CountStepSheet habit={countSheet.habit} date={countSheet.date} onClose={() => setCountSheet(null)}
          onSaved={(h) => { replaceHabit(h); setDetail((d) => (d && d.id === h.id ? h : d)); setCountSheet(null); }} />
      )}
      {menu && (
        <HabitMenuSheet habit={menu} onClose={() => setMenu(null)}
          onEdit={(h) => { setMenu(null); setEditHabit(h); }}
          onArchive={archiveHabit} onDelete={removeHabit} />
      )}
      {metricDetail && (
        <MetricDetail metric={metricDetail} onClose={() => setMetricDetail(null)}
          onChange={(m) => { replaceMetric(m); setMetricDetail(m); }}
          onMenu={(m) => setMetricMenu(m)} />
      )}
      {metricMenu && (
        <MetricMenuSheet metric={metricMenu} onClose={() => setMetricMenu(null)}
          onEdit={(m) => { setMetricMenu(null); setEditMetric(m); }}
          onDelete={onDeleteMetric} />
      )}
      {editMetric && (
        <EditMetricSheet metric={editMetric} onClose={() => setEditMetric(null)}
          onSaved={(m) => { replaceMetric(m); setMetricDetail((d) => (d && d.id === m.id ? m : d)); setEditMetric(null); }} />
      )}
      {editHabit && (
        <EditHabitSheet
          habit={editHabit}
          onClose={() => setEditHabit(null)}
          onSaved={(h) => { replaceHabit(h); setDetail((d) => (d && d.id === h.id ? h : d)); setEditHabit(null); }}
        />
      )}
    </div>
  );
}

// #1 — шит замера метрики (замена window.prompt; в Telegram WebView нативный prompt = no-op).
// По T5-flows #4/#8: степпер «− значение ед +» + прямой ввод числа.
function MeasureSheet({ metric, onClose, onSaved }: { metric: MetricOut; onClose: () => void; onSaved: (m: MetricOut) => void }) {
  const [val, setVal] = useState<string>(metric.latest != null ? String(metric.latest) : "");
  const [saving, setSaving] = useState(false);
  const num = parseFloat(val.replace(",", "."));
  const bump = (d: number) => {
    const base = Number.isNaN(num) ? (metric.latest ?? 0) : num;
    setVal(String(Math.round((base + d) * 100) / 100));
  };
  const save = async () => {
    if (Number.isNaN(num) || saving) return;
    setSaving(true);
    try { onSaved(await measureMetric(metric.id, todayISO(), num)); }
    catch { setSaving(false); }
  };
  return (
    <Sheet onClose={onClose}>
        <div className="sheet-title">{metric.name} · сегодня</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0 6px" }}>
          <button className="hchk" style={{ ["--c" as string]: metric.color }} onClick={() => bump(-0.1)} aria-label="Минус 0.1">−</button>
          <div style={{ flex: 1, textAlign: "center" }}>
            <input className="input" inputMode="decimal" value={val} autoFocus
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
              style={{ textAlign: "center", fontSize: 26, fontWeight: 700, fontFamily: "var(--font-mono)" }} />
            {metric.unit && <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4 }}>{metric.unit}</div>}
          </div>
          <button className="hchk" style={{ ["--c" as string]: metric.color }} onClick={() => bump(0.1)} aria-label="Плюс 0.1">+</button>
        </div>
        {metric.latest != null && (
          <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 12, marginBottom: 12 }}>
            прошлый: {metric.latest}{metric.unit ? ` ${metric.unit}` : ""}
          </div>
        )}
        <button className="btn-primary" style={{ width: "100%" }} disabled={Number.isNaN(num) || saving} onClick={save}>
          {saving ? "Сохраняю…" : "Сохранить замер"}
        </button>
    </Sheet>
  );
}

// #1 — полный конструктор привычки (T5-flows #1): тип · [Число: ед/норма/ШАГ] · расписание · цвет.
const STEP_PRESETS = [0.25, 0.5, 1];
const FieldLbl = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".4px", margin: "16px 0 8px" }}>{children}</div>
);
const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} style={{
    padding: "9px 13px", borderRadius: 9, cursor: "pointer", fontSize: 13,
    border: on ? "1px solid var(--accent)" : "1px solid var(--border)",
    background: on ? "var(--accent-soft)" : "var(--surface-2)",
    color: on ? "var(--accent)" : "var(--text)",
  }}>{children}</button>
);

function NewHabitSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (h: HabitOut) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"check" | "count">("check");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [step, setStep] = useState(1);
  const [customStep, setCustomStep] = useState("");
  const [stepCustom, setStepCustom] = useState(false);
  const [sched, setSched] = useState<"daily" | "weekly_n" | "by_days" | "goal_date">("daily");
  const [weeklyN, setWeeklyN] = useState("3");
  const [days, setDays] = useState<number[]>([]);
  const [goalDate, setGoalDate] = useState("");
  const [goalTotal, setGoalTotal] = useState("");
  const [color, setColor] = useState(HABIT_PALETTE[1]);

  const toggleDay = (i: number) => setDays((p) => p.includes(i) ? p.filter((x) => x !== i) : [...p, i].sort());

  const submit = async () => {
    if (!name.trim()) return;
    const eff = stepCustom ? (parseFloat(customStep.replace(",", ".")) || 1) : step;
    const payload: HabitInput = { name: name.trim(), mark_type: type, color, schedule_kind: sched };
    if (type === "count") {
      payload.target = parseFloat(target.replace(",", ".")) || null;
      payload.unit = unit.trim() || null;
      payload.step = eff;
    }
    if (sched === "weekly_n") payload.schedule_n = parseInt(weeklyN) || 3;
    if (sched === "by_days") payload.schedule_days = days;
    if (sched === "goal_date") { payload.goal_date = goalDate || null; payload.goal_total = parseInt(goalTotal) || null; }
    onCreated(await createHabit(payload));
  };

  return (
    <Sheet onClose={onClose}>
        <div className="sheet-title">Новая привычка</div>

        <FieldLbl>Название</FieldLbl>
        <input className="input" placeholder="Напр. «Бег утром»" value={name} onChange={(e) => setName(e.target.value)} autoFocus />

        <FieldLbl>Тип отметки</FieldLbl>
        <div className="seg">
          <button className={type === "check" ? "seg-on" : ""} onClick={() => setType("check")}>Галка (да/нет)</button>
          <button className={type === "count" ? "seg-on" : ""} onClick={() => setType("count")}>Число (норма)</button>
        </div>

        {type === "count" && (
          <>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input className="input" placeholder="Норма/день (2)" value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" />
              <input className="input" placeholder="Ед. (л/раз/мин)" value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
            <FieldLbl>Шаг +/−</FieldLbl>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {STEP_PRESETS.map((s) => (
                <Chip key={s} on={!stepCustom && step === s} onClick={() => { setStepCustom(false); setStep(s); }}>{s}</Chip>
              ))}
              <Chip on={stepCustom} onClick={() => setStepCustom(true)}>своё</Chip>
              {stepCustom && (
                <input className="input" style={{ flex: "1 1 80px", minWidth: 70 }} placeholder="шаг" value={customStep}
                  onChange={(e) => setCustomStep(e.target.value)} inputMode="decimal" />
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
              напр. вода 0.25 · медитация 1 · отжимания 5
            </div>
          </>
        )}

        <FieldLbl>Расписание</FieldLbl>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Chip on={sched === "daily"} onClick={() => setSched("daily")}>Ежедневно</Chip>
          <Chip on={sched === "weekly_n"} onClick={() => setSched("weekly_n")}>N×/нед</Chip>
          <Chip on={sched === "by_days"} onClick={() => setSched("by_days")}>По дням</Chip>
          <Chip on={sched === "goal_date"} onClick={() => setSched("goal_date")}>Цель к дате</Chip>
        </div>
        {sched === "weekly_n" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            <input className="input" style={{ width: 80 }} value={weeklyN} onChange={(e) => setWeeklyN(e.target.value)} inputMode="numeric" />
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>раз в неделю</span>
          </div>
        )}
        {sched === "by_days" && (
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            {WD.map((d, i) => (
              <button key={i} onClick={() => toggleDay(i)} style={{
                flex: 1, padding: "9px 0", borderRadius: 8, cursor: "pointer", fontSize: 12,
                border: days.includes(i) ? "1px solid var(--accent)" : "1px solid var(--border)",
                background: days.includes(i) ? "var(--accent-soft)" : "var(--surface-2)",
                color: days.includes(i) ? "var(--accent)" : "var(--text-muted)",
              }}>{d}</button>
            ))}
          </div>
        )}
        {sched === "goal_date" && (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input className="input" type="date" value={goalDate} onChange={(e) => setGoalDate(e.target.value)} />
            <input className="input" placeholder="дней (16)" value={goalTotal} onChange={(e) => setGoalTotal(e.target.value)} inputMode="numeric" />
          </div>
        )}

        <FieldLbl>Цвет</FieldLbl>
        <div style={{ display: "flex", gap: 10 }}>
          {HABIT_PALETTE.map((c) => (
            <button key={c} onClick={() => setColor(c)} aria-label={`цвет ${c}`}
              style={{ width: 30, height: 30, borderRadius: "50%", background: c, border: color === c ? "2.5px solid var(--text)" : "2.5px solid transparent", cursor: "pointer" }} />
          ))}
        </div>

        <button className="btn-primary" style={{ marginTop: 18, width: "100%" }} onClick={submit}>Создать привычку</button>
    </Sheet>
  );
}

// ── #2 Деталь привычки: hero-кольцо, stats, месяц-календарь+бэкфилл, действия (T5-flows #2/#9) ──
const MONTHS_NOM = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const HABIT_PALETTE = ["#EE8A3C", "#5B8DEF", "#3FB68B", "#E0B341", "#9B6BE0", "#E0556E"]; // hex-allowlist (палитра цветов привычек)
const METRIC_PALETTE = ["#3FB68B", "#5B8DEF", "#EE8A3C", "#9B6BE0"]; // hex-allowlist (мокап T5: зелёный/синий/оранж/фиолет)

function mixColor(hex: string, level: number): string {
  const a = [0.32, 0.5, 0.72, 1][Math.max(1, Math.min(4, level)) - 1];
  return hex + Math.round(a * 255).toString(16).padStart(2, "0");
}

function BigRing({ pct, num, color }: { pct: number; num: number; color: string }) {
  const r = 33, circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.max(0, Math.min(1, pct)));
  return (
    <div style={{ position: "relative", width: 78, height: 78, flex: "0 0 auto" }}>
      <svg width="78" height="78" viewBox="0 0 78 78" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="39" cy="39" r={r} fill="none" stroke="var(--ring-track)" strokeWidth="6" />
        <circle cx="39" cy="39" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <b style={{ color, fontSize: 22, lineHeight: 1 }}>{num}</b>
        <span style={{ color: "var(--text-muted)", fontSize: 10 }}>дней</span>
      </div>
    </div>
  );
}

function Stat({ v, l }: { v: string; l: string }) {
  return (
    <div style={{ flex: 1, background: "var(--surface-2)", borderRadius: 10, padding: "10px 6px", textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{v}</div>
      <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 2 }}>{l}</div>
    </div>
  );
}

function HabitDetail({ habit, onClose, onChange, onMenu }: {
  habit: HabitOut; onClose: () => void; onChange: (h: HabitOut) => void;
  onMenu: (h: HabitOut) => void;
}) {
  const now = new Date();
  const year = now.getFullYear(), month0 = now.getMonth();
  const monthStr = `${year}-${String(month0 + 1).padStart(2, "0")}`;
  const [hist, setHist] = useState<HabitHistoryOut | null>(null);
  const [rev, setRev] = useState(0);
  useEffect(() => {
    let live = true;
    getHabitHistory(habit.id, monthStr).then((h) => { if (live) setHist(h); }).catch(() => {});
    return () => { live = false; };
  }, [habit.id, monthStr, rev]);

  const isCount = habit.mark_type === "count";
  const isGoal = habit.goal_total != null && habit.goal_total > 0;
  const weekDone = habit.week.filter(Boolean).length;
  const pct = isCount ? (habit.target ? Math.min(1, (habit.today_value ?? 0) / habit.target) : (habit.done_today ? 1 : 0))
    : isGoal ? habit.streak / (habit.goal_total as number) : weekDone / 7;
  const pct30 = hist ? Math.round(hist.pct30 * 100) : null;
  const sk = habit.schedule_kind || "daily";
  const schedLabel =
    sk === "goal_date" || isGoal
      ? (habit.goal_date ? `цель к ${fmtEntryDate(habit.goal_date)}` : `до рубежа ${habit.goal_total}`)
        + (habit.goal_total ? ` · ${habit.goal_total} дн` : "")
      : sk === "by_days"
        ? ((habit.schedule_days ?? []).map((d) => WD[d]).join(" · ") || "по дням")
        : sk === "weekly_n"
          ? `${habit.schedule_n ?? 0}×/нед`
          : "ежедневно";
  const sub = isCount
    ? (habit.target ? `норма ${habit.target}${habit.unit ? ` ${habit.unit}` : ""}/день` : "счётчик")
      + (sk !== "daily" ? ` · ${schedLabel}` : "")
    : schedLabel;

  const levelMap = new Map((hist?.days ?? []).map((d) => [d.date, d.level]));
  const daysCount = new Date(year, month0 + 1, 0).getDate();
  const firstWd = (new Date(year, month0, 1).getDay() + 6) % 7; // Пн=0
  const todayDate = now.getDate();

  const backfill = async (iso: string) => {
    try { onChange(await backfillHabit(habit.id, iso, habit.target ?? 1)); setRev((r) => r + 1); } catch { /* ignore */ }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "var(--bg)", display: "flex", flexDirection: "column", paddingTop: "env(safe-area-inset-top)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 12px 10px", borderBottom: "1px solid var(--border)" }}>
        <button onClick={onClose} aria-label="Назад" style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 28, lineHeight: 1, cursor: "pointer", width: 36 }}>‹</button>
        <span style={{ fontWeight: 600 }}>Привычка</span>
        <button onClick={() => onMenu(habit)} aria-label="Действия" style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", width: 36, fontSize: 22 }}>⋯</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
          <BigRing pct={pct} num={habit.streak} color={habit.color} />
          <div>
            <h3 style={{ margin: 0, fontSize: 20 }}>{habit.name}</h3>
            <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 3 }}>{sub}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          <Stat v={String(habit.streak)} l="стрик" />
          <Stat v={String(habit.record_streak)} l="рекорд" />
          <Stat v={pct30 != null ? `${pct30}%` : "—"} l="за 30 дн" />
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 8 }}>{MONTHS_NOM[month0]}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, marginBottom: 8 }}>
          {WD.map((d) => <div key={d} style={{ textAlign: "center", fontSize: 10, color: "var(--text-muted)" }}>{d[0]}</div>)}
          {Array.from({ length: firstWd }).map((_, i) => <div key={"b" + i} />)}
          {Array.from({ length: daysCount }).map((_, i) => {
            const day = i + 1;
            const iso = `${year}-${String(month0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const level = levelMap.get(iso) ?? 0;
            const isToday = day === todayDate;
            const isFuture = day > todayDate;
            const canBackfill = !isFuture && !isToday && level === 0;
            return (
              <div key={day} onClick={canBackfill ? () => backfill(iso) : undefined}
                style={{
                  aspectRatio: "1", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontFamily: "var(--font-mono)",
                  background: level > 0 ? mixColor(habit.color, level) : "var(--surface-2)",
                  color: level > 0 ? "#fff" : "var(--text-muted)", // hex-allowlist (контраст-текст на залитой ячейке)
                  opacity: isFuture ? 0.3 : 1,
                  border: isToday ? `1.5px solid ${habit.color}` : "1.5px solid transparent",
                  cursor: canBackfill ? "pointer" : "default",
                }}>{day}</div>
            );
          })}
        </div>
        <div style={{ color: "var(--text-muted)", fontSize: 11 }}>Тап по прошлому пустому дню — отметить задним числом.</div>
      </div>
    </div>
  );
}

function EditHabitSheet({ habit, onClose, onSaved }: { habit: HabitOut; onClose: () => void; onSaved: (h: HabitOut) => void }) {
  const isCount = habit.mark_type === "count";
  const [name, setName] = useState(habit.name);
  const [color, setColor] = useState(habit.color);
  const [target, setTarget] = useState(habit.target != null ? String(habit.target) : "");
  const [unit, setUnit] = useState(habit.unit ?? "");
  const initStep = habit.step ?? 1;
  const [step, setStep] = useState(initStep);
  const [stepCustom, setStepCustom] = useState(!STEP_PRESETS.includes(initStep));
  const [customStep, setCustomStep] = useState(STEP_PRESETS.includes(initStep) ? "" : String(initStep));
  const [sched, setSched] = useState<"daily" | "weekly_n" | "by_days" | "goal_date">(
    (habit.schedule_kind as "daily" | "weekly_n" | "by_days" | "goal_date") || "daily");
  const [weeklyN, setWeeklyN] = useState(String(habit.schedule_n ?? 3));
  const [days, setDays] = useState<number[]>(habit.schedule_days ?? []);
  const [goalDate, setGoalDate] = useState(habit.goal_date ?? "");
  const [goalTotal, setGoalTotal] = useState(habit.goal_total != null ? String(habit.goal_total) : "");
  const toggleDay = (i: number) => setDays((p) => p.includes(i) ? p.filter((x) => x !== i) : [...p, i].sort());

  const save = async () => {
    if (!name.trim()) return;
    const eff = stepCustom ? (parseFloat(customStep.replace(",", ".")) || 1) : step;
    const patch: Parameters<typeof patchHabit>[1] = { name: name.trim(), color, schedule_kind: sched };
    if (isCount) { patch.target = parseFloat(target.replace(",", ".")) || null; patch.unit = unit.trim() || null; patch.step = eff; }
    // обнуляем поля чужих режимов, чтобы стрик-логика не цеплялась за остатки
    patch.schedule_n = sched === "weekly_n" ? (parseInt(weeklyN) || 3) : null;
    patch.schedule_days = sched === "by_days" ? days : null;
    patch.goal_date = sched === "goal_date" ? (goalDate || null) : null;
    patch.goal_total = sched === "goal_date" ? (parseInt(goalTotal) || null) : null;
    onSaved(await patchHabit(habit.id, patch));
  };
  return (
    <Sheet onClose={onClose}>
        <div className="sheet-title">Изменить привычку</div>
        <FieldLbl>Название</FieldLbl>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        {isCount && (
          <>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input className="input" placeholder="Норма/день" value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" />
              <input className="input" placeholder="Ед. (л/раз/мин)" value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
            <FieldLbl>Шаг +/−</FieldLbl>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {STEP_PRESETS.map((s) => (
                <Chip key={s} on={!stepCustom && step === s} onClick={() => { setStepCustom(false); setStep(s); }}>{s}</Chip>
              ))}
              <Chip on={stepCustom} onClick={() => setStepCustom(true)}>своё</Chip>
              {stepCustom && (
                <input className="input" style={{ flex: "1 1 80px", minWidth: 70 }} placeholder="шаг" value={customStep}
                  onChange={(e) => setCustomStep(e.target.value)} inputMode="decimal" />
              )}
            </div>
          </>
        )}

        <FieldLbl>Расписание</FieldLbl>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Chip on={sched === "daily"} onClick={() => setSched("daily")}>Ежедневно</Chip>
          <Chip on={sched === "weekly_n"} onClick={() => setSched("weekly_n")}>N×/нед</Chip>
          <Chip on={sched === "by_days"} onClick={() => setSched("by_days")}>По дням</Chip>
          <Chip on={sched === "goal_date"} onClick={() => setSched("goal_date")}>Цель к дате</Chip>
        </div>
        {sched === "weekly_n" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            <input className="input" style={{ width: 80 }} value={weeklyN} onChange={(e) => setWeeklyN(e.target.value)} inputMode="numeric" />
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>раз в неделю</span>
          </div>
        )}
        {sched === "by_days" && (
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            {WD.map((d, i) => (
              <button key={i} onClick={() => toggleDay(i)} style={{
                flex: 1, padding: "9px 0", borderRadius: 8, cursor: "pointer", fontSize: 12,
                border: days.includes(i) ? "1px solid var(--accent)" : "1px solid var(--border)",
                background: days.includes(i) ? "var(--accent-soft)" : "var(--surface-2)",
                color: days.includes(i) ? "var(--accent)" : "var(--text-muted)",
              }}>{d}</button>
            ))}
          </div>
        )}
        {sched === "goal_date" && (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input className="input" type="date" value={goalDate} onChange={(e) => setGoalDate(e.target.value)} />
            <input className="input" placeholder="дней (16)" value={goalTotal} onChange={(e) => setGoalTotal(e.target.value)} inputMode="numeric" />
          </div>
        )}

        <FieldLbl>Цвет</FieldLbl>
        <div style={{ display: "flex", gap: 10 }}>
          {HABIT_PALETTE.map((c) => (
            <button key={c} onClick={() => setColor(c)} aria-label={`цвет ${c}`}
              style={{ width: 30, height: 30, borderRadius: "50%", background: c, border: color === c ? "2.5px solid var(--text)" : "2.5px solid transparent", cursor: "pointer" }} />
          ))}
        </div>
        <button className="btn-primary" style={{ marginTop: 18, width: "100%" }} onClick={save}>Сохранить</button>
    </Sheet>
  );
}

// #4 — count-степпер-шит: −/+ по шагу + чипы-пресеты, сохраняет итог дня (backfill upsert).
// date = на какой день пишем (сегодня с карточки, или прошлый день из heatmap).
function CountStepSheet({ habit, date, onClose, onSaved }: { habit: HabitOut; date: string; onClose: () => void; onSaved: (h: HabitOut) => void }) {
  const isToday = date === todayISO();
  const step = habit.step ?? 1;
  const unit = habit.unit ? ` ${habit.unit}` : "";
  const round = (n: number) => Math.max(0, Math.round(n * 100) / 100);
  const [val, setVal] = useState<number>(round(isToday ? (habit.today_value ?? 0) : 0));
  const [saving, setSaving] = useState(false);
  const presets = [step, step * 2, habit.target ?? step * 4].filter((v, i, a) => v > 0 && a.indexOf(v) === i);
  const save = async () => {
    if (saving) return; setSaving(true);
    try { onSaved(await backfillHabit(habit.id, date, val)); } catch { setSaving(false); }
  };
  return (
    <Sheet onClose={onClose}>
        <div className="sheet-title">{habit.name} · {isToday ? "сегодня" : fmtEntryDate(date)}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "18px 0 10px" }}>
          <button className="hchk" style={{ ["--c" as string]: habit.color }} onClick={() => setVal((v) => round(v - step))} aria-label="Минус">−</button>
          <div style={{ flex: 1, textAlign: "center" }}>
            <span style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{val}</span>
            <small style={{ color: "var(--text-muted)", fontSize: 14 }}>{habit.target ? ` / ${habit.target}${unit}` : unit}</small>
          </div>
          <button className="hchk done" style={{ ["--c" as string]: habit.color }} onClick={() => setVal((v) => round(v + step))} aria-label="Плюс">+</button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {presets.map((p) => (
            <button key={p} onClick={() => setVal((v) => round(v + p))}
              style={{ flex: "1 1 0", minWidth: 70, padding: "9px 6px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", cursor: "pointer", fontSize: 13 }}>
              + {p}{unit}
            </button>
          ))}
        </div>
        <button className="btn-primary" style={{ width: "100%" }} disabled={saving} onClick={save}>{saving ? "Сохраняю…" : "Сохранить"}</button>
    </Sheet>
  );
}

// #5 — контекст-меню привычки (long-press): Изменить / Архивировать / Удалить.
const IcoArchive = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" /><path d="M10 12h4" />
  </svg>
);

function HabitMenuSheet({ habit, onClose, onEdit, onArchive, onDelete }: {
  habit: HabitOut; onClose: () => void; onEdit: (h: HabitOut) => void; onArchive: (h: HabitOut) => void; onDelete: (h: HabitOut) => void;
}) {
  const Item = ({ icon, label, fn, danger }: { icon: ReactNode; label: string; fn: () => void; danger?: boolean }) => (
    <button className="hmenu-item" data-danger={danger ? "" : undefined} onClick={fn}>
      <span className="hmenu-ico">{icon}</span>
      <span>{label}</span>
    </button>
  );
  return (
    <Sheet onClose={onClose}>
      <div className="hmenu-list">
        <Item icon={<IcoEdit />} label="Изменить" fn={() => onEdit(habit)} />
        <Item icon={<IcoArchive />} label="Архивировать" fn={() => onArchive(habit)} />
        <Item icon={<IcoTrash />} label="Удалить привычку" fn={() => onDelete(habit)} danger />
      </div>
    </Sheet>
  );
}

// меню метрики (long-press / ⋯) — карточки-действия с иконками, как у привычки.
function MetricMenuSheet({ metric, onClose, onEdit, onDelete }: {
  metric: MetricOut; onClose: () => void; onEdit: (m: MetricOut) => void; onDelete: (m: MetricOut) => void;
}) {
  return (
    <Sheet onClose={onClose}>
      <div className="hmenu-list">
        <button className="hmenu-item" onClick={() => onEdit(metric)}>
          <span className="hmenu-ico"><IcoEdit /></span><span>Изменить</span>
        </button>
        <button className="hmenu-item" data-danger="" onClick={() => onDelete(metric)}>
          <span className="hmenu-ico"><IcoTrash /></span><span>Удалить метрику</span>
        </button>
      </div>
    </Sheet>
  );
}

// Общие поля формы метрики (Новая/Изменить) — единый чистый макет с подписями.
function MetricFields({ name, setName, unit, setUnit, dir, setDir, color, setColor, namePlaceholder }: {
  name: string; setName: (v: string) => void; unit: string; setUnit: (v: string) => void;
  dir: "up" | "down"; setDir: (v: "up" | "down") => void; color: string; setColor: (v: string) => void;
  namePlaceholder?: string;
}) {
  return (
    <div className="mxform">
      <div className="fld">
        <div className="lab">Название</div>
        <input className="minp" placeholder={namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>

      <div className="two">
        <div className="fld">
          <div className="lab">Единица</div>
          <input className="minp" placeholder="кг" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>
        <div className="fld">
          <div className="lab">«Хорошо» это</div>
          <div className="fseg">
            <button className={dir === "down" ? "on" : ""} onClick={() => setDir("down")}>↓ меньше</button>
            <button className={dir === "up" ? "on" : ""} onClick={() => setDir("up")}>↑ больше</button>
          </div>
        </div>
      </div>

      <div className="fld" style={{ marginBottom: 0 }}>
        <div className="lab">Цвет линии</div>
        <div className="pal">
          {METRIC_PALETTE.map((c) => (
            <button key={c} className={color === c ? "on" : ""} onClick={() => setColor(c)}
              aria-label={`цвет ${c}`} style={{ background: c }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function NewMetricSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (m: MetricOut) => void }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [dir, setDir] = useState<"up" | "down">("down");
  const [color, setColor] = useState(METRIC_PALETTE[0]); // #7 — цвет линии графика
  const submit = async () => {
    if (!name.trim()) return;
    onCreated(await createMetric({ name: name.trim(), unit: unit.trim() || null, good_direction: dir, color }));
  };
  return (
    <Sheet onClose={onClose}>
        <div className="sheet-title">Новая метрика</div>
        <MetricFields name={name} setName={setName} unit={unit} setUnit={setUnit}
          dir={dir} setDir={setDir} color={color} setColor={setColor} namePlaceholder="Напр. «Вес»" />
        <button className="btn-primary" style={{ marginTop: 20, width: "100%" }} onClick={submit}>Создать метрику</button>
    </Sheet>
  );
}

// #8 — деталь метрики: график + период (7/30/Год) + лог замеров (свайп-удалить) + замер + edit/delete.
function MetricDetail({ metric, onClose, onChange, onMenu }: {
  metric: MetricOut; onClose: () => void; onChange: (m: MetricOut) => void; onMenu: (m: MetricOut) => void;
}) {
  const [period, setPeriod] = useState<7 | 30 | 365>(30);
  const [measuring, setMeasuring] = useState(false);
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - period);
  const inRange = metric.entries.filter((e) => new Date(e.entry_date + "T00:00:00") >= cutoff);
  const chrono = [...inRange].reverse(); // старые→новые для графика
  const pts = sparkPoints(chrono.map((e) => e.value));
  const good = metric.delta == null ? null : (metric.good_direction === "down" ? metric.delta < 0 : metric.delta > 0);

  const delEntry = (date: string) => {
    confirmDialog(`Удалить замер за ${date}?`).then(async (ok) => {
      if (!ok) return;
      try { onChange(await deleteMetricEntry(metric.id, date)); } catch { /* ignore */ }
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "var(--bg)", display: "flex", flexDirection: "column", paddingTop: "env(safe-area-inset-top)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 12px 10px", borderBottom: "1px solid var(--border)" }}>
        <button onClick={onClose} aria-label="Назад" style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 28, lineHeight: 1, cursor: "pointer", width: 36 }}>‹</button>
        <span style={{ fontWeight: 600 }}>Метрика</span>
        <button onClick={() => onMenu(metric)} aria-label="Действия" style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", width: 36, fontSize: 22 }}>⋯</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px 28px" }}>
        <div style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 20 }}>{metric.name}</h3>
          <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 3 }}>
            {metric.latest ?? "—"} {metric.unit}
            {metric.delta != null && (
              <span style={{ color: good ? "var(--success)" : "var(--text-muted)", marginLeft: 8 }}>
                {metric.delta < 0 ? "▼" : "▲"}{Math.abs(metric.delta).toFixed(1)} за период
              </span>
            )}
          </div>
        </div>
        <svg width="100%" height="80" viewBox="0 0 120 30" preserveAspectRatio="none" style={{ marginBottom: 8 }}>
          {pts ? <polyline points={pts} fill="none" stroke={metric.color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            : <text x="60" y="16" textAnchor="middle" fontSize="6" fill="var(--text-muted)">нет данных</text>}
        </svg>
        <div className="seg" style={{ marginBottom: 16 }}>
          <button className={period === 7 ? "seg-on" : ""} onClick={() => setPeriod(7)}>7д</button>
          <button className={period === 30 ? "seg-on" : ""} onClick={() => setPeriod(30)}>30д</button>
          <button className={period === 365 ? "seg-on" : ""} onClick={() => setPeriod(365)}>Год</button>
        </div>
        <button className="btn-primary" style={{ width: "100%", marginBottom: 18 }} onClick={() => setMeasuring(true)}>+ Замер</button>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 8 }}>Лог замеров</div>
        {inRange.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Нет замеров за период.</div>
        ) : inRange.map((e) => (
          <div key={e.entry_date} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 2px", borderBottom: "1px solid var(--border)", fontSize: 14 }}>
            <span style={{ color: "var(--text-muted)" }}>{fmtEntryDate(e.entry_date)}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <b>{e.value} {metric.unit}</b>
              <button onClick={() => delEntry(e.entry_date)} aria-label="Удалить замер"
                style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 16, opacity: 0.7 }}>✕</button>
            </span>
          </div>
        ))}
      </div>
      {measuring && <MeasureSheet metric={metric} onClose={() => setMeasuring(false)} onSaved={(m) => { onChange(m); setMeasuring(false); }} />}
    </div>
  );
}

const ENTRY_MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
function fmtEntryDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((t.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "сегодня";
  if (diff === 1) return "вчера";
  return `${d.getDate()} ${ENTRY_MONTHS[d.getMonth()]}`;
}

function EditMetricSheet({ metric, onClose, onSaved }: { metric: MetricOut; onClose: () => void; onSaved: (m: MetricOut) => void }) {
  const [name, setName] = useState(metric.name);
  const [unit, setUnit] = useState(metric.unit ?? "");
  const [dir, setDir] = useState<"up" | "down">(metric.good_direction === "down" ? "down" : "up");
  const [color, setColor] = useState(metric.color);
  const save = async () => {
    if (!name.trim()) return;
    onSaved(await patchMetric(metric.id, { name: name.trim(), unit: unit.trim() || null, good_direction: dir, color }));
  };
  return (
    <Sheet onClose={onClose}>
        <div className="sheet-title">Изменить метрику</div>
        <MetricFields name={name} setName={setName} unit={unit} setUnit={setUnit}
          dir={dir} setDir={setDir} color={color} setColor={setColor} namePlaceholder="Название метрики" />
        <button className="btn-primary" style={{ marginTop: 20, width: "100%" }} onClick={save}>Сохранить</button>
    </Sheet>
  );
}
