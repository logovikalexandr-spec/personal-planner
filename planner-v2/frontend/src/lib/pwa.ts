// PWA service-worker управление.
// registerType:"prompt" (vite.config) → авто-reload отключён; обновление применяет
// pull-to-refresh-жест через refreshApp(). Здесь регистрируем SW и тихо проверяем
// обновление при возврате из фона (iOS PWA сам этого не делает → новый деплой «не виден»).
import { registerSW } from "virtual:pwa-register";
import { REFRESH_EVENT } from "./refreshSignal";

let swReg: ServiceWorkerRegistration | undefined;

export function initPwa(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      swReg = reg;
    },
  });
  // Возврат из фона → перепроверить SW (iOS standalone-PWA не делает автоматом).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") swReg?.update().catch(() => {});
  });
}

// Pull-to-refresh: МЯГКОЕ обновление БЕЗ location.reload().
// Почему без reload: полная перезагрузка страницы в iOS standalone-PWA на КОРОТКИХ табах
// (Гант/Цели) сдвигала fixed-навбар вверх («подлетал») — неустранимо патчами позиции.
// Вместо reload: (1) шлём сигнал экранам перечитать данные; (2) в фоне проверяем новый SW —
// новый КОД подтянется на следующем cold-start приложения (network-first уже стоит).
export async function refreshApp(): Promise<void> {
  window.dispatchEvent(new Event(REFRESH_EVENT)); // экраны перечитают данные (без reload)
  try {
    await swReg?.update(); // фоновая проверка нового деплоя (применится при переоткрытии PWA)
  } catch {
    /* офлайн — не страшно */
  }
  await new Promise((r) => setTimeout(r, 450)); // короткая задержка под крутилку (фидбэк)
}
