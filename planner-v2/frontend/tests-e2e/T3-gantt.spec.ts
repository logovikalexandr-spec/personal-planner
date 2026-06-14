import { test, expect } from "./_telegram";

// ── КОНТРАКТ T3 «Гант» (Волна 1, read-only PM-вид) ──
// Источник: V3 T3a-gantt-all.html / T3b-gantt-project.html / T3-flows.html / T3-состояния.html + реестр.
// Покрывает то, что рендерит preview-t3-mock (экран Gantt со stateful fetch-моком):
//   T3a (Все): seg A1/A2 · зум A3/A4/A5 · линия сегодня A6 · строка-проект A7 · бар текущего A8 · late-маркер · легенда.
//   T3b (Проект): чип A1 · критпуть A2 · строка-этап A3 · бар+% A4 · мини-бар задачи A5 · бар впереди A6 · стрелка-зависимость A7.
//   Состояния: нет проектов · нет этапов · загрузка · ошибка.
// Заголовок test() = критерий приёмки. Драг/ресайз/правка дат = Волна 2 (см. COVERAGE-DEFER).

const HAPPY = "preview-t3-mock.html";
const EMPTY = "preview-t3-mock.html?state=empty";
const NOSTAGES = "preview-t3-mock.html?state=nostages";
const ERROR = "preview-t3-mock.html?state=error";

// Часы морозим → линия «сегодня» и позиции баров детерминированы (иначе флак каждый день).
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-06-14T12:00:00") });
});

// ════════ T3a — режим «Все проекты» ════════

test("T3a: сегмент Все/По проекту, «Все» активен по умолчанию (ecode A1·A2)", async ({ page }) => {
  await page.goto(HAPPY);
  await expect(page.getByTestId("gantt-all")).toBeVisible();
  await expect(page.getByTestId("seg-all")).toHaveClass(/on/);
  await expect(page.getByTestId("seg-project")).toBeVisible();
});

test("T3a: зум День/Нед/Мес, «Мес» активен по умолчанию (ecode A3·A4·A5)", async ({ page }) => {
  await page.goto(HAPPY);
  await expect(page.getByTestId("zoom-month")).toHaveClass(/on/);
  await page.getByTestId("zoom-week").click();
  await expect(page.getByTestId("zoom-week")).toHaveClass(/on/);
  await page.getByTestId("zoom-day").click();
  await expect(page.getByTestId("zoom-day")).toHaveClass(/on/);
});

test("T3a: линия «сегодня» на сетке (ecode A6)", async ({ page }) => {
  await page.goto(HAPPY);
  await expect(page.getByTestId("gantt-today")).toBeVisible();
});

test("T3a: строки-проекты с барами этапов (ecode A7·A8)", async ({ page }) => {
  await page.goto(HAPPY);
  await expect(page.getByTestId("grow-1")).toContainText("ZIMA");
  await expect(page.getByTestId("grow-2")).toContainText("Здоровье");
  // текущий этап = пунктир-бар с заливкой (A8); хотя бы один cur-бар на доске
  await expect(page.locator(".gbar.cur").first()).toBeVisible();
});

test("T3a: отстающий этап помечен баром late + маркером «!»", async ({ page }) => {
  await page.goto(HAPPY);
  await expect(page.locator(".gbar.late").first()).toBeVisible();
  await expect(page.getByTestId("glate-22")).toHaveText("!");
});

test("T3a: тап строки-проекта → режим «По проекту» (ecode A7)", async ({ page }) => {
  await page.goto(HAPPY);
  await page.getByTestId("grow-1").click();
  await expect(page.getByTestId("gantt-project")).toBeVisible();
  await expect(page.getByTestId("gantt-projchip")).toContainText("ZIMA");
});

test("T3a: легенда статусов под гантом", async ({ page }) => {
  await page.goto(HAPPY);
  await expect(page.getByTestId("gantt-legend")).toContainText("сделано");
  await expect(page.getByTestId("gantt-legend")).toContainText("отставание");
});

// ════════ T3b — режим «По проекту» ════════

test("T3b: чип проекта + сегмент (ecode A1·A8)", async ({ page }) => {
  await page.goto(HAPPY);
  await page.getByTestId("seg-project").click();
  await expect(page.getByTestId("gantt-projchip")).toBeVisible();
  await expect(page.getByTestId("seg-project")).toHaveClass(/on/);
});

test("T3b: критический путь подписан (ecode A2)", async ({ page }) => {
  await page.goto(HAPPY);
  await page.getByTestId("seg-project").click();
  await expect(page.getByTestId("gantt-critnote")).toContainText("Критический путь");
  await expect(page.getByTestId("gantt-critnote")).toContainText("Переговоры");
  // критпуть = ember-обводка на незакрытых этапах цепочки
  await expect(page.locator(".gbar.crit").first()).toBeVisible();
});

test("T3b: строки-этапы + бар текущего с % (ecode A3·A4·A6)", async ({ page }) => {
  await page.goto(HAPPY);
  await page.getByTestId("seg-project").click();
  await expect(page.getByTestId("gstage-13")).toContainText("Переговоры");
  await expect(page.getByTestId("gbar-13").locator(".pct")).toHaveText("60%");
  // этап впереди (future) тоже есть
  await expect(page.locator(".gbar.fut").first()).toBeVisible();
});

