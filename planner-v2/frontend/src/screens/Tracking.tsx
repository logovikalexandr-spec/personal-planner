import { useCallback, useEffect, useRef, useState } from "react";
import { Empty } from "../components/Empty";
import { TaskItem } from "../components/TaskItem";
import { tg } from "../telegram";
import {
  addHabit, backfillHabit, completeTask, createHabit, createMetric, deleteHabit, deleteMetric,
  getHabits, getMetrics, getRetro, measureMetric, toggleHabit, type RetroOut,
} from "../api";
import type { HabitOut, MetricOut, Task } from "../types";

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
        <circle cx="23" cy="23" r={RING_R} fill="none" stroke="#2c2d31" strokeWidth="4" />
        <circle cx="23" cy="23" r={RING_R} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={RING_CIRC} strokeDashoffset={offset} />
      </svg>
      <div className="num" style={{ color }}>{num}</div>
    </div>
  );
}

function HabitCard({ h, onToggle, onAdd, onDelete }: {
  h: HabitOut; onToggle: (h: HabitOut) => void; onAdd: (h: HabitOut) => void; onDelete: (h: HabitOut) => void;
}) {
  const weekDone = h.week.filter(Boolean).length;
  const isGoal = h.goal_total != null && h.goal_total > 0;
  const isCount = h.mark_type === "count";
  const pct = isGoal ? h.streak / (h.goal_total as number) : weekDone / 7;
  const press = useRef<number | null>(null);
  const longStart = () => { press.current = window.setTimeout(() => onDelete(h), 550); };
  const longEnd = () => { if (press.current) { clearTimeout(press.current); press.current = null; } };

  return (
    <div className="hcard" style={{ ["--c" as string]: h.color }}
      onPointerDown={longStart} onPointerUp={longEnd} onPointerLeave={longEnd}>
      <div className="hc-row">
        <StreakRing pct={pct} num={h.streak} color={h.color} />
        <div className="hc-body">
          <div className="hc-name">{h.name}</div>
          <div className="hc-streak">
            <Flame />
            <span><b>{h.streak} {h.streak === 1 ? "день" : "дней"}</b>{" "}
              {isGoal ? `· цель ${h.goal_total}` : h.done_today ? "подряд" : "· сегодня ещё нет"}
            </span>
          </div>
        </div>
        {isCount ? (
          <button className="hchk" style={{ ["--c" as string]: h.color }} onClick={() => onAdd(h)}
            aria-label="Добавить замер">+</button>
        ) : (
          <button className={"hchk" + (h.done_today ? " done" : "")} style={{ ["--c" as string]: h.color }}
            onClick={() => onToggle(h)} aria-label={h.done_today ? "Снять отметку" : "Отметить выполнено"}>
            {h.done_today && <Check />}
          </button>
        )}
      </div>

      {isCount ? (
        <div className="hpgoal">
          сегодня: <b>{h.today_value}{h.unit ? ` ${h.unit}` : ""}</b>
          {h.target ? ` / ${h.target}${h.unit ? ` ${h.unit}` : ""}` : ""}
        </div>
      ) : isGoal ? (
        <>
          <div className="hpbar"><i style={{ width: `${Math.min(100, pct * 100)}%` }} /></div>
          <div className="hpgoal">до цели: <b>{h.streak} / {h.goal_total} дней</b></div>
        </>
      ) : (
        <div className="wkrow">
          {h.week.map((on, i) => <i key={i} className={on ? "fill" : ""} style={{ ["--c" as string]: h.color }} />)}
          <span className="wklbl">{weekDone} / 7 за неделю</span>
        </div>
      )}
    </div>
  );
}

