import { useEffect, type RefObject } from "react";

// Прижать fixed-элемент к низу ВИДИМОГО вьюпорта (visualViewport) через TOP-якорь.
// Зачем: position:fixed + bottom глючит в Telegram iOS WebView — при открытой клавиатуре
// и нулевом скролле элемент «улетает» вверх (баг бара «Готово» и quick-add-оверлея).
// top = vv.offsetTop + vv.height − высота элемента; пересчёт на resize/scroll вьюпорта
// и на изменение высоты самого элемента (ResizeObserver — чипы quick-add меняют высоту).
// Без visualViewport (десктоп/старый webview) — no-op, работает CSS-fallback (bottom:0).
export function useBottomAnchor(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const vv = window.visualViewport;
    const el = ref.current;
    if (!vv || !el) return;
    const place = () => {
      const node = ref.current;
      if (!node) return;
      node.style.top = `${Math.round(vv.offsetTop + vv.height - node.offsetHeight)}px`;
      node.style.bottom = "auto";
    };
    place();
    const raf = requestAnimationFrame(place);
    const t = window.setTimeout(place, 280); // дождаться анимации клавиатуры
    vv.addEventListener("resize", place);
    vv.addEventListener("scroll", place);
    window.addEventListener("scroll", place, true);
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      vv.removeEventListener("resize", place);
      vv.removeEventListener("scroll", place);
      window.removeEventListener("scroll", place, true);
      ro.disconnect();
    };
  }, [ref, active]);
}
