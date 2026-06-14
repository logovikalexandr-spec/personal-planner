import { test, expect } from "./_telegram";

// ── КОНТРАКТ T1 «Сегодня» (ПОЛНЫЙ ЭКРАН) — расширение golden example ──
// Покрывает хром Today + persist: A1 бургер · A2 датапикер · A3 jump · A4 саммари ·
// A5 all-day «+N» · draft-создание · persist после refresh (stateful-мок).
// A6 (блок-задача) + токен-смоук + визуал timeline — в T1-today.spec.ts.
// Источник: src/screens/Today.tsx, V3 T1-zadachi/flows/состояния, реестр T1.

const FULL = "preview-t1-full-mock.html";

// Создание черновика = ТОЛЬКО удержание (long-press) пустой сетки; тап не создаёт.
// Жмём на пустую область ниже task-1 (видна, без блока) и держим >220ms без сдвига.
async function longPressEmpty(page: import("@playwright/test").Page) {
  const anchor = await page.getByTestId("task-1").boundingBox();
  if (!anchor) throw new Error("нет геометрии task-1");
  const x = anchor.x + 40;
  const y = anchor.y + 96; // ~+1.7ч ниже блока 09:00 → пустой час
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(300); // > LONGPRESS_MS (220ms)
  await page.mouse.up();
}

// ── ХРОМ + ПОВЕДЕНИЕ (детерминированно, оба браузера) ──

test("A1 — бургер открывает шторку (вызывает onOpenDrawer)", async ({ page }) => {
  await page.goto(FULL);
  await expect(page.getByTestId("screen-today-full")).toHaveAttribute("data-drawer", "closed");
  await page.getByTestId("btn-burger").click();
  await expect(page.getByTestId("screen-today-full")).toHaveAttribute("data-drawer", "open");
});

test("A2 — чип-дата открывает датапикер", async ({ page }) => {
  await page.goto(FULL);
  await expect(page.locator(".cal-mini")).toHaveCount(0);
  await page.getByTestId("btn-date").click();
  await expect(page.locator(".cal-mini")).toBeVisible(); // мини-календарь DateJumpSheet
});

// ── T1·B датапикер = поповер (не бот-шит), квадраты-heat, 1 кнопка (контракт мокапа) ──

test("T1·B — пикер = поповер, ячейки квадратные (не круги)", async ({ page }) => {
  await page.goto(FULL);
  await page.getByTestId("btn-date").click();
  await expect(page.getByTestId("datepicker")).toBeVisible();
  await expect(page.locator(".cal-mini-day").first()).toHaveCSS("border-radius", "9px"); // не 50% (круг)
});

test("T1·B — одна кнопка «Сегодня», нет «Открыть день»", async ({ page }) => {
  await page.goto(FULL);
  await page.getByTestId("btn-date").click();
  await expect(page.getByTestId("datepicker")).not.toContainText("Открыть день");
  await expect(page.getByTestId("datepicker").getByRole("button", { name: "Сегодня" })).toBeVisible();
});

test("T1·B — тап дня применяет сразу (пикер закрылся, дата сменилась)", async ({ page }) => {
  await page.goto(FULL);
  await page.getByTestId("btn-date").click();
  await page.getByTestId("datepicker").getByText("4", { exact: true }).click();
  await expect(page.getByTestId("datepicker")).toHaveCount(0);      // применил → закрылся
  await expect(page.getByTestId("btn-date")).toContainText("4 июня"); // чип = новый день (DOM lower-case, capitalize визуальный)
});

test("A3 — на сегодня показан jump «Сейчас»", async ({ page }) => {
  await page.goto(FULL);
  await expect(page.getByTestId("btn-today-jump")).toHaveText("Сейчас");
});

test("A4 — саммари показывает счёт задач", async ({ page }) => {
  await page.goto(FULL);
  await expect(page.getByTestId("text-summary")).toHaveText("5 задач · 0 закрыто");
});

test("A5 — all-day: 2 чипа + «+N ещё», разворот показывает все", async ({ page }) => {
  await page.goto(FULL);
  const chips = page.locator(".cal-allday-chips .cal-chip:not(.cal-chip-more)");
  await expect(chips).toHaveCount(2);
  await expect(page.getByTestId("btn-allday-expand")).toBeVisible();
  await page.getByTestId("btn-allday-expand").click();
  await expect(chips).toHaveCount(3);
  await expect(page.getByTestId("btn-allday-expand")).toHaveCount(0);
});

