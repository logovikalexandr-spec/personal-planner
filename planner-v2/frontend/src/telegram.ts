type TG = typeof window.Telegram.WebApp;

export function tg(): TG | undefined {
  return window.Telegram?.WebApp;
}

// Подхватываем тему Telegram в CSS-переменные (свет/тьма от клиента).
export function applyTelegramTheme(): void {
  const w = tg();
  if (!w) return;
  const p = w.themeParams ?? {};
  const root = document.documentElement.style;
  if (p.bg_color) root.setProperty("--bg", p.bg_color);
  if (p.secondary_bg_color) root.setProperty("--surface", p.secondary_bg_color);
  if (p.text_color) root.setProperty("--text", p.text_color);
  if (p.hint_color) root.setProperty("--text-muted", p.hint_color);
  if (p.button_color) root.setProperty("--accent", p.button_color);
  if (p.button_text_color) root.setProperty("--accent-contrast", p.button_text_color);
  w.ready();
  w.expand?.();
}
