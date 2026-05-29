import { useRef } from "react";

export function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const sx = useRef<number | null>(null);
  const sy = useRef<number | null>(null);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => { sx.current = e.touches[0].clientX; sy.current = e.touches[0].clientY; }}
        onTouchEnd={(e) => {
          const x = sx.current;
          const y = sy.current;
          sx.current = null;
          sy.current = null;
          if (x === null || y === null) return;
          const dx = e.changedTouches[0].clientX - x;
          const dy = Math.abs(e.changedTouches[0].clientY - y);
          // swipe right = back one step (close this sheet)
          if (dx > 60 && dx > dy * 1.5) onClose();
        }}
      >
        <div className="sheet-grip" />
        {children}
      </div>
    </div>
  );
}
