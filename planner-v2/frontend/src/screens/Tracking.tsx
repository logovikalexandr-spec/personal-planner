import { useState } from "react";
import { Empty } from "../components/Empty";

// ── Форк E (T5 Привычки): статичный экран по мокапу база-проекта-v3/pages/T5-habits.html.
// Бэкенда Habit/Metric пока нет — данные замоканы (выбор владельца: «только фронт, статикой»).
// Метрики держим как ОБЩУЮ сущность (любое число), не хардкод 3 полей. Без emoji (DESIGN §8).

type View = "habits" | "metrics" | "retro";

const C_ZIMA = "#3FB68B";
const C_HEALTH = "#5B8DEF";
const C_PLAN = "#9B6BE0";
const C_EMBER = "#EE8A3C";

interface WeekHabit {
  id: number; name: string; color: string; streak: number;
  ringPct: number; doneToday: boolean; kind: "week";
  week: boolean[]; weekDone: number;
}
interface GoalHabit {
  id: number; name: string; color: string; streak: number;
  ringPct: number; doneToday: boolean; kind: "goal";
  goalNote: string; done: number; total: number;
}
type Habit = WeekHabit | GoalHabit;

const HABITS: Habit[] = [
  { id: 1, name: "Зарядка + валик", color: C_HEALTH, streak: 12, ringPct: 0.83, doneToday: true,
    kind: "week", week: [true, true, true, true, true, false, false], weekDone: 5 },
  { id: 2, name: "Без травы", color: C_ZIMA, streak: 8, ringPct: 0.5, doneToday: true,
    kind: "goal", goalNote: "цель к 22.06", done: 8, total: 16 },
  { id: 3, name: "Медитация", color: C_PLAN, streak: 4, ringPct: 0.29, doneToday: false,
    kind: "week", week: [true, true, false, true, true, true, false], weekDone: 4 },
  { id: 4, name: "Чтение 20 мин", color: C_EMBER, streak: 6, ringPct: 0.62, doneToday: true,
    kind: "week", week: [true, true, true, true, true, true, false], weekDone: 6 },
];

const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

interface HeatRow { name: string; levels: number[] }
const HEAT: HeatRow[] = [
  { name: "Зарядка", levels: [4, 4, 3, 4, 4, 1, 0] },
  { name: "Без травы", levels: [4, 4, 4, 3, 4, 4, 4] },
  { name: "Медитация", levels: [2, 3, 0, 2, 3, 1, 0] },
  { name: "Чтение", levels: [3, 4, 2, 3, 4, 3, 0] },
  { name: "Вода 2л", levels: [1, 2, 1, 0, 2, 1, 0] },
];

interface Metric {
  id: number; name: string; unit: string; value: string;
  delta?: string; deltaDir?: "up" | "down"; color: string; points: string; wide?: boolean;
}
const METRICS: Metric[] = [
  { id: 1, name: "Вес", unit: "кг", value: "78.2", delta: "0.4", deltaDir: "down", color: C_ZIMA,
    points: "0,8 20,7 40,11 60,9 80,14 100,15 120,18" },
  { id: 2, name: "Сон", unit: "ч", value: "6.8", delta: "0.5", deltaDir: "up", color: C_HEALTH,
    points: "0,16 20,18 40,13 60,15 80,10 100,12 120,7" },
  { id: 3, name: "Настроение", unit: "/ 10", value: "7", delta: "1", deltaDir: "up", color: C_EMBER,
    points: "0,15 40,17 80,12 120,14 160,9 200,11 240,7 280,8", wide: true },
];

const RING_R = 19;
const RING_CIRC = 2 * Math.PI * RING_R; // ≈119.38

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
  const offset = RING_CIRC * (1 - pct);
  return (
    <div className="sring">
      <svg width="46" height="46" viewBox="0 0 46 46">
        <circle cx="23" cy="23" r={RING_R} fill="none" stroke="#2c2d31" strokeWidth="4" />
        <circle
          cx="23" cy="23" r={RING_R} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={RING_CIRC} strokeDashoffset={offset}
        />
      </svg>
      <div className="num" style={{ color }}>{num}</div>
    </div>
  );
}

function HabitCard({ h, onToggle }: { h: Habit; onToggle: (id: number) => void }) {
  return (
    <div className="hcard" style={{ ["--c" as string]: h.color }}>
      <div className="hc-row">
        <StreakRing pct={h.ringPct} num={h.streak} color={h.color} />
        <div className="hc-body">
          <div className="hc-name">{h.name}</div>
          <div className="hc-streak">
            <Flame />
            <span><b>{h.streak} {h.streak === 1 ? "день" : "дней"}</b>{" "}
              {h.kind === "goal" ? `· ${h.goalNote}` : h.doneToday ? "подряд" : "· сегодня ещё нет"}
            </span>
          </div>
        </div>
        <button
          className={"hchk" + (h.doneToday ? " done" : "")}
          style={{ ["--c" as string]: h.color }}
          onClick={() => onToggle(h.id)}
          aria-label={h.doneToday ? "Снять отметку" : "Отметить выполнено"}
        >
          {h.doneToday && <Check />}
        </button>
      </div>

      {h.kind === "week" ? (
        <div className="wkrow">
          {h.week.map((on, i) => (
            <i key={i} className={on ? "fill" : ""} style={{ ["--c" as string]: h.color }} />
          ))}
          <span className="wklbl">{h.weekDone} / 7 за неделю</span>
        </div>
      ) : (
        <>
          <div className="hpbar"><i style={{ width: `${(h.done / h.total) * 100}%` }} /></div>
          <div className="hpgoal">
            до цели: <b>{h.done} / {h.total} дней</b> · осталось {h.total - h.done}
          </div>
        </>
      )}
    </div>
  );
}

