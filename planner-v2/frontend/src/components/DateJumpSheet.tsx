import { useEffect, useMemo, useState } from "react";
import { getDensity } from "../api";

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
  const sel = initial; // активный день (на котором открыли) — подсвечен; тап другого дня применяет сразу
  const base = new Date(initial + "T00:00:00");
  const [view, setView] = useState(() => ({ y: base.getFullYear(), m: base.getMonth() }));

  // Heat-нагрузка дней видимого месяца (T1·B): заливка ячейки g/y/r по числу открытых задач.
  const [heat, setHeat] = useState<Record<string, "g" | "y" | "r">>({});
  useEffect(() => {
    const from = localISO(new Date(view.y, view.m, 1));
    const to = localISO(new Date(view.y, view.m + 1, 0));
    let alive = true;
    getDensity(from, to).then((d) => { if (alive) setHeat(d); }).catch(() => {});
    return () => { alive = false; };
  }, [view.y, view.m]);

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

  const apply = (iso: string) => { onPick(iso); onClose(); };

  return (
    <>
      <div className="datepop-backdrop" onClick={onClose} />
      <div className="mini-cal" role="dialog" data-testid="datepicker">
        <div className="cal-mini-head">
          <span style={{ flex: 1, fontWeight: 600, textTransform: "capitalize" }}>{MONTHS[view.m]} {view.y}</span>
          <button className="cal-nav" onClick={() => setView((v) => ({ y: v.m === 0 ? v.y - 1 : v.y, m: (v.m + 11) % 12 }))}>‹</button>
          <button className="cal-nav" onClick={() => setView((v) => ({ y: v.m === 11 ? v.y + 1 : v.y, m: (v.m + 1) % 12 }))}>›</button>
        </div>
        <div className="cal-mini">
          {WD.map((w) => <div key={w} className="cal-mini-wd">{w}</div>)}
          {weeks.flat().map((d, i) => {
            if (d == null) return <div key={i} />;
            const iso = localISO(new Date(view.y, view.m, d));
            const isSel = iso === sel;
            const isToday = iso === todayISO;
            const h = heat[iso];
            return (
              <button
                key={i}
                className={`cal-mini-day ${h ? `heat-${h}` : ""} ${isSel ? "sel" : ""} ${isToday && !isSel ? "today" : ""}`}
                onClick={() => apply(iso)} // тап дня = выбрать и применить (нет «Открыть день», как мокап)
              >{d}</button>
            );
          })}
        </div>
        <button className="btn btn-ghost" style={{ width: "100%", marginTop: 12 }} onClick={() => apply(todayISO)}>Сегодня</button>
      </div>
    </>
  );
}
