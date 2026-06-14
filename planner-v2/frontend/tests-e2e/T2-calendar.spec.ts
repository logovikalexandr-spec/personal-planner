import { test, expect } from "./_telegram";

// ── КОНТРАКТ T2 «Календарь» — Неделя / Месяц / Лента ──
// Источник: V3 T2a/b/c + T2-flows + T2-состояния + реестр-мокапов.md.
// Preview: preview-t2-mock (полный экран Calendar, stateful fetch-мок).
// Ecode-коды повторяются между тремя видами (coverage.sh гоняется по каждому мокапу):
//   A1 сегмент-переключатель · A2 диапазон/Сегодня · A3 «весь день»/сетка/строка ·
//   A4 сегодня-выделение/дедлайн · A5 веха-флажок/Завтра · A6 блок-задача/блокер ·
//   A7 пилюля всё-день·DETAIL/этап · A8 лоток «Без даты»/свободно.
// Заголовок test() = критерий приёмки.

const WEEK = "preview-t2-mock.html";
const EMPTY = "preview-t2-mock.html?state=empty";
const ERROR = "preview-t2-mock.html?state=error";
// Час в окне недели (8–21) → линия «сейчас» детерминирована (иначе ночью null).
const NOON = new Date("2026-06-15T10:00:00"); // 2026-06-15 = понедельник

// Открыть вид кликом по сегменту (надёжнее URL-параметра).
async function openView(page: import("@playwright/test").Page, v: "week" | "month" | "agenda", url = WEEK) {
  await page.goto(url);
  if (v !== "week") await page.getByTestId(`seg-${v}`).click();
}

// ── A1: сегмент Неделя/Месяц/Лента переключает вид ──
test("сегмент переключает три вида (A1)", async ({ page }) => {
  await page.goto(WEEK);
  await expect(page.getByTestId("screen-calendar")).toHaveAttribute("data-view", "week");
  await page.getByTestId("seg-month").click();
  await expect(page.getByTestId("screen-calendar")).toHaveAttribute("data-view", "month");
  await expect(page.getByTestId("cal-month")).toBeVisible();
  await page.getByTestId("seg-agenda").click();
  await expect(page.getByTestId("screen-calendar")).toHaveAttribute("data-view", "agenda");
  await expect(page.getByTestId("cal-agenda")).toBeVisible();
});

// ── НЕДЕЛЯ ──
test("неделя: 7 колонок-дней + диапазон + навигация (A2)", async ({ page }) => {
  await page.goto(WEEK);
  await expect(page.locator('[data-testid="cal-week"] .cw-col')).toHaveCount(7);
  const before = await page.getByTestId("cal-range").textContent();
  await page.getByTestId("cal-next").click();
  await expect(page.getByTestId("cal-range")).not.toHaveText(before ?? "");
  // ушли с текущего периода → кнопка «Сегодня» вернулась
  await expect(page.getByTestId("cal-today")).toBeVisible();
  await page.getByTestId("cal-today").click();
  await expect(page.getByTestId("cal-range")).toHaveText(before ?? "");
});

test("неделя: полоска «весь день» с пилюлей (A3, A7)", async ({ page }) => {
  await page.goto(WEEK);
  await expect(page.locator('[data-testid="cal-week"] .cw-adrow .cw-pill').first()).toContainText("Договор");
});

test("неделя: сегодня-колонка выделена + линия сейчас (A4)", async ({ page }) => {
  await page.clock.install({ time: NOON });
  await page.goto(WEEK);
  await expect(page.locator('[data-testid="cal-week"] .cw-dh.today')).toHaveCount(1);
  await expect(page.getByTestId("cw-now")).toBeVisible();
});

test("неделя: веха-флажок на числе (A5)", async ({ page }) => {
  await page.goto(WEEK);
  await expect(page.locator('[data-testid="cal-week"] .cw-pen').first()).toBeVisible();
});

test("неделя: таймблоки + каскад наложений (A6, G2)", async ({ page }) => {
  await page.goto(WEEK);
  await expect(page.getByTestId("cw-blk-1")).toContainText("Звонок покупателю");
  await expect(page.getByTestId("cw-blk-5")).toHaveClass(/c1/);
  await expect(page.getByTestId("cw-blk-6")).toHaveClass(/c2/);
});

test("неделя: лоток «Без даты» сворачивается/раскрывается (A8)", async ({ page }) => {
  await page.goto(WEEK);
  const tray = page.getByTestId("cw-tray");
  await expect(tray).toContainText("Без даты · 4");
  await expect(tray).toHaveAttribute("data-open", "0");
  await tray.locator(".cw-th").click();
  await expect(tray).toHaveAttribute("data-open", "1");
  await expect(tray.locator(".cw-ucard").first()).toBeVisible();
});

// ── МЕСЯЦ ──
test("месяц: сетка + сегодня-кольцо + панель дня по тапу (A3, A4)", async ({ page }) => {
  await page.clock.install({ time: NOON });
  await openView(page, "month");
  await expect(page.getByTestId("cal-month")).toBeVisible();
  await expect(page.locator('[data-testid="cal-month"] .cm-cell.today')).toHaveCount(1);
  // тап дня → панель под сеткой (flow 10)
  await page.locator('[data-testid="cal-month"] .cm-cell.today').click();
  await expect(page.getByTestId("cm-daypanel")).toBeVisible();
});

