import { useRef, useState } from "react";
import { tg } from "../telegram";

// Long-press с haptic-толчком (impact medium) на срабатывании + pressed-флаг для
// визуальной реакции карточки. Тап (без удержания) → onTap. Haptic работает в
// Telegram Mini App; в PWA (нет tg) тихо деградирует — визуал держит обратную связь.
export function useLongPress(onLong: () => void, onTap?: () => void, ms = 500) {
  const lp = useRef<number | null>(null);
  const fired = useRef(false);
  const [pressed, setPressed] = useState(false);

  const start = () => {
    fired.current = false;
    setPressed(true);
    lp.current = window.setTimeout(() => {
      fired.current = true;
      tg()?.HapticFeedback?.impactOccurred?.("medium");
      onLong();
    }, ms);
  };
  const clear = () => {
    if (lp.current) { clearTimeout(lp.current); lp.current = null; }
    setPressed(false);
  };
  const click = () => {
    if (fired.current) { fired.current = false; return; } // подавляем клик после long-press
    onTap?.();
  };

  return {
    pressed,
    handlers: {
      onClick: click,
      onPointerDown: start,
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
    },
  };
}
