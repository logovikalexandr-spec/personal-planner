import "./theme.css";
import "./nutrition.css";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MealSheet } from "./components/MealSheet";
import { TargetSheet } from "./components/TargetSheet";
import type { NMeal } from "./api";

/* Live-preview новых шторок Питания (add/edit/target). Бэк не нужен (parse только по кнопке). НЕ прод. */

const MEAL: NMeal = {
  id: 1, order_index: 0, time: "13:30", name: "Курица с рисом", status: "done",
  kcal: 650, protein: 55, fat: 12, carb: 70,
  items: [{ n: "Куриная грудка", q: "200 г", k: 330 }, { n: "Рис отварной", q: "150 г", k: 320 }],
};

function App() {
  const [open, setOpen] = useState<"add" | "edit" | "target" | null>("add");
  const noop = async () => {};
  return (
    <div className="nut" style={{ minHeight: "100vh" }}>
      <div className="nut-body">
        <button className="nut-add" onClick={() => setOpen("add")}>Добавить приём</button>
        <button className="nut-add" onClick={() => setOpen("edit")}>Изменить приём</button>
        <button className="nut-add" onClick={() => setOpen("target")}>Цель</button>
      </div>
      {open === "add" && <MealSheet meal={null} onSave={noop} onClose={() => setOpen(null)} />}
      {open === "edit" && <MealSheet meal={MEAL} onSave={noop} onDelete={noop} onClose={() => setOpen(null)} />}
      {open === "target" && (
        <TargetSheet target={{ kcal: 3200, protein: 170, fat: 85, carb: 390 }} onSave={noop} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
