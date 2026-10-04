import { expect, test, type Page } from "@playwright/test";

async function openDocument(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?mockWelcomeSeen=1");
  await page.getByRole("tab", { name: "Éditeur" }).click();
  await page.getByRole("button", { name: "Nouveau document" }).click();
  await expect(page.locator(".ProseMirror")).toBeVisible();
}

test("groups compact tools on multiple rows and keeps active icons visible", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openDocument(page);
  const editor = page.locator(".ProseMirror");
  await editor.fill("Un document agréable à écrire.");
  await editor.press("Control+A");
  const toolbar = page.getByRole("toolbar", { name: "Outils de mise en forme" });
  const bold = toolbar.getByRole("button", { name: "Gras", exact: true });
  await bold.click();
  await expect(editor.locator("strong")).toContainText("Un document");
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await bold.hover();
  const metrics = await bold.evaluate((button) => ({
    color: getComputedStyle(button).color,
    background: getComputedStyle(button).backgroundColor,
    opacity: getComputedStyle(button.querySelector("svg")!).opacity,
    height: button.getBoundingClientRect().height,
  }));
  expect(metrics.color).not.toBe(metrics.background);
  expect(metrics.opacity).toBe("1");
  expect(metrics.height).toBe(info.project.name === "desktop-chromium" ? 28 : 40);
  const rows = await toolbar.locator(".toolbar-button").evaluateAll((buttons) =>
    new Set(buttons.map((button) => Math.round(button.getBoundingClientRect().top))).size);
  expect(rows).toBeGreaterThan(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath("editor-ribbon.png") });
  expect(errors).toEqual([]);
});

test("zooms the document from 10 to 500 percent with a centered default and stable pagination", async ({ page }, info) => {
  await openDocument(page);
  const editor = page.locator(".ProseMirror");
  const zoom = page.getByRole("textbox", { name: "Zoom en pourcentage" });
  const slider = page.getByRole("slider", { name: "Zoom", exact: true });
  await expect(zoom).toHaveValue("100");
  await expect(slider).toHaveValue("50");
  await expect(page.locator(".editor-zoom-default-mark")).toBeVisible();
  await expect(page.locator(".editor-zoom-default-mark")).toHaveCSS("width", "1px");
  await editor.fill("Première page");
  await editor.press("Control+End");
  await editor.press("Control+Enter");
  await expect(editor.locator(".manual-page-break")).toHaveCount(1);
  await editor.pressSequentially("Deuxième page");
  await expect(page.locator(".editor-statusbar")).toContainText("Page 1 sur 2");
  const pageWidth = await page.locator(".editor-page-paper").evaluate((paper) => paper.getBoundingClientRect().width);
  for (const percent of [10, 500, 100]) {
    await zoom.fill(String(percent));
    await zoom.press("Enter");
    await expect(slider).toHaveAttribute("aria-valuetext", percent + "%");
    await expect.poll(() => page.locator(".editor-page-paper").evaluate((paper) => paper.getBoundingClientRect().width))
      .toBeCloseTo(pageWidth * percent / 100, 0);
    await expect(page.locator(".editor-statusbar")).toContainText("Page 1 sur 2");
  }
  await editor.focus();
  await editor.press("Control+=");
  await expect(zoom).toHaveValue("110");
  await editor.press("Control+-");
  await expect(zoom).toHaveValue("100");
  await page.locator(".editor-canvas-scroll").dispatchEvent("wheel", { ctrlKey: true, deltaY: -100 });
  await expect(zoom).toHaveValue("110");
  await page.locator(".editor-canvas-scroll").dispatchEvent("wheel", { ctrlKey: true, deltaY: 100 });
  await expect(zoom).toHaveValue("100");
  await editor.press("Control+0");
  await zoom.fill("999");
  await zoom.press("Enter");
  await expect(zoom).toHaveValue("500");
  await expect(page.getByRole("button", { name: "Zoomer", exact: true })).toBeDisabled();
  await zoom.fill("1");
  await zoom.press("Enter");
  await expect(zoom).toHaveValue("10");
  await expect(page.getByRole("button", { name: "Dézoomer", exact: true })).toBeDisabled();
  await zoom.fill("100");
  await zoom.press("Enter");
  await page.screenshot({ path: info.outputPath("editor-pages.png") });
});

