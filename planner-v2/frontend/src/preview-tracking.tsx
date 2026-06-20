import "./theme.css";
import { createRoot } from "react-dom/client";
import { Tracking } from "./screens/Tracking";
import { BottomTabs } from "./components/BottomTabs";

// Изолированный preview Форка E для визуал-дифа с мокапом T5-habits.html. НЕ прод.
createRoot(document.getElementById("root")!).render(
  <div style={{ width: 390, height: 844, position: "relative", background: "var(--bg)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 90 }}>
      <Tracking />
    </div>
    <BottomTabs active="tracking" onChange={() => {}} />
  </div>,
);
