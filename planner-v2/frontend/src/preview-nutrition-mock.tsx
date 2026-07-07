import "./theme.css";
import "./components/workout-log.css";
import "./nutrition.css";
import { useState } from "react";
import { createRoot } from "react-dom/client";

/* Mock-preview модуля «Питание»: Обзор · День · Неделя. Бэк не нужен. НЕ прод.
   Цифры реальные (80.6→95, Набор массы). Раскладка 1:1 с мокапами Александра. */

const svg = (d: React.ReactNode, w = 22) => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const IcoGear = () => svg(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></>, 19);
const IcoChev = () => svg(<path d="M9 6l6 6-6 6" />, 18);
const IcoCheck = () => svg(<path d="M5 12l5 5L20 7" />, 15);
const IcoArrow = () => svg(<path d="M5 12h14M13 6l6 6-6 6" />, 15);
const IcoBack = () => svg(<path d="M15 18l-6-6 6-6" />, 22);
const IcoCal = () => svg(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>, 20);
const IcoCam = () => svg(<><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>, 20);
const IcoBars = () => svg(<><path d="M8 21V9" /><path d="M16 21V5" /><path d="M12 21v-6" /></>, 20);
const IcoList = () => svg(<><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>, 20);
const IcoPlus = () => svg(<><path d="M12 5v14M5 12h14" /></>, 18);
const IcoTasks = () => svg(<><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></>);
const IcoDumb = () => svg(<><path d="M6.5 6.5l11 11M21 21l-1-1M3 3l1 1M18 22l4-4M2 6l4-4" /></>);
const IcoFork = () => svg(<><path d="M3 2v7c0 1.1.9 2 2 2h0V2M7 2v20M21 15V2a5 5 0 0 0-3 5v6z" /></>);
const IcoTrend = () => svg(<><path d="M3 17l6-6 4 4 8-8" /><path d="M17 7h4v4" /></>);
const IcoUser = () => svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>);

type Screen = { s: "over" } | { s: "day" } | { s: "week" } | { s: "meal"; i: number };

function Ring({ pct }: { pct: number }) {
  const r = 42, C = 2 * Math.PI * r, off = C * (1 - pct / 100);
  return (
    <div className="nut-ring">
      <svg width="92" height="92">
        <circle cx="46" cy="46" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="9" />
        <circle cx="46" cy="46" r={r} fill="none" stroke="var(--accent)" strokeWidth="9" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} />
      </svg>
      <div className="ring-pct">{pct}%</div>
    </div>
  );
}

/* карточка «сегодня» — общая для Обзора и Дня */
function TodayCard({ head }: { head?: React.ReactNode }) {
  return (
    <div className="nut-card">
      {head}
      <div className="nut-day-main">
        <Ring pct={76} />
        <div className="nut-kcal">
          <div className="nut-kcal-row"><span className="mono">2 450</span> <span className="muted">/ 3 200 ккал</span></div>
          <div className="nut-bar"><span style={{ width: "76%" }} /></div>
          <div className="nut-macros">
            <div className="nut-macro p"><div className="m-top"><b>Б</b> 145<span className="muted">/170 г</span></div><div className="m-pct">85%</div></div>
            <div className="nut-macro c"><div className="m-top"><b>У</b> 280<span className="muted">/390 г</span></div><div className="m-pct">72%</div></div>
            <div className="nut-macro f"><div className="m-top"><b>Ж</b> 72<span className="muted">/85 г</span></div><div className="m-pct">85%</div></div>
          </div>
        </div>
      </div>
      <div className="nut-left">
        <div className="ll">До цели осталось</div>
        <div className="nut-left-items">
          <span><i className="dot p" /> 25 г белка</span>
          <span><i className="dot c" /> 110 г углеводов</span>
          <span><i className="dot f" /> 13 г жиров</span>
          <span><i className="dot k" /> ≈ 750 ккал</span>
        </div>
      </div>
    </div>
  );
}

