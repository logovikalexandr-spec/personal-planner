import type { Project } from "../types";
import { Sheet } from "./Sheet";

export function ProjectMenu({
  project, canCreateSub = true, onClose, onCreateSub, onEdit, onTogglePin, onDelete,
}: {
  project: Project;
  /** false = глубина родителя на лимите (3 уровня), «Создать подсписок» скрыт. */
  canCreateSub?: boolean;
  onClose: () => void;
  onCreateSub: () => void;
  onEdit: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  return (
    <Sheet onClose={onClose}>
      <div className="menu-head">
        <span style={{ fontSize: 20 }}>{project.icon ?? "📁"}</span>
        <span style={{ fontWeight: 600 }}>{project.name}</span>
      </div>
      {canCreateSub && <button className="menu-item" onClick={onCreateSub}>Создать подсписок</button>}
      <button className="menu-item" onClick={onEdit}>Редактировать</button>
      <button className="menu-item" onClick={onTogglePin}>{project.pinned ? "Открепить" : "Закрепить"}</button>
      <button className="menu-item danger" onClick={onDelete}>Удалить</button>
    </Sheet>
  );
}
