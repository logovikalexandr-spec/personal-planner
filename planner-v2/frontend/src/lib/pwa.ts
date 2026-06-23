// PWA service-worker управление.
// registerType:"prompt" (vite.config) → авто-reload отключён; обновление применяет
// pull-to-refresh-жест через refreshApp(). Здесь регистрируем SW и тихо проверяем
// обновление при возврате из фона (iOS PWA сам этого не делает → новый деплой «не виден»).
import { registerSW } from "virtual:pwa-register";

let updateSW: ((reload?: boolean) => Promise<void>) | null = null;
let swReg: ServiceWorkerRegistration | undefined;

export function initPwa(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  updateSW = registerSW({
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

// Применить обновление и перезагрузить свежий шелл.
// Network-first навигация (vite.config) гарантирует, что reload подтянет новый бандл;
// updateSW(true) дополнительно активирует ждущий SW (skipWaiting) до перезагрузки.
export async function refreshApp(): Promise<void> {
  try {
    await swReg?.update();
  } catch {
    /* офлайн / нет сети — всё равно перезагружаем */
  }
  if (updateSW) {
    try {
      await updateSW(true); // skipWaiting + reload (если есть ждущий SW)
    } catch {
      /* ignore */
    }
  }
  // Гарантированный reload (если ждущего SW не было, updateSW(true) не перезагружает).
  location.reload();
}
