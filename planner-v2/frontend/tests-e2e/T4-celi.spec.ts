import { test, expect } from "./_telegram";

// ── КОНТРАКТ T4 «Цели» — список проектов-целей ──
// Источник: V3 база-проекта-v3/pages/T4-celi.html + T4-flows.html / T4-состояния.html + реестр-мокапов.md.
// Покрывает то, что рендерит preview-t4-mock (экран Goals целиком):
//   A1 пульс/обзор · A2/A7 карточки-цели (имя·кольцо·этапы·веха·AI) · A3 %шанс · A4 полоски этапов ·
//   A5 след. веха · A6 AI-заметка (ускорить/риск) · A8 кнопка нового проекта · состояния empty/error.
// Заголовок каждого test() = критерий приёмки. Тест — исполняемый контракт.

const HAPPY = "preview-t4-mock.html";
const EMPTY = "preview-t4-mock.html?state=empty";
const ERROR = "preview-t4-mock.html?state=error";

// ── СТРУКТУРА + ПОВЕДЕНИЕ (детерминированно, оба браузера) ──

test("пульс: 3 проекта · 2 в графике · 1 отстаёт + сводка дня/недели (ecode A1)", async ({ page }) => {
  await page.goto(HAPPY);
  const pulse = page.getByTestId("goals-pulse");
  await expect(pulse).toContainText("3");
  await expect(pulse).toContainText("2 в графике");
  await expect(pulse).toContainText("1 отстаёт");
  await expect(pulse).toContainText("сегодня 5");
  await expect(pulse).toContainText("12/18 закрыто");
});

test("карточки целей отрисованы с именем (ecode A2, A7)", async ({ page }) => {
  await page.goto(HAPPY);
  await expect(page.getByTestId("goal-card-1")).toBeVisible();
  await expect(page.getByTestId("goal-card-2")).toBeVisible();
  await expect(page.getByTestId("goal-card-3")).toBeVisible();
  await expect(page.getByTestId("goal-name-1")).toHaveText("Продать студию ZIMA");
  // A7 = вторая карточка (кросс-реф ·T4d на детальный экран)
  await expect(page.getByTestId("goal-name-2")).toHaveText("Закрыть протокол здоровья");
});

test("кольцо показывает %шанс ИИ (ecode A3)", async ({ page }) => {
  await page.goto(HAPPY);
  const ring = page.getByTestId("goal-ring-1");
  await expect(ring).toContainText("72%");
  await expect(ring).toContainText("ШАНС");
});

test("полоски этапов: активные (done/current/late) подсвечены (ecode A4)", async ({ page }) => {
  await page.goto(HAPPY);
  // card1: 5 этапов, 3 активных (done·done·current)
  await expect(page.getByTestId("goal-stages-1").locator("i")).toHaveCount(5);
  await expect(page.getByTestId("goal-stages-1").locator("i.on")).toHaveCount(3);
  // card2: late-этап тоже «on» → 2 подсвечено (done·late)
  await expect(page.getByTestId("goal-stages-2").locator("i.on")).toHaveCount(2);
});

test("след. веха = активный этап, late показывается как блокер (ecode A5)", async ({ page }) => {
  await page.goto(HAPPY);
  await expect(page.getByTestId("goal-card-1")).toContainText("След. веха:");
  await expect(page.getByTestId("goal-card-1")).toContainText("Переговоры с покупателем");
  // card2 — активный этап просрочен (late), он и есть следующая веха
  await expect(page.getByTestId("goal-card-2")).toContainText("Сдать расширенные анализы");
});

test("AI-заметка: ускорить (fast) и риск (risk) (ecode A6)", async ({ page }) => {
  await page.goto(HAPPY);
  const fast = page.getByTestId("goal-ai-1");
  await expect(fast).toHaveClass(/fast/);
  await expect(fast).toContainText("Ускорить");
  const risk = page.getByTestId("goal-ai-2");
  await expect(risk).toHaveClass(/risk/);
  await expect(risk).toContainText("Отстаёшь");
});

