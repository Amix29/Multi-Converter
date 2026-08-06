import { expect, test, type Page, type TestInfo } from "@playwright/test";

test("opens PDFs outside Tiptap, virtualizes pages and keeps edits through focus transitions", async ({ page }) => {
  await openPreviewPdf(page);

  await expect(page.getByRole("heading", { name: "Contrat-local.pdf" })).toBeVisible();
  await expect(page.locator(".ProseMirror")).toHaveCount(0);
  await expect(page.locator(".pdf-page-frame")).toHaveCount(2);
  await expect(page.locator('[data-page-number="1"] .pdf-page-render')).toBeVisible();

  await page.locator('[data-object-kind="text"] .pdf-object-hitbox').first().click();
  const textEditor = page.getByRole("textbox", { name: "Texte de l’objet" });
  await textEditor.fill("Texte structurel corrigé");
  await page.getByRole("button", { name: "Appliquer" }).click();
  await expect(page.getByText("1 modification(s) en attente", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Mode concentration" }).click();
  await expect(page.locator(".pdf-editor-shell")).toHaveClass(/is-focus-mode/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".pdf-editor-shell")).not.toHaveClass(/is-focus-mode/);
  await expect(page.getByText("1 modification(s) en attente", { exact: true })).toBeVisible();

  const pageInput = page.getByRole("spinbutton", { name: "Page" });
  await pageInput.fill("4");
  await expect(page.locator(".pdf-page-frame")).toHaveCount(3);
  await expect(page.locator('[data-page-number="3"]')).toBeVisible();
  await expect(page.locator('[data-page-number="5"]')).toBeVisible();

  const zoom = page.getByRole("slider", { name: "Zoom" });
  await zoom.fill("2");
  await expect(page.locator(".pdf-pages-viewport")).toHaveCSS("overflow-x", "auto");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);

  await page.getByRole("button", { name: "Revenir aux documents" }).click();
  const discard = page.getByRole("alertdialog", { name: "Quitter sans créer la copie ?" });
  await expect(discard).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(discard).toBeHidden();
  await expect(page.getByText("1 modification(s) en attente", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Enregistrer sous" }).click();
  await expect(page.getByText("La copie PDF a été créée sans modifier l’original.")).toBeVisible();
  await expect(page.getByText("0 modification(s) en attente", { exact: true })).toBeVisible();

  await page.locator('[data-object-kind="text"] .pdf-object-hitbox').first().click();
  await page.getByRole("textbox", { name: "Texte de l’objet" }).fill("Deuxième sauvegarde cumulée");
  await page.getByRole("button", { name: "Appliquer" }).click();
  await page.getByRole("button", { name: "Enregistrer sous" }).click();
  await expect(page.getByText("La copie PDF a été créée sans modifier l’original.")).toBeVisible();
  await expect(page.getByText("0 modification(s) en attente", { exact: true })).toBeVisible();
});

test("exposes eight image handles, layer controls and supported form editing", async ({ page }, testInfo) => {
  skipUnlessDesktop(testInfo);
  await openPreviewPdf(page);

  await page.locator('[data-object-kind="image"] .pdf-object-hitbox').first().click();
  await expect(page.locator('[data-object-kind="image"] .pdf-object-handle')).toHaveCount(8);
  await expect(page.getByRole("group", { name: "Rotation de l’objet" }).getByRole("button")).toHaveCount(2);
  await page.getByRole("button", { name: "Remplacer l’image" }).click();
  await expect(page.getByText("1 modification(s) en attente", { exact: true })).toBeVisible();
  const layers = page.getByRole("group", { name: "Ordre des calques" });
  for (const action of ["Tout derrière", "Reculer", "Avancer", "Tout devant"]) {
    await expect(layers.getByRole("button", { name: action })).toBeEnabled();
  }
  await layers.getByRole("button", { name: "Avancer" }).click();
  await expect(page.getByText("2 modification(s) en attente", { exact: true })).toBeVisible();

  await page.locator('[data-object-kind="form:Checkbox"] .pdf-object-hitbox').first().click();
  const checkbox = page.getByRole("checkbox", { name: "Case cochée" });
  await expect(checkbox).toBeEnabled();
  await checkbox.check();
  await expect(page.getByText("3 modification(s) en attente", { exact: true })).toBeVisible();

  await page.locator('[data-object-kind="form:RadioButton"] .pdf-object-hitbox').first().click();
  await page.getByRole("button", { name: "Sélectionner cette option" }).click();
  await expect(page.getByText("4 modification(s) en attente", { exact: true })).toBeVisible();
});

test("offers structural page, annotation, image and local OCR operations", async ({ page }, testInfo) => {
  skipUnlessDesktop(testInfo);
  await openPreviewPdf(page);

  const organization = page.getByRole("group", { name: "Organisation des pages" });
  await expect(organization.getByRole("button", { name: "Insérer une page" })).toBeEnabled();
  await expect(organization.getByRole("button", { name: "Dupliquer la page" })).toBeEnabled();
  await expect(organization.getByRole("button", { name: "Déplacer avant" })).toBeDisabled();
  await organization.getByRole("button", { name: "Insérer une page" }).click();
  await expect(page.getByText("1 modification(s) en attente", { exact: true })).toBeVisible();

  await page.getByLabel("Type d’annotation").selectOption("freeText");
  await page.getByLabel("Contenu").fill("Annotation locale ajoutée");
  await page.getByRole("button", { name: "Créer l’annotation" }).click();
  await expect(page.getByText("2 modification(s) en attente", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Insérer une image" }).click();
  await expect(page.getByText("3 modification(s) en attente", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Page suivante" }).click();
  await expect(page.getByRole("spinbutton", { name: "Page" })).toHaveValue("2");
  await page.getByRole("button", { name: "Reconnaître cette page" }).click();
  await expect(page.getByText("Calque OCR prêt avec 1 bloc(s).")).toBeVisible();
  await expect(page.getByText("4 modification(s) en attente", { exact: true })).toBeVisible();

  await page.locator('[data-object-kind="annotation:Text"] .pdf-object-hitbox').first().click();
  await page.getByRole("button", { name: "Supprimer l’annotation dans la copie" }).click();
  await expect(page.getByText("5 modification(s) en attente", { exact: true })).toBeVisible();
});

test("cancels a page OCR job without leaving the PDF editor blocked", async ({ page }, testInfo) => {
  skipUnlessDesktop(testInfo);
  await openPreviewPdf(page, "&mockSlowOcr=1");

  await page.getByRole("button", { name: "Reconnaître cette page" }).click();
  const cancel = page.getByRole("button", { name: "Annuler", exact: true });
  await expect(cancel).toBeVisible();
  await cancel.click();
  await expect(page.getByRole("button", { name: "Reconnaître cette page" })).toBeEnabled();
  await expect(page.getByText("0 modification(s) en attente", { exact: true })).toBeVisible();
});

test("keeps an encrypted PDF password in the modal flow and distinguishes invalid credentials", async ({ page }, testInfo) => {
  skipUnlessDesktop(testInfo);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?mockWelcomeSeen=1&mockPdfEditor=1&mockEncryptedPdf=1");
  await page.getByRole("tab", { name: "Éditeur" }).click();
  await page.getByRole("button", { name: "Ouvrir un document" }).click();

  const passwordDialog = page.getByRole("dialog", { name: "Déverrouiller localement le PDF" });
  await expect(passwordDialog).toBeVisible();
  const password = passwordDialog.getByLabel("Mot de passe");
  await password.fill("incorrect");
  await passwordDialog.getByRole("button", { name: "Déverrouiller" }).click();
  await expect(passwordDialog.getByRole("alert")).toContainText("mot de passe est incorrect");
  await expect(password).toHaveValue("");

  await password.fill("vellum");
  await passwordDialog.getByRole("button", { name: "Déverrouiller" }).click();
  await expect(passwordDialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "Contrat-local.pdf" })).toBeVisible();
  await expect(page.getByLabel("Mot de passe")).toHaveCount(0);
});

test("enforces DocMDP level 2 in the interface", async ({ page }, testInfo) => {
  skipUnlessDesktop(testInfo);
  await openPreviewPdf(page, "&mockPdfDocMdp=2");

  await expect(page.getByText("DocMDP 2", { exact: true })).toBeVisible();
  await page.locator('[data-object-kind="text"] .pdf-object-hitbox').first().click();
  await expect(page.getByRole("textbox", { name: "Texte de l’objet" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Pivoter" })).toBeDisabled();

  await page.locator('[data-object-kind="form:Checkbox"] .pdf-object-hitbox').first().click();
  const checkbox = page.getByRole("checkbox", { name: "Case cochée" });
  await expect(checkbox).toBeEnabled();
  await checkbox.check();
  await page.getByRole("button", { name: "Enregistrer sous" }).click();
  await expect(page.getByText("La copie PDF a été créée. La validité cryptographique des signatures existantes n’a pas été vérifiée et les modifications peuvent les invalider.")).toBeVisible();
});

test("lists preserved active content and creates a separate unsigned editable copy", async ({ page }, testInfo) => {
  skipUnlessDesktop(testInfo);
  await openPreviewPdf(page, "&mockPdfDocMdp=2");

  await expect(page.getByText("1 contenu(s) actif(s) détecté(s)", { exact: true })).toBeVisible();
  await expect(page.getByText("Page 2 · Annotation", { exact: true })).toBeVisible();
  const createCopy = page.getByRole("button", { name: "Créer une copie modifiable non signée" });
  await expect(createCopy).toBeEnabled();

  await page.locator('[data-object-kind="form:Checkbox"] .pdf-object-hitbox').first().click();
  await page.getByRole("checkbox", { name: "Case cochée" }).check();
  await expect(createCopy).toBeDisabled();
  await expect(page.getByText("Enregistrez ou annulez les modifications en attente avant de créer cette copie.")).toBeVisible();

  await page.getByRole("button", { name: "Annuler les modifications" }).click();
  await expect(createCopy).toBeEnabled();
  await createCopy.click();

  await expect(page.getByText("La copie modifiable non signée a été créée. Le PDF original reste intact.")).toBeVisible();
  await expect(page.getByText("DocMDP 2", { exact: true })).toBeHidden();
  await expect(page.getByText("0 signature(s) détectée(s)", { exact: true })).toBeVisible();
  await page.locator('[data-object-kind="text"] .pdf-object-hitbox').first().click();
  await expect(page.getByRole("textbox", { name: "Texte de l’objet" })).toBeEnabled();
});

test("contains the structural editor at every reference width and 200% zoom", async ({ page }, testInfo) => {
  skipUnlessDesktop(testInfo);
  for (const width of [375, 768, 1_024, 1_440]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await openPreviewPdf(page);
    await page.getByRole("slider", { name: "Zoom" }).fill("2");
    await expect(page.locator(".pdf-editor-shell")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await expect(page.getByRole("button", { name: "Mode concentration" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enregistrer sous" })).toBeVisible();
  }
});

async function openPreviewPdf(page: Page, query = "") {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto(`/?mockWelcomeSeen=1&mockPdfEditor=1${query}`);
  expect(response?.ok()).toBe(true);
  await page.getByRole("tab", { name: "Éditeur" }).click();
  await page.getByRole("button", { name: "Ouvrir un document" }).click();
  await expect(page.locator(".pdf-editor-shell")).toBeVisible();
}

function skipUnlessDesktop(testInfo: TestInfo) {
  test.skip(testInfo.project.name !== "desktop-chromium", "Covered by desktop-chromium.");
}
