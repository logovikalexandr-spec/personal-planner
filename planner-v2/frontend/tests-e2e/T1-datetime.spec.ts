import { test, expect } from "./_telegram";

// ── Контракт пикера «Дата/время» (TickTick-переделка «Длительность») ──
// Открывается из quick-add (FAB «+» → чип «дата»). Один экран без вкладок:
// тумблер весь-день · календарь(heat)+спан · Начало · Дедлайн · метка длительности · Готово.
// Мокап: база-проекта-v3/pages/T1-datetime.html. Реальный App: preview-app-mock.

const APP = "preview-app-mock.html";

async function openPicker(page: import("@playwright/test").Page) {
  await page.goto(APP);
  await page.locator(".fab[aria-label='Добавить']").click(); // открыть quick-add
  await page.locator(".qa-chip", { hasText: "дата" }).click(); // открыть DateSheet
  await expect(page.locator(".cal-mini")).toBeVisible();
}

function dayBtn(page: import("@playwright/test").Page, n: string) {
  return page.locator(".cal-mini-day").filter({ hasText: new RegExp(`^${n}$`) });
}

test("DE1 — пикер без вкладок: тумблер весь-день + строки старт/дедлайн", async ({ page }) => {
  await openPicker(page);
  await expect(page.locator(".seg")).toHaveCount(0); // вкладок «Дата/Длительность» нет
  await expect(page.getByTestId("allday-toggle")).toBeVisible();
  await expect(page.getByTestId("dt-start")).toContainText("Начало");
  await expect(page.getByTestId("dt-end")).toContainText("Дедлайн");
});

test("DE2 — тап дня = начало, второй день позже = дедлайн + спан", async ({ page }) => {
  await openPicker(page);
  await dayBtn(page, "10").click();
  await expect(dayBtn(page, "10")).toHaveClass(/start/);
  await dayBtn(page, "17").click();
  await expect(dayBtn(page, "17")).toHaveClass(/end/);
  await expect(page.locator(".cal-mini-day.span")).not.toHaveCount(0); // дни между подсвечены
});

test("DE3 — многодневный спан → метка длительности в днях", async ({ page }) => {
  await openPicker(page);
  await dayBtn(page, "10").click();
  await dayBtn(page, "13").click();
  await expect(page.getByTestId("dur-label")).toContainText("4 дня");
});

test("DE4 — весь-день прячет ввод времени", async ({ page }) => {
  await openPicker(page);
  await expect(page.locator(".pill-time")).not.toHaveCount(0); // время видно
  await page.getByTestId("allday-toggle").click();
  await expect(page.locator(".pill-time")).toHaveCount(0); // скрыто
});

test("DE5 — Готово применяет (чип даты в quick-add обновился)", async ({ page }) => {
  await openPicker(page);
  await dayBtn(page, "12").click();
  await page.getByRole("button", { name: "Готово" }).click();
  await expect(page.locator(".cal-mini")).toHaveCount(0); // шит закрылся
  await expect(page.locator(".qa-chip.on", { hasText: /\d+ /})).not.toHaveCount(0); // чип даты активен
});
