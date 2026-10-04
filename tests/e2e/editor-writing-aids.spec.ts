import { expect, test, type Page } from "@playwright/test";

async function openDocument(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?mockWelcomeSeen=1");
  await page.getByRole("tab", { name: "Éditeur" }).click();
  await page.getByRole("button", { name: "Nouveau document" }).click();
  await expect(page.locator(".ProseMirror")).toBeFocused();
}

async function selectGreeting(page: Page) {
  const editor = page.locator(".ProseMirror");
  await editor.fill("HI ! suite");
  await editor.press("Control+Home");
  for (let i = 0; i < 4; i += 1) await editor.press("Shift+ArrowRight");
  await expect.poll(() => editor.evaluate((element) => {
    const instance = (element as unknown as { editor: { state: { selection: { from: number; to: number } } } }).editor;
    return [instance.state.selection.from, instance.state.selection.to];
  })).toEqual([1, 5]);
}

test("keeps selection painted in compact font and size menus and formats only that selection", async ({ page }, info) => {
  await openDocument(page);
  await selectGreeting(page);
  await page.getByRole("button", { name: "Police", exact: true }).click();
  const selection = page.locator(".editor-retained-selection");
  await expect(selection).toHaveText("HI !");
  const menu = page.locator(".editor-font-popover");
  await expect(menu).toHaveCSS("width", "240px");
  await expect(menu.locator(".editor-font-list")).toHaveCSS("height", "224px");
  const selectionBox = await selection.boundingBox();
  const menuBox = await menu.boundingBox();
  expect(selectionBox && menuBox && (selectionBox.x >= menuBox.x + menuBox.width || selectionBox.x + selectionBox.width <= menuBox.x || selectionBox.y >= menuBox.y + menuBox.height || selectionBox.y + selectionBox.height <= menuBox.y)).toBe(true);
  await page.screenshot({ path: info.outputPath("font-selection.png") });
  await page.getByRole("combobox", { name: "Rechercher une police" }).fill("Georgia");
  await page.getByRole("option", { name: "Georgia", exact: true }).click();
  await expect(page.locator(".ProseMirror span[style*=Georgia]")).toHaveText("HI !");
  const size = page.getByRole("combobox", { name: "Taille de police", exact: true });
  await size.click();
  await expect(selection).toHaveText("HI !");
  await size.fill("24");
  await size.press("Enter");
  await expect(page.locator('.ProseMirror span[style*="24pt"]')).toHaveText("HI !");
  await expect(page.locator(".ProseMirror p")).toHaveText("HI ! suite");
  await expect(page.locator(".editor-metric-menu")).toHaveCount(0);
});

test("shows numeric line spacing with its icon and supports exact custom values", async ({ page }) => {
  await openDocument(page);
  const input = page.getByRole("combobox", { name: "Interligne", exact: true });
  await expect(input).toHaveValue("1.45");
  await expect(page.locator(".toolbar-line-height .editor-metric-icon svg")).toBeVisible();
  await input.click();
  await expect(page.locator(".editor-metric-menu")).not.toContainText("Auto");
  await expect(page.getByRole("option", { name: "1.45", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("option", { name: "2", exact: true }).click();
  await expect(page.locator(".ProseMirror p")).toHaveCSS("line-height", /px$/);
  await expect(input).toHaveValue("2");
  await input.fill("1,37");
  await input.press("Enter");
  await expect(page.locator(".ProseMirror p")).toHaveAttribute("style", /line-height: 1.37/);
});

test("shows formatting marks without altering document JSON, undo or pagination", async ({ page }, info) => {
  await openDocument(page);
  const editor = page.locator(".ProseMirror");
  await editor.fill("HI !");
  await editor.press("End");
  await editor.press("Shift+Enter");
  await editor.pressSequentially("Suite");
  const json = () => editor.evaluate((element) => {
    return (element as unknown as { editor: { getJSON(): unknown } }).editor.getJSON();
  });
  const before = await json();
  const marks = page.getByRole("button", { name: "Afficher les marques de mise en page", exact: true });
  await marks.click();
  await expect(marks).toHaveAttribute("aria-pressed", "true");
  await expect(editor.locator(".editor-formatting-mark")).toHaveCount(3);
  await expect(editor.locator(".editor-formatting-mark").filter({ hasText: "¶" }).locator("span")).toBeVisible();
  expect(await json()).toEqual(before);
  await expect(page.locator(".editor-statusbar")).toContainText("Page 1 sur 1");
  await page.screenshot({ path: info.outputPath("formatting-marks.png") });
  await editor.press("Control+Shift+8");
  await expect(editor.locator(".editor-formatting-mark")).toHaveCount(0);
  expect(await json()).toEqual(before);
  await editor.press("Control+Z");
  await expect(editor).not.toContainText("Suite");
});

test("explains font, spacing and paragraph tools on hover and keyboard focus", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-chromium", "Hover explanations use a desktop pointer.");
  await openDocument(page);
  const size = page.getByRole("combobox", { name: "Taille de police", exact: true });
  await size.hover();
  await expect(page.getByRole("tooltip")).toContainText("en points");
  await expect(size).toHaveAttribute("aria-describedby", /.+/);
  await size.click();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await size.press("Escape");
  const marks = page.getByRole("button", { name: "Afficher les marques de mise en page", exact: true });
  await marks.hover();
  await expect(page.getByRole("tooltip")).toContainText("Ctrl+Shift+8");
  await expect(page.getByRole("tooltip")).toContainText("ne sont pas exportés");
  await page.screenshot({ path: info.outputPath("rich-tooltip.png") });
  await page.locator(".ProseMirror").hover();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await marks.focus();
  await expect(page.getByRole("tooltip")).toContainText("tabulations");
  await marks.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});
