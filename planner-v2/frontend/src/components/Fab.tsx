import { IcoPlus } from "./icons";

// FAB закреплён над таб-баром (CSS position:fixed — вне скролл-контейнера).
// secondary — опциональная вторичная кнопка-пилюля с подписью (Today: «Задачи»).
// Табы без secondary её не передают.
export function Fab({
  onAdd,
  secondary,
}: {
  onAdd: () => void;
  secondary?: { label: string; onClick: () => void };
}) {
  return (
    <>
      {secondary && (
        <button className="fab fab-secondary" onClick={secondary.onClick}>
          {secondary.label}
        </button>
      )}
      <button className="fab" onClick={onAdd} aria-label="Добавить"><IcoPlus /></button>
    </>
  );
}