const WEEK = [
  { wd: "Пн", st: "done", pct: 89 }, { wd: "Вт", st: "done", pct: 96 },
  { wd: "Ср", st: "today", pct: 72 }, { wd: "Чт", st: "plan" }, { wd: "Пт", st: "plan" },
  { wd: "Сб", st: "plan" }, { wd: "Вс", st: "plan" },
] as const;

function Tabs() {
  return (
    <div className="nut-tabs">
      <div className="nut-tab"><IcoTasks /><span>Задачи</span></div>
      <div className="nut-tab"><IcoDumb /><span>Тренировки</span></div>
      <div className="nut-tab active"><IcoFork /><span>Питание</span></div>
      <div className="nut-tab"><IcoTrend /><span>Прогресс</span></div>
      <div className="nut-tab"><IcoUser /><span>Профиль</span></div>
    </div>
  );
}

function Overview({ go }: { go: (s: Screen) => void }) {
  return (
    <div className="nut">
      <div className="nut-head">
        <div><div className="h-title">Питание</div><div className="h-sub">Набор массы</div></div>
        <button className="nut-gear"><IcoGear /></button>
      </div>
      <div className="nut-body">
        <div className="nut-goal">
          <div className="nut-goal-top">
            <div><div className="nut-goal-title">Цель: 80.6 → 95 кг</div><div className="nut-goal-stage">Этап 1 · Набор массы</div></div>
            <div className="nut-goal-week">Неделя 2 из 12<br /><span className="nut-goal-pct">42%</span></div>
          </div>
          <div className="nut-bar"><span style={{ width: "42%" }} /></div>
        </div>

        <div onClick={() => go({ s: "day" })} style={{ cursor: "pointer" }}>
          <TodayCard head={<div className="nut-card-head"><div className="nut-card-title">Сегодня · 29 июня</div><div className="nut-badge go">В пути</div></div>} />
        </div>

        <div className="nut-card" onClick={() => go({ s: "week" })} style={{ cursor: "pointer" }}>
          <div className="nut-week-head"><div className="wt">Неделя · 29 июн–5 июл</div><div className="wc">2 из 7 дней</div></div>
          <div className="nut-days">
            {WEEK.map((d) => (
              <div key={d.wd} className={"nut-day " + d.st}>
                <div className="wd">{d.wd}</div>
                <div className="circ">{d.st === "done" ? <IcoCheck /> : d.st === "today" ? <IcoArrow /> : "—"}</div>
                <div className="dp">{"pct" in d ? `${d.pct}%` : "—"}</div>
              </div>
            ))}
          </div>
        </div>

        <button className="nut-row" onClick={() => go({ s: "week" })}>
          <span className="r-ico"><IcoBars /></span>
          <span><div className="r-title">Итоги недели</div><div className="r-sub">Посмотреть результат</div></span>
          <span className="r-chev"><IcoChev /></span>
        </button>
        <button className="nut-row">
          <span className="r-ico"><IcoList /></span>
          <span><div className="r-title">История</div><div className="r-sub">Все недели и этапы</div></span>
          <span className="r-chev"><IcoChev /></span>
        </button>
        <button className="nut-add"><IcoPlus /> Добавить приём пищи <span className="cam"><IcoCam /></span></button>
      </div>
      <Tabs />
    </div>
  );
}

