import { test, expect } from "./_telegram";

// ── РЕГРЕССИОННЫЙ ГАРД: перенос блока на touch ──
// Баг (Telegram iOS): тело наложенного блока не двигалось long-press'ом, хотя resize краёв работал.
// Корень: ручка переноса `.cal-block-main` не имела touch-action:none → вертикальный drag по телу
// перехватывался нативным скроллом `.cal-scroll` (pointercancel рвал жест). Грипы `.cal-resize`
// работали, т.к. у них touch-action:none. Фикс = тот же контракт на теле.
// CDP-синтетика не воспроизводит нативную арбитрацию скролла, поэтому гейтим CSS-контракт.
test.use({ hasTouch: true });

const FULL = "preview-t1-full-mock.html";

test("ручка переноса блока имеет touch-action:none (как грип ресайза)", async ({ page }) => {
  await page.goto(FULL);
  const ta = await page.getByTestId("task-1").locator(".cal-block-main")
    .evaluate((el) => getComputedStyle(el).touchAction);
  expect(ta).toBe("none");
});

// ── РЕГРЕССИОННЫЙ ГАРД: now-линия НЕ перехватывает указатель ──
// Баг (прод 06-15, задача «Тоо» 10:00–12:45): её нельзя было ни кликнуть, ни двигать телом,
// resize краёв работал. Корень: `.cal-now` (z-index:3, БЕЗ pointer-events:none) лежит поверх
// блоков. Когда текущее время попадает в блок (у «Тоо» — ровно центр в 11:22), тап/long-press
// в центр тела попадал в линию, а не в `.cal-block-main` → onClick/onBodyDown не срабатывали.
// Утренние задачи (не под линией) работали → отсюда «только Тоо». Фикс: pointer-events:none.
test("now-линия не перехватывает клики по блоку под ней", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-06-15T09:30:00") }); // now над task-1 (09:00–10:00)
  await page.goto(FULL);
  await page.waitForTimeout(150);

  // now-линия должна быть прозрачной для указателя
  const pe = await page.locator(".cal-now").evaluate((el) => getComputedStyle(el).pointerEvents);
  expect(pe).toBe("none");

  // в геометрическом центре блока топовый элемент = сам блок, не .cal-now
  const box = await page.getByTestId("task-1").boundingBox();
  const topCls = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return el ? `${el.className}` : "null";
  }, { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 });
  expect(topCls).not.toContain("cal-now");
});

// ── РЕГРЕССИОННЫЙ ГАРД: вся карточка интерактивна, не только верхняя строка ──
// Баг: у высокого блока перенос/клик работали лишь по 1-й строке. Корень: `.cal-block`
// flex align-items:flex-start → `.cal-block-main` (носитель move-хендлеров) по высоте = только
// контент (~38px), пустое тело ниже мёртвое. Фикс: align-self:stretch → main на всю высоту.
test("тело блока (ручка) растянуто на всю высоту карточки", async ({ page }) => {
  await page.goto(FULL);
  const blk = await page.getByTestId("task-1").boundingBox();
  const main = await page.getByTestId("task-1").locator(".cal-block-main").boundingBox();
  expect(main!.height).toBeGreaterThanOrEqual(blk!.height - 12); // вся высота минус padding (~10px)
});
