import { useCallback, useEffect, useState } from "react";
import "./../nutrition.css";
import {
  type NDay, type NMeal, type NMealCreate, type NTarget, type NWeekDay,
  nAddMeal, nDeleteMeal, nGetDay, nGetWeek, nSetTarget, nSetStatus, nUpdateMeal,
} from "../api";
import { clientToday } from "../lib/clientDate";
import { MealSheet } from "./MealSheet";
import { TargetSheet } from "./TargetSheet";

/* Модуль «Питание» (скелет v1). Цель→День→Приём + Неделя. Данные с бэка. */

const svg = (d: React.ReactNode, w = 22) => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const IcoChev = () => svg(<path d="M9 6l6 6-6 6" />, 18);
const IcoCheck = () => svg(<path d="M5 12l5 5L20 7" />, 15);
const IcoArrow = () => svg(<path d="M5 12h14M13 6l6 6-6 6" />, 15);
const IcoBack = () => svg(<path d="M15 18l-6-6 6-6" />, 22);
const IcoBars = () => svg(<><path d="M8 21V9" /><path d="M16 21V5" /><path d="M12 21v-6" /></>, 20);
const IcoPlus = () => svg(<><path d="M12 5v14" /><path d="M5 12h14" /></>, 18);
const IcoGear = () => svg(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>, 18);

const WD = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const WD_FULL = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const MON = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function parse(iso: string): Date { return new Date(iso + "T00:00:00"); }
function isoOf(d: Date): string { const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
function addDays(iso: string, n: number): string { const d = parse(iso); d.setDate(d.getDate() + n); return isoOf(d); }
function mondayOf(iso: string): string { const d = parse(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoOf(d); }
function fmtDM(iso: string): string { const d = parse(iso); return `${d.getDate()} ${MON[d.getMonth()]}`; }
function weekdayFull(iso: string): string { return WD_FULL[parse(iso).getDay()]; }

type Totals = { kcal: number; protein: number; fat: number; carb: number };
function sumDone(meals: NMeal[]): Totals {
  return meals.filter((m) => m.status === "done").reduce(
    (a, m) => ({ kcal: a.kcal + m.kcal, protein: a.protein + m.protein, fat: a.fat + m.fat, carb: a.carb + m.carb }),
    { kcal: 0, protein: 0, fat: 0, carb: 0 });
}
function pct(n: number, d: number): number { return d > 0 ? Math.round((n / d) * 100) : 0; }

function Ring({ value }: { value: number }) {
  const r = 42, C = 2 * Math.PI * r, off = C * (1 - Math.min(value, 100) / 100);
  return (
    <div className="nut-ring">
      <svg width="92" height="92">
        <circle cx="46" cy="46" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="9" />
        <circle cx="46" cy="46" r={r} fill="none" stroke="var(--accent)" strokeWidth="9" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} />
      </svg>
      <div className="ring-pct">{value}%</div>
    </div>
  );
}

function DayCard({ day }: { day: NDay }) {
  const t = sumDone(day.meals);
  const tg = day.target;
  const left = (a: number, b: number) => Math.max(b - a, 0);
  return (
    <div className="nut-card">
      <div className="nut-day-main">
        <Ring value={pct(t.kcal, tg.kcal)} />
        <div className="nut-kcal">
          <div className="nut-kcal-row"><span className="mono">{t.kcal}</span> <span className="muted">/ {tg.kcal} ккал</span></div>
          <div className="nut-bar"><span style={{ width: `${Math.min(pct(t.kcal, tg.kcal), 100)}%` }} /></div>
          <div className="nut-macros">
            <div className="nut-macro p"><div className="m-top"><b>Б</b> {t.protein}<span className="muted">/{tg.protein} г</span></div><div className="m-pct">{pct(t.protein, tg.protein)}%</div></div>
            <div className="nut-macro c"><div className="m-top"><b>У</b> {t.carb}<span className="muted">/{tg.carb} г</span></div><div className="m-pct">{pct(t.carb, tg.carb)}%</div></div>
            <div className="nut-macro f"><div className="m-top"><b>Ж</b> {t.fat}<span className="muted">/{tg.fat} г</span></div><div className="m-pct">{pct(t.fat, tg.fat)}%</div></div>
          </div>
        </div>
      </div>
      <div className="nut-left">
        <div className="ll">До цели осталось</div>
        <div className="nut-left-items">
          <span><i className="dot p" /> {left(t.protein, tg.protein)} г белка</span>
          <span><i className="dot c" /> {left(t.carb, tg.carb)} г углеводов</span>
          <span><i className="dot f" /> {left(t.fat, tg.fat)} г жиров</span>
          <span><i className="dot k" /> ≈ {left(t.kcal, tg.kcal)} ккал</span>
        </div>
      </div>
    </div>
  );
}

function mealEmoji(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("завтрак")) return "🥣";
  if (n.includes("гейнер") || n.includes("трен")) return "🥤";
  if (n.includes("обед")) return "🍗";
  if (n.includes("ужин")) return "🐟";
  if (n.includes("перекус")) return "🫐";
  if (n.includes("сном")) return "🧀";
  return "🍽";
}