const MEALS = [
  { t: "08:00", n: "Завтрак", st: "done", b: 42, u: 95, f: 20, k: 760, e: "🥣", items: [
    { n: "Овсянка", q: "100 г", k: 370 }, { n: "Молоко 2.5%", q: "300 мл", k: 150 },
    { n: "Протеин", q: "30 г", k: 115 }, { n: "Банан", q: "1 шт", k: 95 }, { n: "Арахисовая паста", q: "30 г", k: 180 },
  ] },
  { t: "11:00", n: "Перекус", st: "done", b: 32, u: 35, f: 15, k: 430, e: "🫐", items: [
    { n: "Творог 5%", q: "250 г", k: 290 }, { n: "Ягоды", q: "100 г", k: 50 }, { n: "Мёд", q: "15 г", k: 45 },
  ] },
  { t: "14:00", n: "Обед", st: "done", b: 50, u: 80, f: 20, k: 780, e: "🍗", items: [
    { n: "Куриная грудка", q: "200 г", k: 330 }, { n: "Рис (сухой)", q: "180 г", k: 360 },
    { n: "Овощи", q: "150 г", k: 45 }, { n: "Оливковое масло", q: "10 г", k: 90 },
  ] },
  { t: "17:00", n: "Гейнер", st: "done", b: 48, u: 120, f: 22, k: 980, e: "🥤", items: [
    { n: "Молоко 2.5%", q: "500 мл", k: 250 }, { n: "Овсянка", q: "100 г", k: 370 },
    { n: "Протеин", q: "35 г", k: 135 }, { n: "Банан", q: "1 шт", k: 95 }, { n: "Арахисовая паста", q: "35 г", k: 210 },
  ] },
  { t: "20:00", n: "Ужин", st: "plan", b: 45, u: 85, f: 18, k: 650, e: "🐟", items: [
    { n: "Лосось", q: "200 г", k: 400 }, { n: "Картофель", q: "250 г", k: 215 }, { n: "Овощи", q: "150 г", k: 45 },
  ] },
  { t: "22:00", n: "Перед сном", st: "plan", b: 25, u: 15, f: 10, k: 300, e: "🧀", items: [
    { n: "Творог 5%", q: "250 г", k: 290 },
  ] },
] as const;

const IcoCheck2 = () => svg(<path d="M5 12l5 5L20 7" />, 18);

function Day({ go }: { go: (s: Screen) => void }) {
  return (
    <div className="nut">
      <div className="nut-head">
        <button className="nut-gear" style={{ marginLeft: 0 }} onClick={() => go({ s: "over" })}><IcoBack /></button>
        <div><div className="h-title" style={{ fontSize: 22 }}>Среда · 29 июня</div><div className="h-sub">Сегодня</div></div>
      </div>
      <div className="nut-body">
        <TodayCard />
        <div className="nut-meals-hd">Приёмы пищи</div>
        <div className="nut-card" style={{ padding: "2px 14px" }}>
          <div className="nut-meals">
            {MEALS.map((m, i) => (
              <div key={m.t} className="nut-meal" onClick={() => go({ s: "meal", i })}>
                <div className="m-time">{m.t}</div>
                <div className="m-thumb">{m.e}</div>
                <div className="m-mid">
                  <div className="m-name-row">
                    <span className="m-name">{m.n}</span>
                    <span className={"m-st " + (m.st === "done" ? "done" : "plan")}>{m.st === "done" ? "✓ Выполнено" : "Запланировано"}</span>
                  </div>
                  <div className="m-macros">Б {m.b} · У {m.u} · Ж {m.f}</div>
                </div>
                <div className="m-kcal"><b>{m.k}</b><span>ккал</span></div>
                <div className="m-chev"><IcoChev /></div>
              </div>
            ))}
          </div>
        </div>
        <button className="nut-add"><IcoPlus /> Добавить приём пищи <span className="cam"><IcoCam /></span></button>
      </div>
    </div>
  );
}

const WDAYS = [
  { d: "Понедельник · 29 июня", st: "done", k: 2890, b: 160, u: 320, f: 78, pct: 89 },
  { d: "Вторник · 30 июня", st: "done", k: 3070, b: 172, u: 360, f: 82, pct: 96 },
  { d: "Среда · 1 июля", st: "today", k: 2450, b: 145, u: 280, f: 72, pct: 72 },
  { d: "Четверг · 2 июля", st: "plan" },
  { d: "Пятница · 3 июля", st: "plan" },
  { d: "Суббота · 4 июля", st: "plan" },
  { d: "Воскресенье · 5 июля", st: "plan" },
] as const;

