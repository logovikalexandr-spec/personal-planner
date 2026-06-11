import "./theme.css";
import { createRoot } from "react-dom/client";
import { DateJumpSheet } from "./components/DateJumpSheet";

// Мок density: текущий месяц получает разные heat-уровни, чтобы увидеть заливку.
const _origFetch = window.fetch;
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
  if (url.includes("/api/tasks/density")) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const iso = (d: number) => `${y}-${`${m + 1}`.padStart(2, "0")}-${`${d}`.padStart(2, "0")}`;
    const map: Record<string, string> = {
      [iso(3)]: "g", [iso(4)]: "g", [iso(9)]: "y", [iso(11)]: "y",
      [iso(15)]: "r", [iso(18)]: "g", [iso(22)]: "r", [iso(25)]: "y",
    };
    return new Response(JSON.stringify(map), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  return _origFetch(input, init);
};

const today = new Date();
const initialISO = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, "0")}-${`${today.getDate()}`.padStart(2, "0")}`;

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ width: 390, background: "var(--bg)", borderRadius: 16, overflow: "hidden", marginBottom: 24 }}>
      <div style={{ padding: "10px 14px", font: "600 13px Geist Mono", color: "#8A8B91", borderBottom: "1px solid rgba(255,255,255,.07)" }}>{title}</div>
      {children}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
    <Frame title="T1·B датапикер — heat (g/y/r) + кольцо сегодня">
      <DateJumpSheet initial={initialISO} onPick={() => {}} onClose={() => {}} />
    </Frame>

    <Frame title="T1·A all-day — 2 чипа + «+N ещё»">
      <div className="cal-allday today-pad" style={{ paddingTop: 12, paddingBottom: 12 }}>
        <span className="cal-allday-label">весь<br />день</span>
        <div className="cal-allday-chips">
          <button className="cal-chip" style={{ background: "#3FB68B22", color: "#3FB68B", borderLeftColor: "#FFB02E" }}>Договор аренды ZIMA</button>
          <button className="cal-chip" style={{ background: "#5B8DEF22", color: "#5B8DEF", borderLeftColor: "#FF5C5C" }}>Записаться к врачу</button>
          <button className="cal-chip cal-chip-more">+3 ещё</button>
        </div>
      </div>
    </Frame>

    <Frame title="T1 состояние — ошибка">
      <div className="state-stub">
        <svg className="state-ico" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4" /><circle cx="12" cy="17.5" r="0.5" fill="currentColor" />
        </svg>
        <div className="state-title">Не удалось загрузить</div>
        <div className="state-sub">Проверь соединение и попробуй ещё раз.</div>
        <button className="btn btn-block" style={{ marginTop: 12, width: "auto" }}>Повторить</button>
      </div>
    </Frame>

    <Frame title="T1·D состояние — день свободен">
      <div className="state-stub">
        <svg className="state-ico" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4 4 0 0 0 7 0" /><circle cx="9" cy="10" r="0.6" fill="currentColor" /><circle cx="15" cy="10" r="0.6" fill="currentColor" />
        </svg>
        <div className="state-title">День свободен</div>
        <div className="state-sub">Ни одной задачи на сегодня. Запиши первую — или отдохни.</div>
        <button className="btn btn-block" style={{ marginTop: 12, width: "auto" }}>Добавить задачу</button>
      </div>
    </Frame>
  </div>,
);
