import { expect, test, type Page, type TestInfo } from "@playwright/test";

test("removes unsupported imports in bulk before the Formats step", async ({ page }, testInfo) => {
  skipUnlessDesktop(testInfo);
  await openPreview(page, "/?mockWelcomeSeen=1&mockUnsupportedFiles=1");

  await page.getByRole("button", { name: "Parcourir" }).click();
  await expect(page.locator(".file-ticket")).toHaveCount(3);
  const removeUnsupported = page.getByRole("button", { name: "Retirer les fichiers non pris en charge" });
  await expect(removeUnsupported).toBeVisible();
  await removeUnsupported.click();

  await expect(page.locator(".file-ticket")).toHaveCount(2);
  await expect(removeUnsupported).toBeHidden();
  await page.getByRole("button", { name: "Préparer la conversion" }).click();
  await expect(page.locator(".rail-button")).toHaveCount(2);
  await expect(page.locator(".rail-button:disabled")).toHaveCount(0);
});

test("virtualizes a large output list while keeping filters and cancellation available", async ({ page }, testInfo) => {
  skipUnlessDesktop(testInfo);
  await openPreview(page, "/?mockWelcomeSeen=1&mockLargeBatch=120&mockSlowConversion=1");

  await page.getByRole("button", { name: "Parcourir" }).click();
  const lane = page.locator(".file-lane");
  await expect(lane).toHaveCSS("overflow-y", "auto");
  expect((await lane.boundingBox())!.height).toBeLessThanOrEqual(421);
  await expect(page.getByTestId("virtual-file-grid")).toHaveAttribute("data-total-count", "120");
  expect(await page.locator(".file-ticket").count()).toBeLessThan(50);

  await page.getByRole("button", { name: "Préparer la conversion" }).click();
  await expect(page.getByTestId("virtual-format-rail")).toHaveAttribute("data-total-count", "120");
  expect(await page.locator(".rail-button").count()).toBeLessThan(30);
  await page.locator(".format-card").first().click();
  await page.getByRole("button", { name: "Appliquer aux fichiers compatibles" }).click();
  await page.getByRole("button", { name: "Lancer la conversion" }).click();

  const virtualList = page.getByTestId("virtual-job-list");
  await expect(virtualList).toHaveAttribute("data-total-count", "120");
  await expect(page.getByRole("button", { name: /^Tous/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^En cours/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Annuler", exact: true })).toBeVisible();
  expect(await page.locator(".job-row").count()).toBeLessThan(25);

  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Conversion annulée" })).toBeVisible();
});

test("keeps the 2,000-file Formats rail bounded on a narrow viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Covered by mobile-chromium.");
  await openPreview(page, "/?mockWelcomeSeen=1&mockLargeBatch=2000");

  await page.getByRole("button", { name: "Parcourir" }).click();
  await page.getByRole("button", { name: "Préparer la conversion" }).click();

  const rail = page.getByTestId("virtual-format-rail");
  await expect(rail).toHaveAttribute("data-total-count", "2000");
  const dimensions = await rail.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(dimensions.clientHeight).toBeLessThanOrEqual(320);
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight * 100);
  expect(await page.locator(".rail-button").count()).toBeLessThan(30);
  await expect(page.locator(".format-picker")).toBeVisible();
});

async function openPreview(page: Page, url: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto(url);
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { name: "Multi-Converter", exact: true })).toBeVisible();
}

function skipUnlessDesktop(testInfo: TestInfo) {
  test.skip(testInfo.project.name !== "desktop-chromium", "Covered by desktop-chromium.");
}
