import { test, expect } from "./_telegram";

// Скелет-смоук: рантайм жив, preview рендерится, Telegram-стаб работает.
test("preview-tracking рендерится (root не пуст)", async ({ page }) => {
  await page.goto("preview-tracking-mock.html");
  await expect(page.locator("#root")).not.toBeEmpty();
  await expect(page.getByText("Привычки").first()).toBeVisible();
});
