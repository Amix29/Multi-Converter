import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test("keeps complete file identities in structured cards without the onboarding stripe", async ({ page }, testInfo) => {
  skipUnlessDesktop(testInfo);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const preview = page.locator(".welcome-preview");
  await expect(preview).toBeVisible();
  expect(await preview.evaluate((element) => getComputedStyle(element, "::after").content)).toBe("none");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Parcourir" }).click();
  const cards = page.locator(".file-ticket");
  await expect(cards).toHaveCount(7);

  const completeNames = [
    "Grand Theft Auto V Screenshot 2026.01.05 - 18.43.12.84.png",
    "Enregistrement de l'écran 2025-11-19 190508 version très longue pour vérifier le découpage.mp4",
    "Capture audio réunion client avec un nom beaucoup trop long.wav",
  ];
  for (const name of completeNames) {
    const identity = page.getByTitle(name, { exact: true });
    await expect(identity).toBeVisible();
    await expect(identity).toHaveText(name);
    const card = identity.locator("xpath=ancestor::article[contains(@class, 'file-ticket')]");
    await expect(card.locator(".file-ticket-header")).toBeVisible();
    await expect(card.locator(".file-ticket-type")).not.toBeEmpty();
    await expect(card.locator(".file-ticket-meta")).not.toBeEmpty();
  }

  const imageCard = page.getByTitle(completeNames[0]).locator("xpath=ancestor::article");
  await expect(imageCard.locator(".file-ticket-actions")).toBeVisible();
  const ocrAction = imageCard.getByRole("button", { name: "Extraire le texte" });
  await expect(ocrAction).toBeVisible();
  await expectContainedBy(ocrAction, imageCard);
  await expectNoHorizontalOverflow(page);
});

