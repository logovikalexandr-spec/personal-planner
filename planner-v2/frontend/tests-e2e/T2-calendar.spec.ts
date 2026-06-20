import { test, expect } from "./_telegram";

// ── КОНТРАКТ T2 «Календарь» — Дни (2/3/4/7) / Месяц / Лента ──
// Источник: V3 T2d (Дни) + T2b/c + реестр-мокапов.md.
// Preview: preview-t2-mock (полный экран Calendar, stateful fetch-мок).
// «Неделя» поглощена видом «Дни» (степпер 7 = неделя Пн–Вс). Колонка = DayTimeline compact.
//   A1 сегмент · A2 диапазон/Сегодня/нав · A3 «весь день» · A4 сегодня+now · A5 веха-флажок ·
//   A6 таймблок · A8 лоток «Без даты» · A9 степпер 2/3/4/7.
// Заголовок test() = критерий приёмки.

const VIEW = "preview-t2-mock.html";
const EMPTY = "preview-t2-mock.html?state=empty";
const ERROR = "preview-t2-mock.html?state=error";
// Час в рабочем окне → линия «сейчас» детерминирована. 2026-06-15 = понедельник.
const NOON = new Date("2026-06-15T10:00:00");

// Открыть нужное число дней (по умолчанию 2). 7 = неделя Пн–Вс (эквивалент старой «Недели»).
async function openDays(page: import("@playwright/test").Page, count: 2 | 3 | 4 | 7, url = VIEW) {
  await page.goto(url);
  if (count !== 2) await page.getByTestId(`dstep-${count}`).click();
}

// ── A1: сегмент Дни/Месяц/Лента переключает вид ──
test("сегмент переключает три вида (A1)", async ({ page }) => {
  await page.goto(VIEW);
  await expect(page.getByTestId("screen-calendar")).toHaveAttribute("data-view", "days");
  await page.getByTestId("seg-month").click();
  await expect(page.getByTestId("screen-calendar")).toHaveAttribute("data-view", "month");
  await expect(page.getByTestId("cal-month")).toBeVisible();
  await page.getByTestId("seg-agenda").click();
  await expect(page.getByTestId("screen-calendar")).toHaveAttribute("data-view", "agenda");
  await expect(page.getByTestId("cal-agenda")).toBeVisible();
});

// ── ДНИ ──
test("дни: дефолт = 2 колонки (CalendarDays), степпер 7 = недельный вид (A9)", async ({ page }) => {
  await page.goto(VIEW);
  await expect(page.locator('[data-testid="cal-days"] .cd-col')).toHaveCount(2);
  await page.getByTestId("dstep-3").click();
  await expect(page.locator('[data-testid="cal-days"] .cd-col')).toHaveCount(3);
  // «7» = старый недельный вид CalendarWeek (cw-col), не compact-колонки
  await page.getByTestId("dstep-7").click();
  await expect(page.locator('[data-testid="cal-week"] .cw-col')).toHaveCount(7);
});

// ── «7» = старый недельный вид (CalendarWeek) ──
test("дни=7: неделя 7 колонок + диапазон + навигация (A2)", async ({ page }) => {
  await openDays(page, 7);
  await expect(page.locator('[data-testid="cal-week"] .cw-col')).toHaveCount(7);
  const before = await page.getByTestId("cal-range").textContent();
  await page.getByTestId("cal-next").click();
  await expect(page.getByTestId("cal-range")).not.toHaveText(before ?? "");
  await expect(page.getByTestId("cal-today")).toBeVisible();
  await page.getByTestId("cal-today").click();
  await expect(page.getByTestId("cal-range")).toHaveText(before ?? "");
});

test("дни=7: полоска «весь день» с пилюлей (A3)", async ({ page }) => {
  await openDays(page, 7);
  await expect(page.locator('[data-testid="cal-week"] .cw-adrow .cw-pill').first()).toContainText("Договор");
});

test("дни=7: сегодня-колонка выделена + линия сейчас (A4)", async ({ page }) => {
  await page.clock.install({ time: NOON });
  await openDays(page, 7);
  await expect(page.locator('[data-testid="cal-week"] .cw-dh.today')).toHaveCount(1);
  await expect(page.getByTestId("cw-now")).toBeVisible();
});

test("дни=7: веха-флажок на числе (A5)", async ({ page }) => {
  await openDays(page, 7);
  await expect(page.locator('[data-testid="cal-week"] .cw-pen').first()).toBeVisible();
});

test("дни=7: таймблоки + каскад наложений (A6, G2)", async ({ page }) => {
  await openDays(page, 7);
  await expect(page.getByTestId("cw-blk-1")).toContainText("Звонок покупателю");
  await expect(page.getByTestId("cw-blk-5")).toHaveClass(/c1/);
  await expect(page.getByTestId("cw-blk-6")).toHaveClass(/c2/);
});

test("дни=3: тап числа → переход в таб «Задачи» (onOpenDay, CalendarDays)", async ({ page }) => {
  const logs: string[] = [];
  page.on("console", (m) => { if (m.text().startsWith("openDay")) logs.push(m.text()); });
  await openDays(page, 3);
  await page.locator('[data-testid="cal-days"] .cd-dh').first().click();
  await expect.poll(() => logs.length).toBeGreaterThan(0);
});

test("дни: лоток «Без даты» сворачивается/раскрывается (A8)", async ({ page }) => {
  await page.goto(VIEW);
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
  await page.goto(VIEW);
  await page.getByTestId("seg-month").click();
  await expect(page.getByTestId("cal-month")).toBeVisible();
  await expect(page.locator('[data-testid="cal-month"] .cm-cell.today')).toHaveCount(1);
  await page.locator('[data-testid="cal-month"] .cm-cell.today').click();
  await expect(page.getByTestId("cm-daypanel")).toBeVisible();
});

