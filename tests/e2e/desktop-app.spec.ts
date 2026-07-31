import { expect, test, type Page } from "@playwright/test";

test("imports preview files and selects a conversion format", async ({ page }) => {
  const consoleErrors = captureConsoleErrors(page);
  await openPreview(page);

  await page.getByRole("button", { name: "Parcourir" }).click();
  await expect(page.locator(".file-ticket")).toHaveCount(7);
  const prepareButton = page.getByRole("button", { name: "Préparer la conversion" });
  await prepareButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Choisissez les formats" })).toBeVisible();

  const firstFormat = page.locator(".format-card").first();
  await expect(firstFormat).toBeVisible();
  await firstFormat.click();
  await expect(firstFormat).toHaveAttribute("aria-pressed", "true");

  await expectNoHorizontalOverflow(page);
  expect(consoleErrors).toEqual([]);
});

test("creates and edits a local document", async ({ page }) => {
  const consoleErrors = captureConsoleErrors(page);
  await openPreview(page);

  const editorTab = page.getByRole("tab", { name: "Éditeur" });
  await editorTab.focus();
  await page.keyboard.press("Enter");
  await expect(editorTab).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: "Nouveau document" }).click();
  await page.getByRole("textbox", { name: "Nom du document" }).fill("Référence Phase 1");
  const editor = page.locator(".ProseMirror");
  await expect(editor).toBeVisible();
  await editor.fill("Texte local avec accents : été, cœur, français.");
  await expect(editor).toContainText("Texte local avec accents");

  await expectNoHorizontalOverflow(page);
  expect(consoleErrors).toEqual([]);
});

test("keeps the recent-document delete confirmation viewport-wide and cancellable", async ({ page }) => {
  const consoleErrors = captureConsoleErrors(page);

  await openPreview(page, "/?mockWelcomeSeen=1&mockRecentDocuments=1");
  await page.getByRole("tab", { name: "Éditeur" }).click();
  await page.getByRole("button", { name: "Actions pour Brouillon de test" }).click();
  await page.getByRole("menuitem", { name: "Supprimer" }).click();

  const dialog = page.getByRole("alertdialog", { name: "Supprimer ce document ?" });
  await expect(dialog).toBeVisible();
  const backdrop = page.locator(".editor-modal-backdrop");
  const viewport = page.viewportSize();
  const bounds = await backdrop.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeLessThanOrEqual(1);
  expect(bounds!.y).toBeLessThanOrEqual(1);
  expect(bounds!.width).toBeGreaterThanOrEqual((viewport?.width ?? 0) - 2);
  expect(bounds!.width).toBeLessThanOrEqual((viewport?.width ?? 0) + 2);
  expect(bounds!.height).toBeGreaterThanOrEqual((viewport?.height ?? 0) - 2);
  expect(bounds!.height).toBeLessThanOrEqual((viewport?.height ?? 0) + 2);

  await dialog.getByRole("button", { name: "Annuler" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Brouillon de test", { exact: true })).toBeVisible();

  await expectNoHorizontalOverflow(page);
  expect(consoleErrors).toEqual([]);
});

async function openPreview(page: Page, url = "/?mockWelcomeSeen=1") {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(url);
  await expect(page.getByRole("tab", { name: "Convertisseur" })).toHaveAttribute("aria-selected", "true");
}

function captureConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}
