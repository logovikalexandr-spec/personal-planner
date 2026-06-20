import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// текущая высота клавиатуры из visualViewport (0 если клавы нет / нет API)
function kbHeight(): number {
  const vv = window.visualViewport;
  return vv ? Math.max(0, Math.round(window.innerHeight - (vv.offsetTop + vv.height))) : 0;
}

export function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const sx = useRef<number | null>(null);
  const sy = useRef<number | null>(null);

  // padding-bottom считаем из visualViewport ДО первой отрисовки (инициализатор useState),
  // чтобы шит сразу был на месте — CSS var(--kb-inset) на монтаже бывает «стейл» (шит мигал).
  const [pad, setPad] = useState<number>(kbHeight);
  useLayoutEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const place = () => setPad(kbHeight());
    place();
    vv.addEventListener("resize", place);
    vv.addEventListener("scroll", place);
    return () => {
      vv.removeEventListener("resize", place);
      vv.removeEventListener("scroll", place);
    };
  }, []);

  // Портал в body: иначе шит, отрендеренный внутри Drawer (у .drawer transform+
  // will-change → containing block для position:fixed), позиционируется относительно
  // шторки = «висит в воздухе», drag/backdrop ломаются. В body — fixed резолвится к вьюпорту.
  return createPortal(
    <div className="sheet-backdrop" style={{ paddingBottom: pad }} onClick={onClose}>
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          // only arm swipe-close when the gesture starts in the grip zone (top ~56px),
          // so it never fights toolbar horizontal-scroll or content vertical-scroll
          const top = e.currentTarget.getBoundingClientRect().top;
          if (e.touches[0].clientY - top > 56) { sx.current = null; sy.current = null; return; }
          sx.current = e.touches[0].clientX; sy.current = e.touches[0].clientY;
        }}
        onTouchEnd={(e) => {
          const x = sx.current;
          const y = sy.current;
          sx.current = null;
          sy.current = null;
          if (x === null || y === null) return;
          const dx = e.changedTouches[0].clientX - x;
          const dy = Math.abs(e.changedTouches[0].clientY - y);
          // swipe right/down from the grip = back one step (close this sheet)
          if ((dx > 60 && dx > dy * 1.5) || (e.changedTouches[0].clientY - y > 70 && Math.abs(dx) < 40)) onClose();
        }}
      >
        <div className="sheet-grip" />
        {children}
      </div>
    </div>,
    document.body,
  );
}