test("месяц: сводка вех + флажок (A5, A2 Сегодня)", async ({ page }) => {
  await page.clock.install({ time: NOON });
  await page.goto(VIEW);
  await page.getByTestId("seg-month").click();
  await expect(page.getByTestId("cm-mstrip")).toContainText("Вехи");
  await expect(page.locator('[data-testid="cal-month"] .cm-flag').first()).toBeVisible();
});

// ── ЛЕНТА ──
test("лента: просрочка закреплена сверху (A2)", async ({ page }) => {
  await page.goto(VIEW);
  await page.getByTestId("seg-agenda").click();
  await expect(page.getByTestId("ca-overdue")).toContainText("Просрочено · 2");
});

test("лента: группы Сегодня/Завтра + строка свободно (A2, A5, A8)", async ({ page }) => {
  await page.clock.install({ time: NOON });
  await page.goto(VIEW);
  await page.getByTestId("seg-agenda").click();
  await expect(page.getByTestId("cal-agenda")).toContainText("Сегодня");
  await expect(page.getByTestId("cal-agenda")).toContainText("Завтра");
  await expect(page.locator('[data-testid="cal-agenda"] .ca-free').first()).toBeVisible();
});

test("лента: веха-строка + метка этапа + дедлайн-бейдж (A3, A4, A6, A7)", async ({ page }) => {
  await page.clock.install({ time: NOON });
  await page.goto(VIEW);
  await page.getByTestId("seg-agenda").click();
  await expect(page.getByTestId("ca-veha-103")).toContainText("Юр.готовность ZIMA");
  await expect(page.getByTestId("ca-veha-103")).toContainText("веха");
  await expect(page.getByTestId("ca-task-13")).toContainText("этап 4");
  await expect(page.locator('[data-testid="cal-agenda"] .ca-danger').first()).toContainText("важно");
});

test("лента: чекбокс закрывает задачу не уходя с ленты", async ({ page }) => {
  await page.clock.install({ time: NOON });
  await page.goto(VIEW);
  await page.getByTestId("seg-agenda").click();
  const row = page.getByTestId("ca-task-11");
  await row.locator(".ca-chk").click();
  await expect(row.locator(".ca-chk")).toHaveClass(/done/);
});

// ── СОСТОЯНИЯ ──
test("пусто: лоток 0, нет блоков (состояние empty)", async ({ page }) => {
  await page.goto(EMPTY);
  await expect(page.getByTestId("cw-tray")).toContainText("Без даты · 0");
  await expect(page.locator('[data-testid="cal-days"] .cal-block')).toHaveCount(0);
});

test("ошибка: сообщение + Повторить (состояние error)", async ({ page }) => {
  await page.goto(ERROR);
  await expect(page.getByTestId("cal-error")).toContainText("Не удалось загрузить");
  await expect(page.getByTestId("cal-error").getByRole("button", { name: "Повторить" })).toBeVisible();
});

// ── ТОКЕН-СМОУК (var() → цвет DESIGN.md) ──
test("кант высокого приоритета = Signal Red (#FF5C5C)", async ({ page }) => {
  await openDays(page, 7);
  await expect(page.getByTestId("cw-blk-1")).toHaveCSS("border-left-color", "rgb(255, 92, 92)");
});

test("линия сейчас = Ember (#EE8A3C)", async ({ page }) => {
  await page.clock.install({ time: NOON });
  await openDays(page, 7);
  await expect(page.getByTestId("cw-now")).toHaveCSS("background-color", "rgb(238, 138, 60)");
});

// ── ВИЗУАЛ-BASELINE (chromium; эталон утверждает ЧЕЛОВЕК) ──
// npx playwright test T2-calendar --update-snapshots --project=chromium
test.describe("визуал-baseline", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "baseline только на chromium");
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date("2026-06-15T10:00:00") });
  });
  test("Дни=2 · happy", async ({ page }) => {
    await page.goto(VIEW);
    await expect(page.getByTestId("cal-days")).toBeVisible();
    await expect(page.getByTestId("screen-calendar")).toHaveScreenshot("T2-days2-happy.png");
  });
  test("Дни=7 (недельный вид) · happy", async ({ page }) => {
    await openDays(page, 7);
    await expect(page.getByTestId("cal-week")).toBeVisible();
    await expect(page.getByTestId("screen-calendar")).toHaveScreenshot("T2-days7-happy.png");
  });
  test("Месяц · happy", async ({ page }) => {
    await page.goto(VIEW);
    await page.getByTestId("seg-month").click();
    await expect(page.getByTestId("cal-month")).toBeVisible();
    await expect(page.getByTestId("screen-calendar")).toHaveScreenshot("T2-month-happy.png");
  });
  test("Лента · happy", async ({ page }) => {
    await page.goto(VIEW);
    await page.getByTestId("seg-agenda").click();
    await expect(page.getByTestId("cal-agenda")).toBeVisible();
    await expect(page.getByTestId("screen-calendar")).toHaveScreenshot("T2-agenda-happy.png");
  });
});

// ── COVERAGE-DEFER (НЕ покрыто, явно) — Волна 2 ──
// Cross-day drag (перенос блока в другой день) + драг карточки из/в лоток — pointer-харнес + бэк.
// Drag ВНУТРИ дня (move/resize) = реюз DayTimeline-жеста (покрыт в T1-today drag-тестах).
// Различие дедлайн vs блокер бейджа (T2c) — нужен флаг типа дедлайна в модели.
