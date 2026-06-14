import { test as base, type Page } from "@playwright/test";

// Застаблить Telegram WebApp до загрузки документа, чтобы preview/прод не зависели
// от живого Telegram-клиента (initData/тема/expand). Используется как fixture.
export const TELEGRAM_INIT = `
  window.Telegram = {
    WebApp: {
      initData: "",
      initDataUnsafe: { user: { id: 1, first_name: "Test" } },
      colorScheme: "dark",
      themeParams: { bg_color: "#0F0F11", text_color: "#f4f4f5" },
      viewportHeight: 844, viewportStableHeight: 844,
      isExpanded: true,
      ready() {}, expand() {}, close() {},
      onEvent() {}, offEvent() {},
      MainButton: { show(){}, hide(){}, setText(){}, onClick(){}, offClick(){} },
      BackButton: { show(){}, hide(){}, onClick(){}, offClick(){} },
      HapticFeedback: { impactOccurred(){}, notificationOccurred(){}, selectionChanged(){} },
      showConfirm(_m, cb) { cb && cb(true); },
      showAlert(_m, cb) { cb && cb(); },
      setHeaderColor(){}, setBackgroundColor(){},
    },
  };
`;

export async function stubTelegram(page: Page) {
  await page.addInitScript(TELEGRAM_INIT);
}

// Расширенный test: Telegram застаблен перед каждым переходом.
export const test = base.extend({
  page: async ({ page }, use) => {
    await stubTelegram(page);
    await use(page);
  },
});

export { expect } from "@playwright/test";
