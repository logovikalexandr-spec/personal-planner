import { test, expect } from "./_telegram";

// Контракт детали: действия (Подзадача/Не буду делать/Удалить) в ⋯ меню шапки (мокап DETAIL-task),
// не нижним баром; английского «Won't Do» нет (правило: язык русский).
test.use({ hasTouch: true });
const APP = "preview-detail-mock.html";

test("действия в ⋯ меню, нижнего бара нет, без English", async ({ page }) => {
  await page.goto(APP);
  await page.locator(".screen.detail").waitFor();
  await expect(page.locator(".detail-overflow")).toHaveCount(0);   // старого бара нет
  await expect(page.getByText("Won't Do")).toHaveCount(0);          // английского нет
  await expect(page.locator(".detail-menu")).toHaveCount(0);        // меню закрыто по умолчанию

  await page.locator(".detail-ic[aria-label='Ещё']").click();
  const items = page.locator(".detail-menu button");
  await expect(items).toHaveText(["Подзадача", "Не буду делать", "Удалить"]);

  // бэкдроп закрывает меню
  await page.locator(".detail-menu-backdrop").click();
  await expect(page.locator(".detail-menu")).toHaveCount(0);
});
