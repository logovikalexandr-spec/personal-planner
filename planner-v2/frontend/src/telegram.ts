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
  initKeyboardInset();
}

// Telegram iOS WebView НЕ ресайзит layout viewport под клавиатуру — она перекрывает контент.
// Считаем высоту клавиатуры через visualViewport и кладём в --kb-inset, чтобы bottom-sheet
// поднимался над клавиатурой (.sheet-backdrop { padding-bottom: var(--kb-inset) }).
let kbInited = false;
function initKeyboardInset(): void {
  if (kbInited) return;
  kbInited = true;
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => {
    const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty("--kb-inset", `${Math.round(inset)}px`);
  };
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  update();
}
