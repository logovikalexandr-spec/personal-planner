// Метка этапа задачи (A6): цвет по статусу. current=ember, late=danger, future=steel, done=zima.
export function stageColor(status?: string | null): string {
  switch (status) {
    case "current": return "var(--accent)";
    case "late": return "var(--red)";
    case "done": return "#3FB68B";
    default: return "var(--text-muted)"; // future / неизвестно = стальной
  }
}