test("T3b: мини-бары задач под текущим этапом (ecode A5)", async ({ page }) => {
  await page.goto(HAPPY);
  await page.getByTestId("seg-project").click();
  await expect(page.getByTestId("gtask-101")).toContainText("Подготовить презентацию");
  await expect(page.getByTestId("gtask-102")).toContainText("Согласовать цену");
});

test("T3b: стрелки зависимостей между этапами (ecode A7)", async ({ page }) => {
  await page.goto(HAPPY);
  await page.getByTestId("seg-project").click();
  await expect(page.getByTestId("gantt-deps")).toBeVisible();
});

test("T3b: тап бара-этапа → шит детали этапа", async ({ page }) => {
  await page.goto(HAPPY);
  await page.getByTestId("seg-project").click();
  await page.getByTestId("gbar-13").click();
  await expect(page.getByTestId("gantt-stage-sheet")).toContainText("Переговоры");
  await expect(page.getByTestId("gantt-stage-sheet")).toContainText("прогресс 60%");
});

test("тап вехи-ромба → поповер вехи", async ({ page }) => {
  await page.goto(HAPPY);
  await page.getByTestId("gmile").first().click();
  await expect(page.getByTestId("gantt-mile-pop")).toBeVisible();
});

// ════════ состояния ════════

test("состояние: нет проектов → пусто + подсказка в Цели", async ({ page }) => {
  await page.goto(EMPTY);
  await expect(page.getByTestId("gantt-empty")).toContainText("Пока нет проектов");
});

test("состояние: проект без этапов → сетка + «Нет этапов»", async ({ page }) => {
  await page.goto(NOSTAGES);
  await page.getByTestId("seg-project").click();
  await expect(page.getByTestId("gantt-nostages")).toContainText("этапов ещё нет");
  await expect(page.getByTestId("gantt-addstage")).toBeVisible();
});

test("состояние: ошибка загрузки → плашка + Повторить", async ({ page }) => {
  await page.goto(ERROR);
  await expect(page.getByTestId("gantt-error")).toContainText("Не удалось загрузить Гант");
  await expect(page.getByTestId("gantt-retry")).toBeVisible();
});

// ── ТОКЕН-СМОУК (var() резолвится в цвет DESIGN.md; оба браузера) ──

test("линия «сегодня» = Ember (#EE8A3C)", async ({ page }) => {
  await page.goto(HAPPY);
  await expect(page.getByTestId("gantt-today")).toHaveCSS("border-left-color", "rgb(238, 138, 60)");
});

test("late-бар = Signal Red (#FF5C5C) рамка", async ({ page }) => {
  await page.goto(HAPPY);
  await expect(page.locator(".gbar.late").first()).toHaveCSS("border-top-color", "rgb(255, 92, 92)");
});

// ── ВИЗУАЛ-BASELINE (только chromium; эталон утверждает ЧЕЛОВЕК один раз) ──
// Первый прогон БЕЗ эталона = FAIL (это и есть гейт). Владелец смотрит и утверждает:
//   npx playwright test T3-gantt --update-snapshots --project=chromium
// Агент/CI эталон НЕ обновляет (playwright.config: updateSnapshots:"none").

test.describe("визуал-baseline", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "baseline только на chromium");

  test("T3a · Все проекты (месяц) совпадает с эталоном", async ({ page }) => {
    await page.goto(HAPPY);
    await expect(page.getByTestId("gantt-today")).toBeVisible();
    await expect(page.getByTestId("screen-gantt")).toHaveScreenshot("T3a-all-month.png");
  });

  test("T3b · По проекту совпадает с эталоном", async ({ page }) => {
    await page.goto(HAPPY);
    await page.getByTestId("seg-project").click();
    await expect(page.getByTestId("gtask-101")).toBeVisible();
    await expect(page.getByTestId("screen-gantt")).toHaveScreenshot("T3b-project.png");
  });

  test("состояние · нет этапов совпадает с эталоном", async ({ page }) => {
    await page.goto(NOSTAGES);
    await page.getByTestId("seg-project").click();
    await expect(page.getByTestId("gantt-nostages")).toBeVisible();
    await expect(page.getByTestId("screen-gantt")).toHaveScreenshot("T3-nostages.png");
  });
});

// ── COVERAGE-DEFER (НЕ покрыто Волной 1 — явно, не тихо) ──
// Волна 2 (интерактив-редактирование, требует жест-харнес + оптимистичный апдейт + откат):
//   T3-flows #3 драг тела бара = сдвиг дат · #4 драг края = ресайз · #10 правка дат из шита ·
//   #11 удаление этапа (tg.showConfirm) · состояние «сдвиг не сохранился» (тост-откат) ·
//   #5 конфликт-зависимость при драге · pinch-to-zoom.
// App-уровень (не в preview экрана): A5·DETAIL — открытие TaskDetail из мини-бара задачи (нав App).
// Горизонт-скролл #8 + кнопка «◀ Сегодня» #9 — рендерятся (g-todaybtn), но появляются только при
//   уезде шкалы из вида в реальном скролл-контейнере Telegram; функц-тест отложен (скролл-эмуляция Волна 2).
