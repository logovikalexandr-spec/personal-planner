import { IcoCalendar2, IcoMove, IcoFlag, IcoCheck, IcoTrash } from "./icons";

// Волна 2 F2 — нижняя batch-панель режима выбора. Мокап D.
// Действия над набором: Дата · В список · Приоритет · Готово · Удалить.
// Появляется когда selectMode && count>0. Кнопки вызывают колбэки родителя (он держит выбор).

export interface BatchBarProps {
  count: number;
  onDate: () => void;
  onMove: () => void;
  onPriority: () => void;
  onComplete: () => void;
  onDelete: () => void;
}

export function BatchBar({ count, onDate, onMove, onPriority, onComplete, onDelete }: BatchBarProps) {
  const disabled = count === 0;
  return (
    <div className="batch-bar" role="toolbar" aria-label="Действия над выбранными">
      <button className="batch-btn" onClick={onDate} disabled={disabled}>
        <IcoCalendar2 /><span>Дата</span>
      </button>
      <button className="batch-btn" onClick={onMove} disabled={disabled}>
        <IcoMove /><span>В список</span>
      </button>
      <button className="batch-btn" onClick={onPriority} disabled={disabled}>
        <IcoFlag /><span>Приоритет</span>
      </button>
      <button className="batch-btn" onClick={onComplete} disabled={disabled}>
        <IcoCheck /><span>Готово</span>
      </button>
      <button className="batch-btn danger" onClick={onDelete} disabled={disabled}>
        <IcoTrash /><span>Удалить</span>
      </button>
    </div>
  );
}
