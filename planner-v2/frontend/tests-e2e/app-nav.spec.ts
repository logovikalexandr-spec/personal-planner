import { test, expect } from "./_telegram";

// ── КОНТРАКТ App-уровня (нав-бар + FAB-wiring) на РЕАЛЬНОМ App ──
// preview-app-mock рендерит настоящий <App/> с мок-сетью → тест ловит дрейф самого App
// (ярлыки табов, label FAB), а не харнеса. Источник IA: реестр-мокапов + нав мокапов V3.
// IA-истина (мокап): Задачи · Календарь · Гант · Цели · Привычки. Списки — в шторке (бургер).

const APP = "preview-app-mock.html";

test("нав-бар = мокап (Задачи·Календарь·Гант·Цели·Привычки)", async ({ page }) => {
  await page.goto(APP);
  const tabs = page.locator(".tabbar button");
  await expect(tabs).toHaveCount(5);
  await expect(tabs).toContainText(["Задачи", "Календарь", "Гант", "Цели", "Привычки"]);
});

test("в табах НЕТ старых ярлыков «Сегодня»/«Списки»", async ({ page }) => {
  await page.goto(APP);
  const labels = await page.locator(".tabbar button span").allInnerTexts();
  expect(labels).not.toContain("Сегодня");
  expect(labels).not.toContain("Списки");
});

test("FAB-пилюля на Задачах = «Список» (реальный App-wiring)", async ({ page }) => {
  await page.goto(APP);
  await expect(page.locator(".fab-secondary")).toHaveText("Список");
});

// ── COVERAGE-DEFER ──
// Списки в шторке (бургер→ProjectTreePanel) — открытие/контент не покрыты тут.
// Привычки-таб в этом моке падает (форма мок-данных heat, не дрейф App) — отдельный мок нужен.
// Гант — заглушка (экран T3 не построен).
