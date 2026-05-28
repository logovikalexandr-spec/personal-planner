import { useState } from "react";

export function AddTaskBar({ onAdd }: { onAdd: (title: string) => void }) {
  const [v, setV] = useState("");
  function submit() {
    const t = v.trim();
    if (!t) return;
    onAdd(t);
    setV("");
  }
  return (
    <div className="row" style={{ gap: 8, marginBottom: 16 }}>
      <input
        className="input grow"
        placeholder="Новая задача..."
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <button className="btn" onClick={submit}>Добавить</button>
    </div>
  );
}