function Week({ go }: { go: (s: Screen) => void }) {
  return (
    <div className="nut">
      <div className="nut-head">
        <button className="nut-gear" style={{ marginLeft: 0 }} onClick={() => go({ s: "over" })}><IcoBack /></button>
        <div><div className="h-title" style={{ fontSize: 22 }}>Неделя</div><div className="h-sub">Набор массы</div></div>
        <button className="nut-gear"><IcoCal /></button>
      </div>
      <div className="nut-body">
        <div className="nut-goal">
          <div className="nut-goal-top"><div className="nut-goal-title" style={{ fontSize: 16 }}>Эта неделя · 29 июн–5 июл</div><div className="nut-goal-week" style={{ alignSelf: "center" }}>2 из 7 дней</div></div>
          <div className="nut-bar"><span style={{ width: "29%" }} /></div>
        </div>
        <div className="nut-wweek">
          {WDAYS.map((d) => (
            <div key={d.d} className={"nut-wrow " + d.st} onClick={() => d.st !== "plan" && go({ s: "day" })}>
              <div className="w-circ">{d.st === "done" ? <IcoCheck /> : d.st === "today" ? <IcoArrow /> : null}</div>
              <div className="w-mid">
                <div className="w-day">{d.d}</div>
                {"k" in d ? <>
                  <div className="w-kcal"><span className="mono">{d.k}</span> <span className="muted">/ 3 200 ккал</span></div>
                  <div className="w-macros">Б {d.b} · У {d.u} · Ж {d.f}</div>
                  <div className="w-prog"><span style={{ width: `${d.pct}%` }} /></div>
                </> : <div className="w-kcal muted">Запланировано</div>}
              </div>
              <div className="w-pct">{"pct" in d ? `${d.pct}%` : "—"}</div>
            </div>
          ))}
        </div>
        <button className="nut-add" style={{ borderStyle: "solid" }}><IcoBars /> Итоги недели</button>
      </div>
    </div>
  );
}

function MealDetail({ i, go }: { i: number; go: (s: Screen) => void }) {
  const m = MEALS[i];
  const done = m.st === "done";
  return (
    <div className="nut">
      <div className="nut-head">
        <button className="nut-gear" style={{ marginLeft: 0 }} onClick={() => go({ s: "day" })}><IcoBack /></button>
        <div><div className="h-title" style={{ fontSize: 22 }}>{m.n}</div><div className="h-sub">{m.t} · Сегодня</div></div>
      </div>
      <div className="nut-body">
        <div className="nut-card">
          <div className="nut-meal-hero">
            <div className="mh-thumb">{m.e}</div>
            <div>
              {done ? <span className="nut-done-pill"><IcoCheck2 /> Выполнено</span>
                    : <span className="nut-badge plan" style={{ marginLeft: 0 }}>Запланировано</span>}
              <div className="mh-macros">Б {m.b} г · У {m.u} г · Ж {m.f} г</div>
            </div>
            <div className="mh-kcal"><b>{m.k}</b><span>ккал</span></div>
          </div>
        </div>

        <div className="nut-meals-hd">Состав</div>
        <div className="nut-card" style={{ padding: "2px 16px" }}>
          {m.items.map((p) => (
            <div key={p.n} className="nut-prod">
              <div><div className="p-name">{p.n}</div><div className="p-qty">{p.q}</div></div>
              <div className="p-kcal">{p.k} ккал</div>
            </div>
          ))}
        </div>

        <div className="nut-actions">
          <button className="nut-act eat"><IcoCheck2 /> {done ? "Съедено" : "Съел как план"}</button>
          <button className="nut-act swap"><IcoCam /> Заменить</button>
        </div>
      </div>
    </div>
  );
}

function Root() {
  const [scr, setScr] = useState<Screen>({ s: "over" });
  if (scr.s === "day") return <Day go={setScr} />;
  if (scr.s === "week") return <Week go={setScr} />;
  if (scr.s === "meal") return <MealDetail i={scr.i} go={setScr} />;
  return <Overview go={setScr} />;
}

createRoot(document.getElementById("root")!).render(
  <div style={{ width: 390, height: 844, overflow: "auto", background: "var(--bg)", borderRadius: 28, boxShadow: "0 0 0 10px #111" }}>
    <Root />
  </div>,
);
