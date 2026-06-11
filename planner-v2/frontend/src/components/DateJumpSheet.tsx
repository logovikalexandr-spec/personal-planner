import { useMemo, useState } from "react";
import { Sheet } from "./Sheet";

const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

function localISO(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}

/**
 * Датапикер-прыжок для таба «Задачи» (T1, фрейм 2). Мини-месяц поверх (реюз cal-mini-грида
 * из DateSheet). Тап дня выбирает; «Открыть день» применяет, «Сегодня» прыгает на сегодня.
 * Точки-проекты на днях — отдельный делта-шаг (нужны задачи на месяц), пока без них.
 */
export function DateJumpSheet({
  initial, onPick, onClose,
}: {
  initial: string;
  onPick: (iso: string) => void;
  onClose: () => void;
}) {
  const todayISO = localISO(new Date());
  const [sel, setSel] = useState(initial);
  const base = new Date(initial + "T00:00:00");
  const [view, setView] = useState(() => ({ y: base.getFullYear(), m: base.getMonth() }));

  const weeks = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const startDow = (first.getDay() || 7) - 1; // Пн=0
    const days = new Date(view.y, view.m + 1, 0).getDate();
    const cells: (number | null)[] = Array(startDow).fill(null);
    for (let d = 1; d <= days; d++) cells.push(d);
    while (cells.length % 7) cells.push(null);
    const out: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [view]);

  return (
    <Sheet onClose={onClose}>
      <div className="cal-mini-head">
        <button className="cal-nav" onClick={() => setView((v) => ({ y: v.m === 0 ? v.y - 1 : v.y, m: (v.m + 11) % 12 }))}>‹</button>
        <span style={{ flex: 1, textAlign: "center", fontWeight: 600, textTransform: "capitalize" }}>{MONTHS[view.m]} {view.y}</span>
        <button className="cal-nav" onClick={() => setView((v) => ({ y: v.m === 11 ? v.y + 1 : v.y, m: (v.m + 1) % 12 }))}>›</button>
      </div>
      <div className="cal-mini">
        {WD.map((w) => <div key={w} className="cal-mini-wd">{w}</div>)}
        {weeks.flat().map((d, i) => {
          if (d == null) return <div key={i} />;
          const iso = localISO(new Date(view.y, view.m, d));
          const isSel = iso === sel;
          const isToday = iso === todayISO;
          return (
            <button
              key={i}
              className={`cal-mini-day ${isSel ? "sel" : ""} ${isToday && !isSel ? "today" : ""}`}
              onClick={() => setSel(iso)}
            >{d}</button>
          );
        })}
      </div>
      <div className="row" style={{ gap: 8, marginTop: 16 }}>
        <button
          className="btn btn-ghost"
          style={{ flex: 1 }}
          onClick={() => { onPick(todayISO); onClose(); }}
        >Сегодня</button>
        <button
          className="btn btn-block"
          style={{ flex: 1, marginTop: 0 }}
          onClick={() => { onPick(sel); onClose(); }}
        >Открыть день</button>
      </div>
    </Sheet>
  );
}