test("provides keyboard editing, search and an escapable full screen", async ({ page }) => {
  await openDocument(page);
  const editor = page.locator(".ProseMirror");
  await editor.fill("Texte de travail");
  await editor.press("Control+A");
  await editor.press("Control+B");
  await expect(editor.locator("strong")).toHaveText("Texte de travail");
  await editor.press("Control+Space");
  await expect(editor.locator("strong")).toHaveCount(0);
  await editor.press("Control+E");
  await expect(editor.locator("p")).toHaveCSS("text-align", "center");
  await editor.press("Control+F");
  const search = page.getByRole("textbox", { name: "Rechercher", exact: true });
  await expect(search).toBeFocused();
  await search.fill("travail");
  await search.press("Enter");
  await search.press("Escape");
  await expect(search).toHaveCount(0);
  await expect(editor).toBeFocused();
  await editor.press("F11");
  const shell = page.locator(".document-editor-shell");
  await expect(shell).toHaveAttribute("data-focus-mode", "true");
  await editor.press("Control+/");
  await expect(page.getByRole("dialog", { name: "Raccourcis clavier" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Raccourcis clavier" })).toHaveCount(0);
  await expect(shell).toHaveAttribute("data-focus-mode", "true");
  await page.keyboard.press("Escape");
  await expect(shell).toHaveAttribute("data-focus-mode", "false");
});

test("edits images through a contextual ribbon and direct dragging", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-chromium", "Pointer geometry is covered on desktop.");
  await openDocument(page);
  const editor = page.locator(".ProseMirror");
  await editor.fill("Image locale");
  await editor.press("End");
  await editor.press("Enter");
  await page.locator('.editor-toolbar input[type="file"]').setInputFiles({
    name: "image.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
  });
  const image = editor.locator(".document-image-node");
  const frame = image.locator(".document-image-frame");
  await expect(frame).toBeVisible();
  await frame.click();
  const tools = page.getByRole("toolbar", { name: "Outils de l’image" });
  await expect(tools).toBeVisible();
  await expect(image.locator('[role="toolbar"]')).toHaveCount(0);
  const initialRatio = await frame.evaluate((node) => (node as HTMLElement).offsetHeight / (node as HTMLElement).offsetWidth);
  const width = tools.getByRole("textbox", { name: "Largeur de l’image" });
  await width.fill("5");
  await width.press("Enter");
  await expect.poll(() => frame.evaluate((node) => (node as HTMLElement).offsetWidth)).toBeCloseTo(189, 0);
  await expect(width).toHaveValue("5.00");
  const size = await frame.evaluate((node) => [(node as HTMLElement).offsetWidth, (node as HTMLElement).offsetHeight]);
  expect(size[1] / size[0]).toBeCloseTo(initialRatio, 2);
  await tools.getByRole("combobox", { name: "Position de l’image" }).selectOption("front");
  await expect(image).toHaveAttribute("data-layout-mode", "floating");
  const box = await frame.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 50, box!.y + box!.height / 2 + 20, { steps: 5 });
  await page.mouse.up();
  await expect(image).toHaveCSS("transform", /matrix\(.+/);
  await expect(image.locator(".document-image-resize-handle")).toHaveCount(8);
  await page.screenshot({ path: info.outputPath("editor-image.png") });
  await tools.getByRole("button", { name: "Réinitialiser l’image" }).click();
  await expect(image).toHaveAttribute("data-layout-mode", "flow");
  await expect(image).toHaveCSS("transform", "none");
  await tools.getByRole("button", { name: "Supprimer l’image" }).click();
  await expect(image).toHaveCount(0);
  await expect(page.locator(".document-save-state")).toHaveText("Enregistré");
  await editor.press("Control+Z");
  await expect(image).toBeVisible();
  await expect(image.locator("img")).toBeVisible();
});
