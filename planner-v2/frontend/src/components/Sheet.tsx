import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Видимая зона = visualViewport (ИСКЛЮЧАЕТ клавиатуру на iOS). Бэкдроп/лист привязываем
// к ней, иначе при клаве (≈40% экрана) лист высотой 85dvh уезжает верхом за экран.
function vpRect(): { top: number; height: number } {
  const vv = window.visualViewport;
  return vv ? { top: vv.offsetTop, height: vv.height } : { top: 0, height: window.innerHeight };
}

export function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const sx = useRef<number | null>(null);
  const sy = useRef<number | null>(null);

  // Считаем ДО первой отрисовки (инициализатор useState), чтобы лист сразу был на месте.
  const [vp, setVp] = useState<{ top: number; height: number }>(vpRect);
  useLayoutEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const place = () => setVp(vpRect());
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
    <div className="sheet-backdrop" style={{ top: vp.top, height: vp.height }} onClick={onClose}>
      <div
        className="sheet"
        style={{ maxHeight: vp.height - 8 }}
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
