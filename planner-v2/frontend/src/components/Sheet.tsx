import { useEffect, useRef } from "react";

export function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const sx = useRef<number | null>(null);
  const sy = useRef<number | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Высоту клавиатуры считаем из visualViewport вживую (inline, без CSS-транзишна):
  // CSS var(--kb-inset) при монтаже бывает «стейл» → шит появлялся в центре и плавно
  // съезжал вниз. Тут padding-bottom = реальная высота клавы сразу + следит за ней.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = backdropRef.current;
    if (!vv || !el) return;
    const place = () => {
      const kb = Math.max(0, window.innerHeight - (vv.offsetTop + vv.height));
      el.style.paddingBottom = `${Math.round(kb)}px`;
    };
    place();
    vv.addEventListener("resize", place);
    vv.addEventListener("scroll", place);
    return () => {
      vv.removeEventListener("resize", place);
      vv.removeEventListener("scroll", place);
    };
  }, []);

  return (
    <div className="sheet-backdrop" ref={backdropRef} onClick={onClose}>
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
    </div>
  );
}
