import { test, expect } from "./_telegram";

// ── КОНТРАКТ T1 «Сегодня» (ПОЛНЫЙ ЭКРАН) — расширение golden example ──
// Покрывает хром Today + persist: A1 бургер · A2 датапикер · A3 jump · A4 саммари ·
// A5 all-day «+N» · draft-создание · persist после refresh (stateful-мок).
// A6 (блок-задача) + токен-смоук + визуал timeline — в T1-today.spec.ts.
// Источник: src/screens/Today.tsx, V3 T1-zadachi/flows/состояния, реестр T1.

const FULL = "preview-t1-full-mock.html";

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

test("draft — тап пустого часа открывает инлайн-черновик", async ({ page }) => {
  await page.goto(FULL);
  await page.getByTestId("cal-grid").click({ position: { x: 200, y: 520 } }); // ~пустой час
  await expect(page.locator(".cal-draft-input")).toBeVisible();
});

// ── PERSIST после refresh (stateful-мок: создание выживает reload) ──

test("persist — созданная задача переживает обновление страницы", async ({ page }) => {
  await page.goto(`${FULL}?persist=1`);
  await page.evaluate(() => localStorage.removeItem("preview-t1-store"));
  await page.reload();

  await page.getByTestId("cal-grid").click({ position: { x: 200, y: 520 } });
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
// A7 FAB Список/[+] — живёт в App.tsx (App-уровень, не Today); нужен preview App с табами.
// drag/resize таймблока (snap-15, native-pointer 220ms long-press) — отдельный тест, риск флака.
// Реальный backend-persist (не stateful-мок) — деплой-гейт (тот же сьют против прод-URL).