function HabitsView({ habits, onToggle, onAdd, onDelete, onNew }: {
  habits: HabitOut[]; onToggle: (h: HabitOut) => void; onAdd: (h: HabitOut) => void;
  onDelete: (h: HabitOut) => void; onNew: () => void;
}) {
  if (habits.length === 0) {
    return <Empty text="Пока нет привычек. Заведи первую рутину — стрик начнётся с сегодня."
      action={<button className="btn-primary" onClick={onNew}>Новая привычка</button>} />;
  }
  return (
    <>
      <div className="trk-seclbl" style={{ display: "flex", justifyContent: "space-between" }}>
        <span>Сегодня</span><button className="lnk" onClick={onNew}>+ Привычка</button>
      </div>
      {habits.map((h) => (
        <HabitCard key={h.id} h={h} onToggle={onToggle} onAdd={onAdd} onDelete={onDelete} />
      ))}

      <div className="trk-seclbl">Тепловая карта</div>
      <div className="heat">
        <div className="hgrid">
          <div className="hd" />
          {WD.map((d) => <div className="hd" key={d}>{d}</div>)}
          {habits.map((h) => (
            <HeatRow key={h.id} name={h.name} levels={h.heat7} />
          ))}
        </div>
        <div className="hleg">
          меньше <span className="lv0" /><span className="lv1" /><span className="lv2" /><span className="lv3" /><span className="lv4" /> больше
        </div>
      </div>
    </>
  );
}

function HeatRow({ name, levels }: { name: string; levels: number[] }) {
  return (
    <>
      <div className="rn">{name}</div>
      {levels.map((lv, i) => <div key={i} className={`cell lv${lv}`} />)}
    </>
  );
}

function MetricsView({ metrics, onMeasure, onDelete, onNew }: {
  metrics: MetricOut[]; onMeasure: (m: MetricOut) => void; onDelete: (m: MetricOut) => void; onNew: () => void;
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
      <div className="mgrid">
        {metrics.map((m) => {
          const pts = sparkPoints(m.entries.map((e) => e.value).reverse());
          const dir = m.delta == null ? null : (m.good_direction === "down" ? m.delta < 0 : m.delta > 0) ? "up" : "down";
          const press = { id: m.id };
          return (
            <div key={m.id} className="mcard" onClick={() => onMeasure(m)}
              onContextMenu={(e) => { e.preventDefault(); onDelete(m); }}
              data-id={press.id}>
              <div className="m-lbl">{m.name}</div>
              <div className="m-val">
                {m.latest ?? "—"}<small> {m.unit}</small>
                {m.delta != null && dir && (
                  <span className={"m-delta " + dir}>{m.delta < 0 ? "▼" : "▲"}{Math.abs(m.delta).toFixed(1)}</span>
                )}
              </div>
              <svg className="m-spark" width="100%" height="26" viewBox="0 0 120 26" preserveAspectRatio="none">
                <polyline points={pts} fill="none" stroke={m.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          );
        })}
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
        <circle cx="25" cy="25" r={r} fill="none" stroke="#2c2d31" strokeWidth="5" />
        <circle cx="25" cy="25" r={r} fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent)" }}>
        {Math.round(pct * 100)}%
      </div>
    </div>
  );
}

