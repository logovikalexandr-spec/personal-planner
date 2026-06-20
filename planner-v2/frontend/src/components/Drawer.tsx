import { useRef, useState } from "react";
import { ProjectTreePanel } from "./ProjectTreePanel";
import type { ActiveList } from "../types";

/**
 * Навигация-шторка (левый оверлей). Хром (backdrop + slide + swipe-close)
 * вокруг общего ProjectTreePanel (variant="drawer"). Тот же контент, что и на
 * табе «Списки» (variant="screen") — одна сущность, два входа.
 */
export function Drawer({
  active, closing, onSelect, onClose,
}: {
  active: ActiveList;
  closing?: boolean;
  /** Выбор списка/проекта: меняет активный список (закрытие — через onAfterSelect). */
  onSelect: (a: ActiveList) => void;
  onClose: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const sx = useRef<number | null>(null);
  const sy = useRef<number | null>(null);

  return (
    <div className={`drawer-backdrop ${closing ? "closing" : ""}`} onClick={onClose}>
      <div
        className={`drawer ${closing ? "closing" : ""} ${dragging ? "dragging" : ""}`}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => { sx.current = e.touches[0].clientX; sy.current = e.touches[0].clientY; }}
        onTouchEnd={(e) => {
          const x = sx.current;
          const y = sy.current;
          sx.current = null;
          sy.current = null;
          // выкл swipe-close во время drag проекта (см. решения пользователя)
          if (x === null || y === null || dragging) return;
          const dx = e.changedTouches[0].clientX - x;
          const dy = Math.abs(e.changedTouches[0].clientY - y);
          if (dx < -50 && Math.abs(dx) > dy * 1.5) onClose();
        }}
      >
        <ProjectTreePanel
          active={active}
          onSelect={onSelect}
          variant="drawer"
          onAfterSelect={onClose}
          onDragActiveChange={setDragging}
        />
      </div>
    </div>
  );
}
