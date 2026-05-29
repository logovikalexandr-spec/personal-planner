type TG = typeof window.Telegram.WebApp;

export function tg(): TG | undefined {
  return window.Telegram?.WebApp;
}

// Фон наследуем от Telegram (--tg-theme-bg-color), как в Ledger.
// Не навязываем свой bg/header — пусть совпадает с нативным фоном клиента.
export function applyTelegramTheme(): void {
  const w = tg();
  if (!w) return;
  w.ready();
  w.expand?.();
  // Глушим вертикальный свайп вниз, который сворачивает/закрывает Mini App (Bot API 7.7+).
  (w as { disableVerticalSwipes?: () => void }).disableVerticalSwipes?.();
}