function RetroView({ retro, metrics, onTaskToggle }: { retro: RetroOut | null; metrics: MetricOut[]; onTaskToggle: (t: Task) => void }) {
  const [odOpen, setOdOpen] = useState(true);
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
            <div key={p.project_id ?? "inbox"} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 0", borderBottom: i < tasks.by_project.length - 1 ? "1px solid var(--hairline)" : "none", fontSize: 13.5 }}>
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
          <button onClick={() => setOdOpen((v) => !v)} style={{ width: "100%", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0 9px", color: "var(--red)", fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".4px" }}>
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
          {h.tag && <span className="imp" style={{ color: h.tag.startsWith("рекорд") ? "var(--accent)" : h.tag === "слабое" ? "var(--red)" : "#3FB68B" }}>{h.tag}</span>}
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
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: i < metrics.length - 1 ? "1px solid var(--hairline)" : "none", fontSize: 13.5 }}>
                  <span>{m.name}{m.good_direction === "up" ? <span style={{ color: "var(--text-muted)", fontSize: 11 }}> · цель ↑</span> : null}</span>
                  {m.delta != null && (
                    <span className="mono" style={{ fontWeight: 600, color: good ? "#3FB68B" : "var(--text-muted)" }}>
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2" strokeLinecap="round" style={{ flex: "0 0 auto", marginTop: 1 }}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" /></svg>
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
  async function onAdd(h: HabitOut) {
    tg()?.HapticFeedback?.impactOccurred?.("light");
    try { replaceHabit(await addHabit(h.id, todayISO(), h.step ?? 1)); } catch { load(); }
  }
  function onDeleteHabit(h: HabitOut) {
    tg()?.showConfirm?.(`Удалить «${h.name}»? Стрики и история сотрутся.`, async (ok: boolean) => {
      if (!ok) return;
      try { await deleteHabit(h.id); setHabits((p) => p.filter((x) => x.id !== h.id)); } catch { load(); }
    });
  }
  function onMeasure(m: MetricOut) {
    const raw = window.prompt(`Замер «${m.name}»${m.unit ? ` (${m.unit})` : ""}:`, m.latest != null ? String(m.latest) : "");
    if (raw == null) return;
    const v = parseFloat(raw.replace(",", "."));
    if (Number.isNaN(v)) return;
    measureMetric(m.id, todayISO(), v).then(replaceMetric).catch(load);
  }
  function onDeleteMetric(m: MetricOut) {
    tg()?.showConfirm?.(`Удалить метрику «${m.name}»?`, async (ok: boolean) => {
      if (!ok) return;
      try { await deleteMetric(m.id); setMetrics((p) => p.filter((x) => x.id !== m.id)); } catch { load(); }
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

      {view === "habits" && <HabitsView habits={habits} onToggle={onToggle} onAdd={onAdd} onDelete={onDeleteHabit} onNew={() => setSheet("habit")} />}
      {view === "metrics" && <MetricsView metrics={metrics} onMeasure={onMeasure} onDelete={onDeleteMetric} onNew={() => setSheet("metric")} />}
      {view === "retro" && <RetroView retro={retro} metrics={metrics} onTaskToggle={onOverdueDone} />}

      {sheet === "habit" && <NewHabitSheet onClose={() => setSheet(null)} onCreated={(h) => { setHabits((p) => [...p, h]); setSheet(null); }} />}
      {sheet === "metric" && <NewMetricSheet onClose={() => setSheet(null)} onCreated={(m) => { setMetrics((p) => [...p, m]); setSheet(null); }} />}
    </div>
  );
}

function NewHabitSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (h: HabitOut) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"check" | "count">("check");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("");
  const submit = async () => {
    if (!name.trim()) return;
    const h = await createHabit({
      name: name.trim(), mark_type: type,
      target: type === "count" ? parseFloat(target.replace(",", ".")) || null : null,
      unit: type === "count" ? unit.trim() || null : null,
      step: type === "count" ? 0.5 : null,
    });
    onCreated(h);
  };
  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-title">Новая привычка</div>
        <input className="input" placeholder="Напр. «Бег утром»" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className="seg" style={{ marginTop: 10 }}>
          <button className={type === "check" ? "seg-on" : ""} onClick={() => setType("check")}>Галка</button>
          <button className={type === "count" ? "seg-on" : ""} onClick={() => setType("count")}>Число</button>
        </div>
        {type === "count" && (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input className="input" placeholder="Норма (8)" value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" />
            <input className="input" placeholder="Ед. (стак/л)" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
        )}
        <button className="btn-primary" style={{ marginTop: 14, width: "100%" }} onClick={submit}>Создать привычку</button>
      </div>
    </div>
  );
}

function NewMetricSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (m: MetricOut) => void }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [dir, setDir] = useState<"up" | "down">("up");
  const submit = async () => {
    if (!name.trim()) return;
    onCreated(await createMetric({ name: name.trim(), unit: unit.trim() || null, good_direction: dir }));
  };
  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-title">Новая метрика</div>
        <input className="input" placeholder="Напр. «Вес»" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input className="input" placeholder="Ед. (кг)" value={unit} onChange={(e) => setUnit(e.target.value)} />
          <div className="seg" style={{ flex: 1 }}>
            <button className={dir === "down" ? "seg-on" : ""} onClick={() => setDir("down")}>↓ меньше</button>
            <button className={dir === "up" ? "seg-on" : ""} onClick={() => setDir("up")}>↑ больше</button>
          </div>
        </div>
        <button className="btn-primary" style={{ marginTop: 14, width: "100%" }} onClick={submit}>Создать метрику</button>
      </div>
    </div>
  );
}