test("месяц: сводка вех + флажок (A5, A2 Сегодня)", async ({ page }) => {
  await page.clock.install({ time: NOON });
  await openView(page, "month");
  await expect(page.getByTestId("cm-mstrip")).toContainText("Вехи");
  await expect(page.locator('[data-testid="cal-month"] .cm-flag').first()).toBeVisible();
});

// ── ЛЕНТА ──
test("лента: просрочка закреплена сверху (A2)", async ({ page }) => {
  await openView(page, "agenda");
  await expect(page.getByTestId("ca-overdue")).toContainText("Просрочено · 2");
});

test("лента: группы Сегодня/Завтра + строка свободно (A2, A5, A8)", async ({ page }) => {
  await page.clock.install({ time: NOON });
  await openView(page, "agenda");
  await expect(page.getByTestId("cal-agenda")).toContainText("Сегодня");
  await expect(page.getByTestId("cal-agenda")).toContainText("Завтра");
  await expect(page.locator('[data-testid="cal-agenda"] .ca-free').first()).toBeVisible();
});

test("лента: веха-строка + метка этапа + дедлайн-бейдж (A3, A4, A6, A7)", async ({ page }) => {
  await page.clock.install({ time: NOON });
  await openView(page, "agenda");
  await expect(page.getByTestId("ca-veha-103")).toContainText("Юр.готовность ZIMA");
  await expect(page.getByTestId("ca-veha-103")).toContainText("веха");
  await expect(page.getByTestId("ca-task-13")).toContainText("этап 4");
  await expect(page.locator('[data-testid="cal-agenda"] .ca-danger').first()).toContainText("важно");
});

test("лента: чекбокс закрывает задачу не уходя с ленты", async ({ page }) => {
  await page.clock.install({ time: NOON });
  await openView(page, "agenda");
  const row = page.getByTestId("ca-task-11");
  await row.locator(".ca-chk").click();
  await expect(row.locator(".ca-chk")).toHaveClass(/done/);
});

// ── СОСТОЯНИЯ ──
test("пусто: лоток 0, нет блоков (состояние empty)", async ({ page }) => {
  await page.goto(EMPTY);
  await expect(page.getByTestId("cw-tray")).toContainText("Без даты · 0");
  await expect(page.locator('[data-testid="cal-week"] .cw-blk')).toHaveCount(0);
});

test("ошибка: сообщение + Повторить (состояние error)", async ({ page }) => {
  await page.goto(ERROR);
  await expect(page.getByTestId("cal-error")).toContainText("Не удалось загрузить");
  await expect(page.getByTestId("cal-error").getByRole("button", { name: "Повторить" })).toBeVisible();
});

// ── ТОКЕН-СМОУК (var() → цвет DESIGN.md) ──
test("кант высокого приоритета = Signal Red (#FF5C5C)", async ({ page }) => {
  await page.goto(WEEK);
  await expect(page.getByTestId("cw-blk-1")).toHaveCSS("border-left-color", "rgb(255, 92, 92)");
});

test("линия сейчас = Ember (#EE8A3C)", async ({ page }) => {
  await page.clock.install({ time: NOON });
  await page.goto(WEEK);
  await expect(page.getByTestId("cw-now")).toHaveCSS("background-color", "rgb(238, 138, 60)");
});

// ── ВИЗУАЛ-BASELINE (chromium; эталон утверждает ЧЕЛОВЕК) ──
// npx playwright test T2-calendar --update-snapshots --project=chromium
test.describe("визуал-baseline", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "baseline только на chromium");
  // 2026-06-15 = понедельник; 10:00 в окне недели → now-line детерминирован.
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date("2026-06-15T10:00:00") });
  });
  test("Неделя · happy", async ({ page }) => {
    await page.goto(WEEK);
    await expect(page.getByTestId("screen-calendar")).toHaveScreenshot("T2-week-happy.png");
  });
  test("Месяц · happy", async ({ page }) => {
    await openView(page, "month");
    await expect(page.getByTestId("cal-month")).toBeVisible();
    await expect(page.getByTestId("screen-calendar")).toHaveScreenshot("T2-month-happy.png");
  });
  test("Лента · happy", async ({ page }) => {
    await openView(page, "agenda");
    await expect(page.getByTestId("cal-agenda")).toBeVisible();
    await expect(page.getByTestId("screen-calendar")).toHaveScreenshot("T2-agenda-happy.png");
  });
});

// ── COVERAGE-DEFER (НЕ покрыто, явно) ──
// Драг таймблока (перенос+ресайз, flow 5) и драг карточки из лотка на сетку (flow 8) —
//   требуют pointer-харнес + бэк-PATCH времени; строятся следующими (как drag T1).
// Тап задачи/вехи → DETAIL (flow 4/7): открытие TaskDetail проверяется отдельным интегро-тестом.
// Различие дедлайн vs блокер бейджа (T2c A4/A6) — нужен флаг типа дедлайна в модели (сейчас оба = high-приоритет «важно»).
// Создание по тапу пустого слота недели (flow 2) — открывает TaskComposer (общий компонент, покрыт в T1).