test("exposes free typography, explicit colors, resizable tables and complete image controls", async ({ page }, testInfo) => {
  skipUnlessDesktop(testInfo);
  await openNewDocument(page);

  const toolbar = page.getByRole("toolbar", { name: "Outils de mise en forme" });
  const editor = page.locator(".ProseMirror");
  await expect(toolbar.getByRole("combobox", { name: "Style de paragraphe" })).toHaveCount(0);
  await expect(toolbar.getByRole("button", { name: "Aligner à gauche" })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Centrer" })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Aligner à droite" })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Insérer une image" })).toBeVisible();

  const fontFamily = toolbar.getByRole("combobox", { name: "Police" });
  expect(await fontFamily.locator("option").count()).toBeGreaterThanOrEqual(20);
  await expect(fontFamily.locator("option", { hasText: "Atkinson Hyperlegible Next" })).toHaveCount(1);
  for (const family of ["Source Sans 3", "Atkinson Hyperlegible Next", "JetBrains Mono"]) {
    const loaded = await page.evaluate(async (font) => {
      const query = `16px "${font}"`;
      const faces = await document.fonts.load(query);
      return faces.length > 0 && document.fonts.check(query);
    }, family);
    expect(loaded, `${family} must decode from the bundled WOFF2 asset`).toBe(true);
  }

  await editor.fill("Mise en forme libre");
  await editor.press("Control+A");
  const fontSize = toolbar.getByRole("combobox", { name: "Taille de police" });
  await fontSize.fill("13,5");
  await fontSize.press("Enter");
  await expect(editor.locator('span[style*="font-size: 13.5pt"]')).toContainText("Mise en forme libre");

  await editor.press("Control+A");
  await toolbar.locator('input[type="color"][aria-label="Couleur du texte"]').fill("#9a3412");
  await expect(editor.locator('span[style*="color"]')).toContainText("Mise en forme libre");
  await expect(toolbar.getByRole("button", { name: "Couleur de texte par défaut" })).toBeEnabled();

  const highlightGlyph = toolbar.locator(".toolbar-color-glyph.is-highlight");
  const defaultHighlightGlyphColor = await highlightGlyph.evaluate((element) => getComputedStyle(element).color);
  await editor.press("Control+A");
  await toolbar.locator('input[type="color"][aria-label="Surlignage"]').fill("#ffcc00");
  await expect(highlightGlyph).toHaveCSS("color", "rgb(255, 204, 0)");
  const clearHighlight = toolbar.getByRole("button", { name: "Aucun surlignage" });
  await expect(clearHighlight).toBeEnabled();
  await clearHighlight.click();
  await expect(highlightGlyph).toHaveCSS("color", defaultHighlightGlyphColor);

  await editor.press("End");
  await editor.press("Enter");
  await toolbar.locator('input[type="file"][accept*="image/png"]').setInputFiles({
    name: "image-locale.png",
    mimeType: "image/png",
    buffer: ONE_PIXEL_PNG,
  });
  const image = editor.locator(".document-image-node");
  await expect(image).toBeVisible();
  await image.click();
  await image.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const mediaTools = image.getByRole("toolbar", { name: "Outils de l’image" });
  await expect(mediaTools).toBeVisible();
  for (const action of [
    "Déplacer l’image",
    "Placer tout derrière",
    "Reculer d’un niveau",
    "Avancer d’un niveau",
    "Placer tout devant",
  ]) {
    await expect(mediaTools.getByRole("button", { name: action })).toBeVisible();
  }

  await mediaTools.getByRole("button", { name: "Placer tout devant" }).click();
  await expect(image).toHaveAttribute("data-layout-mode", "floating");
  await expect(image).toHaveAttribute("style", /z-index:\s*100/);
  const moveImage = mediaTools.getByRole("button", { name: "Déplacer l’image" });
  await moveImage.focus();
  await moveImage.press("ArrowRight");
  await expect(image).toHaveCSS("transform", /matrix\(.+/);

  const resize = image.getByRole("button", { name: "Redimensionner l’image" });
  const frame = image.locator(".document-image-frame");
  const widthBefore = (await frame.boundingBox())?.width ?? 0;
  await dragBy(page, resize, 70, 0);
  await expect.poll(async () => (await frame.boundingBox())?.width ?? 0).toBeGreaterThan(widthBefore);
  const returnToFlow = mediaTools.getByRole("button", { name: "Remettre dans le texte" });
  await expect(returnToFlow).toBeVisible();
  await returnToFlow.click();

  await editor.focus();
  await editor.press("Control+End");
  await editor.press("Enter");
  await toolbar.getByRole("button", { name: "Insérer un tableau" }).click();
  const tableWrapper = editor.locator(".tableWrapper");
  await expect(tableWrapper).toBeVisible();
  await expect(toolbar.getByRole("group", { name: "Tableau" })).toBeVisible();
  const nextTools = page.getByRole("button", { name: "Afficher les outils suivants" });
  if (await nextTools.count()) {
    await expect(nextTools).toBeVisible();
    await nextTools.click();
  }
  await revealTableResizeHandle(page, tableWrapper);
});

test("requires a title, defaults to Markdown and exposes export progress", async ({ page }, testInfo) => {
  skipUnlessDesktop(testInfo);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?mockWelcomeSeen=1&mockSlowEditorExport=1");
  await page.getByRole("tab", { name: "Éditeur" }).click();
  await page.getByRole("button", { name: "Nouveau document" }).click();

  const format = page.getByRole("combobox", { name: "Format d’export" });
  await expect(format).toHaveValue("md");
  await page.getByRole("button", { name: "Exporter", exact: true }).click();

  const naming = page.getByRole("dialog", { name: "Donnez un nom au document" });
  await expect(naming).toBeVisible();
  const continueExport = naming.getByRole("button", { name: "Continuer l’export" });
  await expect(continueExport).toBeDisabled();
  await naming.getByRole("textbox", { name: "Nom du document" }).fill("Rapport final");
  await expect(continueExport).toBeEnabled();
  await continueExport.click();

  const exporting = page.getByRole("dialog", { name: "Export en cours…" });
  await expect(exporting).toBeVisible();
  await expect(exporting.getByRole("progressbar", { name: "Export en cours…" })).toBeVisible();
  await expect(exporting).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Nom du document" })).toHaveValue("Rapport final");
  await expect(page.getByText(/Document exporté vers .*Rapport final\.md/)).toBeVisible();
});

