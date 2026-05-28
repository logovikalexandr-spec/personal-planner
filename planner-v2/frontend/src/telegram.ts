type TG = typeof window.Telegram.WebApp;

export function tg(): TG | undefined {
  return window.Telegram?.WebApp;
}

// Бренд фиксированный (тёмная тема + оранжевый из DESIGN.md).
// Цвета Telegram НЕ подхватываем; только сообщаем нативному chrome наш фон и разворачиваем окно.
export function applyTelegramTheme(): void {
  const w = tg();
  if (!w) return;
  w.ready();
  w.expand?.();
  w.setBackgroundColor?.("#0f0f11");
  w.setHeaderColor?.("#0f0f11");
}