export function Nutrition({ goalId, goalName, onBack }: { goalId: number; goalName: string; onBack: () => void }) {
  const today = clientToday();
  const [view, setView] = useState<{ s: "over" } | { s: "day" } | { s: "week" } | { s: "meal"; i: number }>({ s: "over" });
  const [date, setDate] = useState(today);
  const [day, setDay] = useState<NDay | null>(null);
  const [week, setWeek] = useState<NWeekDay[]>([]);
  const [ready, setReady] = useState(false);
  const [sheet, setSheet] = useState<{ s: "add" } | { s: "edit"; meal: NMeal } | { s: "target" } | null>(null);

  const monday = mondayOf(today);

  const load = useCallback(async () => {
    const [d, w] = await Promise.all([nGetDay(goalId, date), nGetWeek(goalId, monday)]);
    setDay(d); setWeek(w); setReady(true);
  }, [goalId, date, monday]);

  useEffect(() => { void load(); }, [load]);

  const weekByDate = Object.fromEntries(week.map((d) => [d.date, d]));
  const target = day?.target ?? { kcal: 0, protein: 0, fat: 0, carb: 0 };

  const toggleMeal = async (m: NMeal) => {
    await nSetStatus(m.id, m.status === "done" ? "planned" : "done");
    await load();
  };
  const addMeal = async (body: NMealCreate) => { await nAddMeal(goalId, date, body); await load(); };
  const editMeal = async (mid: number, body: NMealCreate) => {
    await nUpdateMeal(mid, { name: body.name, kcal: body.kcal, protein: body.protein, fat: body.fat, carb: body.carb, items: body.items });
    await load();
  };
  const removeMeal = async (mid: number) => { await nDeleteMeal(mid); await load(); };
  const saveTarget = async (t: NTarget) => { await nSetTarget(goalId, t); await load(); };

  const sheetEl = sheet && (
    sheet.s === "add"
      ? <MealSheet meal={null} onSave={addMeal} onClose={() => setSheet(null)} />
      : sheet.s === "edit"
        ? <MealSheet meal={sheet.meal} onSave={(b) => editMeal(sheet.meal.id, b)}
            onDelete={() => removeMeal(sheet.meal.id)} onClose={() => setSheet(null)} />
        : <TargetSheet target={target} onSave={saveTarget} onClose={() => setSheet(null)} />
  );

  if (!ready || !day) {
    return <div className="nut"><div className="nut-head"><button className="nut-gear" style={{ marginLeft: 0 }} onClick={onBack}><IcoBack /></button><div><div className="h-title">Питание</div><div className="h-sub">{goalName}</div></div></div>
      <div className="nut-body"><div className="skeleton" style={{ height: 140, borderRadius: 16 }} /></div></div>;
  }

  // ── Обзор ──
  if (view.s === "over") {
    const doneCount = week.filter((d) => d.done > 0).length;
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    return (
      <div className="nut">
        <div className="nut-head">
          <button className="nut-gear" style={{ marginLeft: 0 }} onClick={onBack}><IcoBack /></button>
          <div><div className="h-title">Питание</div><div className="h-sub">{goalName}</div></div>
          <button className="nut-gear nut-head-end" onClick={() => setSheet({ s: "target" })} aria-label="Цель"><IcoGear /></button>
        </div>
        <div className="nut-body">
          <div onClick={() => setView({ s: "day" })} style={{ cursor: "pointer" }}><DayCard day={day} /></div>

          <button className="nut-add" onClick={() => setView({ s: "day" })}>
            <span className="na-ico"><IcoPlus /></span>Добавить, что съел сегодня
          </button>

          <div className="nut-card" onClick={() => setView({ s: "week" })} style={{ cursor: "pointer" }}>
            <div className="nut-week-head"><div className="wt">Неделя · {fmtDM(monday)}–{fmtDM(addDays(monday, 6))}</div><div className="wc">{doneCount} из 7 дней</div></div>
            <div className="nut-days">
              {days.map((iso) => {
                const w = weekByDate[iso];
                const st = iso === today ? "today" : (w && w.done > 0 ? "done" : "plan");
                const p = w ? pct(w.kcal, target.kcal) : null;
                return (
                  <div key={iso} className={"nut-day " + st}>
                    <div className="wd">{WD[parse(iso).getDay()]}</div>
                    <div className="circ">{st === "done" ? <IcoCheck /> : st === "today" ? <IcoArrow /> : "—"}</div>
                    <div className="dp">{p != null ? `${p}%` : "—"}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <button className="nut-row" onClick={() => setView({ s: "week" })}>
            <span className="r-ico"><IcoBars /></span>
            <span><div className="r-title">Неделя</div><div className="r-sub">Все дни и проценты</div></span>
            <span className="r-chev"><IcoChev /></span>
          </button>
        </div>
        {sheetEl}
      </div>
    );
  }

  // ── День ──
  if (view.s === "day") {
    return (
      <div className="nut">
        <div className="nut-head">
          <button className="nut-gear" style={{ marginLeft: 0 }} onClick={() => setView({ s: "over" })}><IcoBack /></button>
          <div><div className="h-title" style={{ fontSize: 22 }}>{weekdayFull(date)} · {fmtDM(date)}</div><div className="h-sub">{date === today ? "Сегодня" : ""}</div></div>
        </div>
        <div className="nut-body">
          <DayCard day={day} />
          <div className="nut-meals-hd">Приёмы пищи</div>
          <div className="nut-card" style={{ padding: "2px 14px" }}>
            <div className="nut-meals">
              {day.meals.length === 0 && <div className="nut-empty">Пусто. Добавь, что съел →</div>}
              {day.meals.map((m, i) => (
                <div key={m.id} className="nut-meal" onClick={() => setView({ s: "meal", i })}>
                  <div className="m-time">{m.time ?? ""}</div>
                  <div className="m-thumb">{mealEmoji(m.name)}</div>
                  <div className="m-mid">
                    <div className="m-name-row">
                      <span className="m-name">{m.name}</span>
                      <span className={"m-st " + (m.status === "done" ? "done" : "plan")}>{m.status === "done" ? "✓ Выполнено" : "Запланировано"}</span>
                    </div>
                    <div className="m-macros">Б {m.protein} · У {m.carb} · Ж {m.fat}</div>
                  </div>
                  <div className="m-kcal"><b>{m.kcal}</b><span>ккал</span></div>
                  <div className="m-chev"><IcoChev /></div>
                </div>
              ))}
            </div>
          </div>
          <button className="nut-add" onClick={() => setSheet({ s: "add" })}>
            <span className="na-ico"><IcoPlus /></span>Добавить приём
          </button>
        </div>
        {sheetEl}
      </div>
    );
  }

  // ── Приём ──
  if (view.s === "meal") {
    const m = day.meals[view.i];
    if (!m) { setView({ s: "day" }); return null; }
    const done = m.status === "done";
    return (
      <div className="nut">
        <div className="nut-head">
          <button className="nut-gear" style={{ marginLeft: 0 }} onClick={() => setView({ s: "day" })}><IcoBack /></button>
          <div><div className="h-title" style={{ fontSize: 22 }}>{m.name}</div><div className="h-sub">{m.time ?? ""}{date === today ? " · Сегодня" : ""}</div></div>
        </div>
        <div className="nut-body">
          <div className="nut-card">
            <div className="nut-meal-hero">
              <div className="mh-thumb">{mealEmoji(m.name)}</div>
              <div>
                {done ? <span className="nut-done-pill"><IcoCheck /> Выполнено</span> : <span className="nut-badge plan" style={{ marginLeft: 0 }}>Запланировано</span>}
                <div className="mh-macros">Б {m.protein} г · У {m.carb} г · Ж {m.fat} г</div>
              </div>
              <div className="mh-kcal"><b>{m.kcal}</b><span>ккал</span></div>
            </div>
          </div>
          <div className="nut-meals-hd">Состав</div>
          <div className="nut-card" style={{ padding: "2px 16px" }}>
            {(m.items ?? []).map((p, idx) => (
              <div key={idx} className="nut-prod">
                <div><div className="p-name">{p.n}</div><div className="p-qty">{p.q}</div></div>
                <div className="p-kcal">{p.k} ккал</div>
              </div>
            ))}
          </div>
          <div className="nut-actions">
            <button className="nut-act eat" onClick={() => toggleMeal(m)}><IcoCheck /> {done ? "Отменить" : "Съел как план"}</button>
            <button className="nut-act edit" onClick={() => setSheet({ s: "edit", meal: m })}>Изменить</button>
          </div>
        </div>
        {sheetEl}
      </div>
    );
  }

  // ── Неделя ──
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const doneCount = week.filter((d) => d.done > 0).length;
  return (
    <div className="nut">
      <div className="nut-head">
        <button className="nut-gear" style={{ marginLeft: 0 }} onClick={() => setView({ s: "over" })}><IcoBack /></button>
        <div><div className="h-title" style={{ fontSize: 22 }}>Неделя</div><div className="h-sub">{goalName}</div></div>
      </div>
      <div className="nut-body">
        <div className="nut-goal">
          <div className="nut-goal-top"><div className="nut-goal-title" style={{ fontSize: 16 }}>Эта неделя · {fmtDM(monday)}–{fmtDM(addDays(monday, 6))}</div><div className="nut-goal-week" style={{ alignSelf: "center" }}>{doneCount} из 7 дней</div></div>
          <div className="nut-bar"><span style={{ width: `${Math.round((doneCount / 7) * 100)}%` }} /></div>
        </div>
        <div className="nut-wweek">
          {days.map((iso) => {
            const w = weekByDate[iso];
            const st = iso === today ? "today" : (w && w.done > 0 ? "done" : "plan");
            const p = w ? pct(w.kcal, target.kcal) : null;
            return (
              <div key={iso} className={"nut-wrow " + st} onClick={() => { setDate(iso); setView({ s: "day" }); }}>
                <div className="w-circ">{st === "done" ? <IcoCheck /> : st === "today" ? <IcoArrow /> : null}</div>
                <div className="w-mid">
                  <div className="w-day">{weekdayFull(iso)} · {fmtDM(iso)}</div>
                  {w ? <>
                    <div className="w-kcal"><span className="mono">{w.kcal}</span> <span className="muted">/ {target.kcal} ккал</span></div>
                    <div className="w-macros">Б {w.protein} · У {w.carb} · Ж {w.fat}</div>
                    <div className="w-prog"><span style={{ width: `${Math.min(p ?? 0, 100)}%` }} /></div>
                  </> : <div className="w-kcal muted">{iso > today ? "Запланировано" : "Нет данных"}</div>}
                </div>
                <div className="w-pct">{p != null ? `${p}%` : "—"}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
