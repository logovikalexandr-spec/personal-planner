import { useEffect } from "react";

// Глобальный сигнал «обнови данные» — шлёт pull-to-refresh (lib/pwa.refreshApp).
// Экраны подписывают свой load() → мягкое обновление БЕЗ перезагрузки страницы
// (reload сдвигал fixed-навбар вверх на коротких табах в iOS PWA).
export const REFRESH_EVENT = "planner:refresh";

export function useRefreshSignal(load: () => void): void {
  useEffect(() => {
    const h = () => load();
    window.addEventListener(REFRESH_EVENT, h);
    return () => window.removeEventListener(REFRESH_EVENT, h);
  }, [load]);
}