test("кнопка «+ Новый проект — разобрать с ИИ» (ecode A8)", async ({ page }) => {
  await page.goto(HAPPY);
  await expect(page.getByTestId("goal-new")).toContainText("Новый проект");
});

// ── СОСТОЯНИЯ ──

test("пустой список — стаб «Пока нет целей» + кнопка нового (состояние empty)", async ({ page }) => {
  await page.goto(EMPTY);
  await expect(page.getByTestId("goals-empty")).toBeVisible();
  await expect(page.getByTestId("goals-empty")).toContainText("Пока нет целей");
  await expect(page.getByTestId("goal-new")).toBeVisible();
  await expect(page.locator(".t4-card")).toHaveCount(0);
});

test("ошибка загрузки — стаб + «Повторить» (состояние error)", async ({ page }) => {
  await page.goto(ERROR);
  await expect(page.getByTestId("goals-error")).toBeVisible();
  await expect(page.getByTestId("goals-error")).toContainText("Не удалось загрузить");
  await expect(page.getByTestId("goals-error").getByText("Повторить")).toBeVisible();
});

// ── ТОКЕН-СМОУК (var() резолвится в нужный цвет; оба браузера) ──

test("кольцо красится в цвет проекта (--c = ZIMA #3FB68B)", async ({ page }) => {
  await page.goto(HAPPY);
  await expect(page.getByTestId("goal-ring-1").locator(".v")).toHaveCSS("color", "rgb(63, 182, 139)");
});

test("AI-риск красится в Signal Red (#FF5C5C)", async ({ page }) => {
  await page.goto(HAPPY);
  await expect(page.getByTestId("goal-ai-2")).toHaveCSS("color", "rgb(255, 92, 92)");
});

test("полоска активного этапа = цвет проекта, фон-трек = ring-track (#2C2D31)", async ({ page }) => {
  await page.goto(HAPPY);
  await expect(page.getByTestId("goal-stages-1").locator("i.on").first())
    .toHaveCSS("background-color", "rgb(63, 182, 139)");
  await expect(page.getByTestId("goal-stages-1").locator("i:not(.on)").first())
    .toHaveCSS("background-color", "rgb(44, 45, 49)");
});

// ── ВИЗУАЛ-BASELINE (только chromium; эталон утверждает ЧЕЛОВЕК один раз) ──
// Первый прогон БЕЗ эталона = FAIL (это и есть гейт). Владелец смотрит и утверждает:
//   npx playwright test T4-celi --update-snapshots --project=chromium
// Агент/CI эталон НЕ обновляет (playwright.config: updateSnapshots:"none").

test.describe("визуал-baseline", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "baseline только на chromium");

  test("Цели · happy совпадает с эталоном", async ({ page }) => {
    await page.goto(HAPPY);
    await expect(page.getByTestId("goals-ready")).toBeVisible();
    await expect(page.getByTestId("screen-goals-host")).toHaveScreenshot("T4-celi-happy.png");
  });

  test("Цели · empty совпадает с эталоном", async ({ page }) => {
    await page.goto(EMPTY);
    await expect(page.getByTestId("goals-empty")).toBeVisible();
    await expect(page.getByTestId("screen-goals-host")).toHaveScreenshot("T4-celi-empty.png");
  });
});

// ── COVERAGE-DEFER (НЕ покрыто здесь — явно, не тихо) ──
// T4d ДЕТАЛЬНЫЙ ЭКРАН (тап карточки A2·T4d / A7·T4d → этапы→задачи→разбор ИИ): отдельный экран,
//   ещё не построен (мокап T4d-celi-detail.html). Строится следующим блоком.
// Бэк-пробелы T4d: недельная дельта %шанс (нет истории) + структурный разбор AI-заметок (плоский список) — потом.
// A8 «новый проект» = информер (tg.showPopup, ZERO-AFK: разбор в Claude Code, не в app) — поведение попапа
//   зависит от Telegram WebApp API, в preview заглушено; покрыт факт рендера кнопки.