test("uses an in-app overwrite dialog and preserves the edited document title", async ({ page }, testInfo) => {
  skipUnlessDesktop(testInfo);
  let nativeDialogs = 0;
  page.on("dialog", async (dialog) => {
    nativeDialogs += 1;
    await dialog.dismiss();
  });
  await openEditorLanding(page);
  await page.getByRole("button", { name: "Ouvrir un document" }).click();

  const title = page.getByRole("textbox", { name: "Nom du document" });
  await title.fill("Rapport révisé");
  await expect(page.getByText("Enregistré", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();

  const overwrite = page.getByRole("dialog", { name: "Remplacer le fichier existant ?" });
  await expect(overwrite).toBeVisible();
  expect(nativeDialogs).toBe(0);
  await overwrite.getByRole("button", { name: "Remplacer le fichier" }).click();
  await expect(title).toHaveValue("Rapport révisé");
  await expect(page.getByText("Rapport révisé a été enregistré.")).toBeVisible();
  expect(nativeDialogs).toBe(0);
});

test("starts recent-document multiselect with a long press and deletes the batch", async ({ page }, testInfo) => {
  skipUnlessDesktop(testInfo);
  await openEditorLanding(page);
  await createRecentDocument(page, "Alpha local");
  await createRecentDocument(page, "Bêta local");

  const betaCard = recentCard(page, "Bêta local");
  await betaCard.getByRole("button").first().click({ delay: 650 });
  const selectionTools = page.getByRole("toolbar", { name: "Outils de sélection des documents" });
  await expect(selectionTools).toBeVisible();
  await expect(selectionTools).toContainText("1 document(s) sélectionné(s)");

  await recentCard(page, "Alpha local").getByRole("button").first().click();
  await expect(selectionTools).toContainText("2 document(s) sélectionné(s)");
  await selectionTools.getByRole("button", { name: "Supprimer la sélection" }).click();

  const confirmation = page.getByRole("alertdialog", { name: "Supprimer 2 documents ?" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(recentCard(page, "Alpha local")).toHaveCount(0);
  await expect(recentCard(page, "Bêta local")).toHaveCount(0);
});

async function openEditorLanding(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto("/?mockWelcomeSeen=1");
  expect(response?.ok()).toBe(true);
  await page.getByRole("tab", { name: "Éditeur" }).click();
  await expect(page.getByRole("button", { name: "Nouveau document" })).toBeVisible();
}

async function openNewDocument(page: Page) {
  await openEditorLanding(page);
  await page.getByRole("button", { name: "Nouveau document" }).click();
  await expect(page.locator(".ProseMirror")).toBeVisible();
}

async function createRecentDocument(page: Page, title: string) {
  await page.getByRole("button", { name: "Nouveau document" }).click();
  await page.getByRole("textbox", { name: "Nom du document" }).fill(title);
  await page.locator(".ProseMirror").fill(`Contenu de ${title}`);
  await expect(page.getByText("Modifications non enregistrées", { exact: true })).toBeVisible();
  await expect(page.getByText("Enregistré", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Revenir aux documents" }).click();
  await expect(recentCard(page, title)).toBeVisible();
}

function recentCard(page: Page, title: string) {
  return page.locator(".recent-document-card").filter({ hasText: title });
}

async function revealTableResizeHandle(page: Page, wrapper: Locator) {
  const firstCell = wrapper.locator("th, td").first();
  const box = await firstCell.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width - 1, box!.y + box!.height / 2);
  await expect.poll(() => wrapper.locator(".column-resize-handle").count()).toBeGreaterThan(0);
}

async function dragBy(page: Page, locator: Locator, deltaX: number, deltaY: number) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + deltaX, y + deltaY, { steps: 4 });
  await page.mouse.up();
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}

async function expectContainedBy(child: Locator, parent: Locator) {
  const childBox = await child.boundingBox();
  const parentBox = await parent.boundingBox();
  expect(childBox).not.toBeNull();
  expect(parentBox).not.toBeNull();
  expect(childBox!.x).toBeGreaterThanOrEqual(parentBox!.x - 1);
  expect(childBox!.y).toBeGreaterThanOrEqual(parentBox!.y - 1);
  expect(childBox!.x + childBox!.width).toBeLessThanOrEqual(parentBox!.x + parentBox!.width + 1);
  expect(childBox!.y + childBox!.height).toBeLessThanOrEqual(parentBox!.y + parentBox!.height + 1);
}

function skipUnlessDesktop(testInfo: TestInfo) {
  test.skip(testInfo.project.name !== "desktop-chromium", "Covered by desktop-chromium.");
}