function HabitsView({ habits, onToggle }: { habits: Habit[]; onToggle: (id: number) => void }) {
  if (habits.length === 0) {
    return <Empty text="Пока нет привычек. Добавь первую рутину — стрик начнётся с первого дня." />;
  }
  return (
    <>
      <div className="trk-seclbl">Сегодня · 6 июня</div>
      {habits.map((h) => <HabitCard key={h.id} h={h} onToggle={onToggle} />)}

      <div className="trk-seclbl">Тепловая карта</div>
      <div className="heat">
        <div className="htitle">Последние 7 дней · {HEAT.length} привычек</div>
        <div className="hgrid">
          <div className="hd" />
          {WD.map((d) => <div className="hd" key={d}>{d}</div>)}
          {HEAT.map((row) => (
            <Row key={row.name} row={row} />
          ))}
        </div>
        <div className="hleg">
          меньше <span className="lv0" /><span className="lv1" /><span className="lv2" /><span className="lv3" /><span className="lv4" /> больше
        </div>
      </div>
    </>
  );
}

function Row({ row }: { row: HeatRow }) {
  return (
    <>
      <div className="rn">{row.name}</div>
      {row.levels.map((lv, i) => <div key={i} className={`cell lv${lv}`} />)}
    </>
  );
}

function MetricsView({ metrics }: { metrics: Metric[] }) {
  if (metrics.length === 0) {
    return <Empty text="Нет метрик. Заведи любое число — вес, сон, настроение — и следи за трендом." />;
  }
  return (
    <>
      <div className="trk-seclbl">Метрики недели</div>
      <div className="mgrid">
        {metrics.map((m) => {
          const wide = m.wide ?? false;
          const vw = wide ? 280 : 120;
          return (
            <div key={m.id} className={"mcard" + (wide ? " wide" : "")}>
              <div className="m-lbl">{m.name}</div>
              <div className="m-val">
                {m.value}<small> {m.unit}</small>
                {m.delta && (
                  <span className={"m-delta " + m.deltaDir}>
                    {m.deltaDir === "down" ? "▼" : "▲"}{m.delta}
                  </span>
                )}
              </div>
              <svg className="m-spark" width="100%" height="26" viewBox={`0 0 ${vw} 26`} preserveAspectRatio="none">
                <polyline points={m.points} fill="none" stroke={m.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          );
        })}
      </div>
    </>
  );
}

function RetroView() {
  return (
    <>
      <div className="trk-seclbl">Итог недели</div>
      <button className="retro" onClick={() => { /* TODO: полный обзор недели */ }}>
        <span className="rl">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 19V9M9 19V5M14 19v-7M19 19V8" />
          </svg>
        </span>
        <span className="rb">
          <span className="rt">Ретро недели</span>
          <span className="rs"><b>12 / 18 целей</b> · хайлайт: первая медитация после паузы</span>
        </span>
        <span className="rchev">›</span>
      </button>
    </>
  );
}

export function Tracking() {
  const [view, setView] = useState<View>("habits");
  const [habits, setHabits] = useState<Habit[]>(HABITS);

  function toggle(id: number) {
    setHabits((prev) =>
      prev.map((h) => {
        if (h.id !== id) return h;
        const doneToday = !h.doneToday;
        const streak = doneToday ? h.streak + 1 : Math.max(0, h.streak - 1);
        return { ...h, doneToday, streak };
      }),
    );
  }

  return (
    <div className="screen">
      <div className="screen-hero">
        <h1>Привычки</h1>
        <div className="date">июнь · нед 23</div>
      </div>

      <div className="seg">
        <button className={view === "habits" ? "seg-on" : ""} onClick={() => setView("habits")}>Привычки</button>
        <button className={view === "metrics" ? "seg-on" : ""} onClick={() => setView("metrics")}>Метрики</button>
        <button className={view === "retro" ? "seg-on" : ""} onClick={() => setView("retro")}>Ретро</button>
      </div>

      {view === "habits" && <HabitsView habits={habits} onToggle={toggle} />}
      {view === "metrics" && <MetricsView metrics={METRICS} />}
      {view === "retro" && <RetroView />}
    </div>
  );
}