test("draft — удержание пустого часа открывает инлайн-черновик", async ({ page }) => {
  await page.goto(FULL);
  await longPressEmpty(page);
  await expect(page.locator(".cal-draft-input")).toBeVisible();
});

test("тап пустого часа НЕ создаёт черновик (создание только удержанием)", async ({ page }) => {
  await page.goto(FULL);
  await page.getByTestId("cal-grid").click({ position: { x: 200, y: 520 } }); // короткий тап
  await expect(page.locator(".cal-draft-input")).toHaveCount(0);
});

// ── A7 FAB-пилюля «Список» (иконка + ярлык + позиция впритык к [+]) ──

test("A7 — FAB-пилюля «Список» с иконкой", async ({ page }) => {
  await page.goto(FULL);
  const pill = page.locator(".fab-secondary");
  await expect(pill).toHaveText("Список");        // ярлык, не «Задачи»
  await expect(pill.locator("svg")).toBeVisible(); // иконка списка есть
});

test("A7 — пилюля стоит впритык СЛЕВА от круглого [+]", async ({ page }) => {
  await page.goto(FULL);
  const pill = await page.locator(".fab-secondary").boundingBox();
  const plus = await page.locator(".fab:not(.fab-secondary)").boundingBox();
  if (!pill || !plus) throw new Error("нет геометрии FAB");
  expect(pill.x + pill.width).toBeLessThanOrEqual(plus.x + 1); // пилюля левее [+]
  expect(Math.abs(pill.y - plus.y)).toBeLessThan(8);           // на одной линии (кластер)
  expect(plus.x - (pill.x + pill.width)).toBeLessThan(20);     // впритык, не в др. углу
});

test("подсказки «свайп — другой день» нет (фича убрана)", async ({ page }) => {
  await page.goto(FULL);
  await expect(page.getByTestId("swipe-hint")).toHaveCount(0);
});

// ── PERSIST после refresh (stateful-мок: создание выживает reload) ──

test("persist — созданная задача переживает обновление страницы", async ({ page }) => {
  await page.goto(`${FULL}?persist=1`);
  await page.evaluate(() => localStorage.removeItem("preview-t1-store"));
  await page.reload();

  await longPressEmpty(page);
  await page.locator(".cal-draft-input").fill("Тест persist");
  await page.locator(".cal-accessory button").click(); // «Готово» → POST
  await expect(page.getByText("Тест persist")).toBeVisible();

  await page.reload(); // ← ключ: после обновления задача всё ещё есть (сохранилась)
  await expect(page.getByText("Тест persist")).toBeVisible();
});

// ── DRAG таймблока (native-pointer + long-press; chromium) ──
test.describe("drag таймблока", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "native-pointer drag: chromium");

  test("перенос блока вниз на 1ч меняет время (snap-15)", async ({ page }) => {
    await page.goto(FULL);
    const block = page.getByTestId("task-1");
    await expect(block).toContainText("09:00–10:00");
    const box = await block.locator(".cal-block-main").boundingBox();
    if (!box) throw new Error("нет геометрии блока");
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(300);                  // long-press «поднять» (220ms)
    await page.mouse.move(cx, cy + 56, { steps: 10 }); // +56px = +1ч (HOUR_H)
    await page.mouse.up();
    await expect(block).not.toContainText("09:00–10:00"); // время сдвинулось
    await expect(block).toContainText("10:00–11:00");      // +1ч, прилипло к сетке
  });
});

// ── ВИЗУАЛ-BASELINE полного экрана (chromium, часы заморожены) ──
test.describe("визуал-baseline (полный экран)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "baseline только на chromium");
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date("2026-06-14T15:30:00") });
  });

  test("Сегодня полный · happy совпадает с эталоном", async ({ page }) => {
    await page.goto(FULL);
    await expect(page.getByTestId("screen-today-full")).toHaveScreenshot("T1-full-happy.png");
  });
});

// ── COVERAGE-DEFER ──
// A7 FAB-пилюля покрыта (иконка/ярлык/позиция) на Fab-компоненте в харнесе. НЕ покрыто:
//   App-wiring — что App.tsx реально передаёт label="Список", и ярлыки таб-бара
//   (Сегодня→Задачи, Списки→Гант) — это App-уровень, нужен preview <App/> (след. шаг).
// Реальный backend-persist (не stateful-мок) — деплой-гейт (тот же сьют против прод-URL).
// drag webkit — пока только chromium (native-pointer на webkit проверить отдельно).
