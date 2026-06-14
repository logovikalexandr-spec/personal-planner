import { test, expect } from "./_telegram";

// ── КОНТРАКТ T1 «Сегодня» (timeline-часть) — golden example конвейера v2 ──
// Источник: V3 T1-zadachi.html / T1-flows.html / T1-состояния.html + реестр-мокапов.md.
// Покрывает то, что рендерит preview-today-mock (DayTimeline):
//   A6 блок-задача (фон=проект, кант=приоритет, метка этапа) + now-line + состояние empty (timeline).
// НЕ покрыто здесь (нужен полноэкранный preview Today, не только DayTimeline) — см. COVERAGE-DEFER внизу.
// Заголовок каждого test() = критерий приёмки. Тест — исполняемый контракт (не инертный YAML).

const HAPPY = "preview-today-mock.html";
const EMPTY = "preview-today-mock.html?state=empty";

// ── СТРУКТУРА + ПОВЕДЕНИЕ (детерминированно, оба браузера) ──

test("таймлайн показывает обе задачи дня (ecode A6)", async ({ page }) => {
  await page.goto(HAPPY);
  await expect(page.getByTestId("task-1")).toBeVisible();
  await expect(page.getByTestId("task-2")).toBeVisible();
  await expect(page.locator(".cal-block")).toHaveCount(2);
});

test("блок-задача несёт метку этапа и время (ecode A6)", async ({ page }) => {
  await page.goto(HAPPY);
  await expect(page.getByTestId("task-1")).toContainText("Созвон с командой ZIMA");
  await expect(page.getByTestId("task-1")).toContainText("этап 3");
  await expect(page.getByTestId("task-1")).toContainText("09:00–10:00");
  // late-этап помечается «!»
  await expect(page.getByTestId("task-2")).toContainText("этап 1 !");
});

test("вклад-токен показан при impact ≥ 30 (80%)", async ({ page }) => {
  await page.goto(HAPPY);
  await expect(page.getByTestId("task-1").locator(".imp")).toHaveText("80%");
});

test("на сегодня рендерится now-line", async ({ page }) => {
  await page.goto(HAPPY);
  await expect(page.getByTestId("now-line")).toBeVisible();
});

test("пустой день — нет блоков (состояние empty timeline)", async ({ page }) => {
  await page.goto(EMPTY);
  await expect(page.locator(".cal-block")).toHaveCount(0);
  await expect(page.getByTestId("cal-grid")).toBeVisible(); // сетка остаётся
});

// ── ТОКЕН-СМОУК (var() резолвится в нужный цвет DESIGN.md; оба браузера) ──

test("кант высокого приоритета = Signal Red (#FF5C5C)", async ({ page }) => {
  await page.goto(HAPPY);
  await expect(page.getByTestId("task-2")).toHaveCSS("border-left-color", "rgb(255, 92, 92)");
});

test("now-line = Ember (#EE8A3C)", async ({ page }) => {
  await page.goto(HAPPY);
  await expect(page.getByTestId("now-line")).toHaveCSS("background-color", "rgb(238, 138, 60)");
});

// ── ВИЗУАЛ-BASELINE (только chromium; эталон утверждает ЧЕЛОВЕК один раз) ──
// Первый прогон БЕЗ эталона = FAIL (это и есть гейт). Владелец смотрит и утверждает:
//   npx playwright test T1-today --update-snapshots --project=chromium
// Агент/CI эталон НЕ обновляет (playwright.config: updateSnapshots:"none").

test.describe("визуал-baseline", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "baseline только на chromium");

  test("Сегодня · happy совпадает с эталоном", async ({ page }) => {
    await page.goto(HAPPY);
    await expect(page.getByTestId("screen-today")).toHaveScreenshot("T1-today-happy.png");
  });

  test("Сегодня · empty совпадает с эталоном", async ({ page }) => {
    await page.goto(EMPTY);
    await expect(page.getByTestId("screen-today")).toHaveScreenshot("T1-today-empty.png");
  });
});

// ── COVERAGE-DEFER (НЕ покрыто этим golden example, не тихо — явно) ──
// Требуют полноэкранного preview Today (не только DayTimeline) или интеграции с бэком:
//   A1 бургер→шторка · A2 чип-дата→датапикер · A3 чип Сейчас/Сегодня · A4 саммари ·
//   A5 all-day зона+«+N» · A7 FAB Список/[+] + empty-подсказка «День свободен» (полноэкранный Today) ·
//   inline-черновик (тап пустого часа) ·
//   drag/resize таймблока (snap-15) · persist после refresh (нужен реальный бэк).
// Эти строятся следующими: полноэкранный preview + behavior-тесты + деплой-гейт (тот же сьют против прод-URL).
