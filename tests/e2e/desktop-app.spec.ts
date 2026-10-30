import { expect, test, type Page, type TestInfo } from "@playwright/test";

test("opens the converter even when an older version saved editor mode", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("multi-converter-app-mode", "editor"));
  await openPreview(page, "/?mockWelcomeSeen=1&mockOcrImage=1");
  await expect(page.getByRole("tab", { name: "Éditeur" })).toHaveCount(0);
  await expect(page.locator(".document-editor-shell, .pdf-editor-shell")).toHaveCount(0);
  await page.getByRole("button", { name: "Parcourir" }).click();
  await page.getByRole("button", { name: "Extraire le texte" }).click();
  const dialog = page.getByRole("dialog", { name: "Texte de l’image" });
  await expect(dialog.getByRole("textbox", { name: "Texte reconnu" })).toHaveValue(
    "Texte reconnu localement dans l’image de démonstration.",
  );
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByRole("button", { name: "Parcourir" })).toBeVisible();
  await page.screenshot({ path: "output/playwright/converter-only.png", fullPage: true });
});

test("the mobile prepare action receives a real touch at 390 x 844", async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, "mobile-chromium");
  const consoleErrors = captureConsoleErrors(page);
  await openPreview(page, "/?mockWelcomeSeen=1&mockSingleFile=1");

  await page.getByRole("button", { name: "Parcourir" }).tap();
  await expect(page.locator(".file-ticket")).toHaveCount(1);
  const prepareButton = page.getByRole("button", { name: "Préparer la conversion" });
  await expect(prepareButton).toBeVisible();
  await expect(prepareButton).toBeEnabled();
  await expectMinimumTouchTarget(prepareButton);
  await expectCenterToBeHitTarget(prepareButton);
  await prepareButton.tap();

  await expect(page.getByRole("heading", { name: "Choisissez les formats" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(consoleErrors).toEqual([]);
});

test("runs cancellation, failure retry and export through the preview API", async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, "desktop-chromium");
  const consoleErrors = captureConsoleErrors(page);
  await openPreview(
    page,
    "/?mockWelcomeSeen=1&mockSingleFile=1&mockSlowConversion=1&mockConversionFailure=once",
  );

  await page.getByRole("button", { name: "Parcourir" }).click();
  await page.getByRole("button", { name: "Préparer la conversion" }).click();
  const firstFormat = page.locator(".format-card").first();
  await firstFormat.focus();
  await page.keyboard.press("Space");
  await expect(firstFormat).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Lancer la conversion" }).click();
  await expect(page.getByRole("heading", { name: "Conversion en cours" })).toBeVisible();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Conversion annulée" })).toBeVisible();

  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { name: "Conversion terminée avec erreur" })).toBeVisible();
  await page.getByRole("button", { name: "Réessayer les échecs" }).click();
  await expect(page.getByRole("heading", { name: "Conversion terminée" })).toBeVisible();

  await page.getByRole("button", { name: "Exporter vers Téléchargements" }).click();
  await expect(page.getByRole("heading", { name: "Fichiers enregistrés" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ouvrir le dossier" })).toBeVisible();
  const geometry = await page.locator(".progress-panel").evaluate((panel) => {
    const hero = panel.querySelector(".progress-hero")!.getBoundingClientRect();
    const count = panel.querySelector(".conversion-count")!.getBoundingClientRect();
    const filters = panel.querySelector(".output-filters")!.getBoundingClientRect();
    return { heroBottom: hero.bottom, countBottom: count.bottom, filtersTop: filters.top };
  });
  expect(geometry.countBottom).toBeLessThanOrEqual(geometry.heroBottom);
  expect(geometry.filtersTop).toBeGreaterThanOrEqual(geometry.heroBottom);
  await expectNoHorizontalOverflow(page);
  expect(consoleErrors).toEqual([]);
});

test("extracts and copies image text with cancellation, focus and Escape", async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, "desktop-chromium");
  const consoleErrors = captureConsoleErrors(page);
  await openPreview(page, "/?mockWelcomeSeen=1&mockOcrImage=1&mockSlowOcr=1");

  await page.getByRole("button", { name: "Parcourir" }).click();
  const extract = page.getByRole("button", { name: "Extraire le texte" });
  await expect(extract).toBeVisible();
  await extract.click();
  const dialog = page.getByRole("dialog", { name: "Texte de l’image" });
  await expect(dialog).toBeVisible();
  const cancel = dialog.getByRole("button", { name: "Annuler" });
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(extract).toBeFocused();

  await extract.click();
  await expect(dialog).toBeVisible();
  await cancel.click();
  await expect(dialog.getByRole("status")).toContainText("OCR annulé");
  const retry = dialog.getByRole("button", { name: "Réessayer" });
  await expect(retry).toBeFocused();
  await retry.click();
  await expect(dialog.getByRole("textbox", { name: "Texte reconnu" })).toHaveValue(
    "Texte reconnu localement dans l’image de démonstration.",
  );
  await expect(dialog.getByRole("button", { name: "Copier" })).toBeEnabled();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await dialog.getByRole("button", { name: "Copier" }).click();
  await expect(page.getByText("Le texte reconnu a été copié.")).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(
    "Texte reconnu localement dans l’image de démonstration.",
  );
  await expectNoHorizontalOverflow(page, "OCR image dialog");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(extract).toBeFocused();
  expect(consoleErrors).toEqual([]);
});

test("reports a truly empty OCR result without enabling copy", async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, "desktop-chromium");
  await openPreview(page, "/?mockWelcomeSeen=1&mockOcrImage=1&mockEmptyOcr=1");
  await page.getByRole("button", { name: "Parcourir" }).click();
  await page.getByRole("button", { name: "Extraire le texte" }).click();
  const dialog = page.getByRole("dialog", { name: "Texte de l’image" });
  await expect(dialog.getByText("Aucun texte n’a été détecté dans cette image.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Copier" })).toBeDisabled();
});

test("keeps the OCR dialog responsive at the four reference widths", async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, "desktop-chromium");
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width === 375 ? 844 : 900 });
    await openPreview(page, "/?mockWelcomeSeen=1&mockOcrImage=1&mockSlowOcr=1");
    await page.getByRole("button", { name: "Parcourir" }).click();
    await page.getByRole("button", { name: "Extraire le texte" }).click();
    const dialog = page.getByRole("dialog", { name: "Texte de l’image" });
    await expect(dialog).toBeVisible();
    await expectResponsiveState(page, `${width}px OCR dialog`);
    await dialog.getByRole("button", { name: "Annuler" }).click();
    await expect(dialog.getByRole("status")).toContainText("OCR annulé");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
});

test("supports welcome, settings and feedback with keyboard focus and Escape", async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, "desktop-chromium");
  const consoleErrors = captureConsoleErrors(page);
  await page.addInitScript(() => localStorage.setItem("multi-converter-feedback-public-warning-seen", "true"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const welcome = page.getByRole("dialog", { name: "Bonjour, bienvenue sur Multi-Converter." });
  await expect(welcome).toBeVisible();
  await expect(welcome.getByRole("button", { name: "Fermer" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("heading", { name: "Langue" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(welcome).toBeHidden();

  const settingsButton = page.getByRole("button", { name: "Paramètres" });
  await settingsButton.click();
  const settings = page.getByRole("dialog", { name: "Paramètres" });
  await expect(settings).toBeVisible();
  await expect(settings.getByRole("button", { name: "Fermer" })).toBeFocused();
  const notifications = settings.getByRole("checkbox");
  await expect(notifications).toBeChecked();
  await notifications.focus();
  await page.keyboard.press("Space");
  await expect(notifications).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();
  await expect(settingsButton).toBeFocused();

  const feedbackButton = page.getByRole("button", { name: "Signaler un bug ou proposer une fonctionnalité" });
  await expect(feedbackButton.locator("xpath=ancestor::header[contains(@class, 'topbar')]")).toHaveCount(1);
  await feedbackButton.click();
  const feedback = page.getByRole("dialog", { name: "Signaler ou proposer" });
  await expect(feedback).toBeVisible();
  const closeFeedback = feedback.getByRole("button", { name: "Fermer" });
  await expect(closeFeedback).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(feedback.getByRole("button", { name: "Annuler" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(closeFeedback).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(feedback).toBeHidden();
  await expect(feedbackButton).toBeFocused();

  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.matches(":focus-visible"))).toBe(true);
  await expectNoHorizontalOverflow(page);
  expect(consoleErrors).toEqual([]);
});

test("has no horizontal overflow at the four target widths and 200 percent zoom", async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, "desktop-chromium");
  const captureVellum = process.env.MC_CAPTURE_VELLUM === "1";

  await page.addInitScript(() => {
    localStorage.setItem("multi-converter-feedback-public-warning-seen", "true");
    localStorage.setItem("multi-converter-app-mode", "converter");
    localStorage.removeItem("multi-converter-welcome-seen");
  });

  for (const width of [375, 768, 1024, 1440]) {
    await runResponsiveJourney(page, {
      width,
      height: width === 375 ? 844 : 900,
      label: `${width}px`,
      capturePath: captureVellum
        ? testInfo.outputPath(`vellum-paper-${width}.png`)
        : null,
    });
  }

  // Browser zoom reduces the effective CSS viewport. 720 CSS px reproduces a
  // 1440 px desktop viewport at 200%, while remaining deterministic in headless Chromium.
  await runResponsiveJourney(page, {
    width: 720,
    height: 450,
    label: "1440px at 200% zoom equivalent",
    capturePath: captureVellum
      ? testInfo.outputPath("vellum-paper-1440-zoom-200.png")
      : null,
  });
});

async function runResponsiveJourney(
  page: Page,
  options: {
    width: number;
    height: number;
    label: string;
    capturePath: string | null;
  },
) {
  await page.setViewportSize({ width: options.width, height: options.height });
  await openPreview(page, "/?mockSingleFile=1");

  await test.step(`${options.label} - welcome`, async () => {
    const welcome = page.getByRole("dialog", {
      name: "Bonjour, bienvenue sur Multi-Converter.",
    });
    await expect(welcome).toBeVisible();
    await expectResponsiveState(page, `${options.label} welcome`);
    await page.keyboard.press("Escape");
    await expect(welcome).toBeHidden();
  });

  await test.step(`${options.label} - files and global dialogs`, async () => {
    await expect(page.getByRole("heading", { name: "Fichiers" })).toBeAttached();
    await expectResponsiveState(page, `${options.label} empty files`);
    if (options.capturePath) {
      await page.screenshot({ path: options.capturePath, fullPage: true });
    }

    const settingsButton = page.getByRole("button", { name: "Paramètres" });
    await settingsButton.click();
    const settings = page.getByRole("dialog", { name: "Paramètres" });
    await expect(settings).toBeVisible();
    await expectResponsiveState(page, `${options.label} settings`);
    await page.keyboard.press("Escape");
    await expect(settings).toBeHidden();

    const feedbackButton = page.getByRole("button", {
      name: "Signaler un bug ou proposer une fonctionnalité",
    });
    await feedbackButton.click();
    const feedback = page.getByRole("dialog", { name: "Signaler ou proposer" });
    await expect(feedback).toBeVisible();
    await expectResponsiveState(page, `${options.label} feedback`);
    await page.keyboard.press("Escape");
    await expect(feedback).toBeHidden();

    await page.getByRole("button", { name: "Parcourir" }).click();
    await expect(page.locator(".file-ticket")).toHaveCount(1);
    await expectResponsiveState(page, `${options.label} selected files`);
  });

  await test.step(`${options.label} - formats and conversion result`, async () => {
    await page.getByRole("button", { name: "Préparer la conversion" }).click();
    await expect(page.getByRole("heading", { name: "Choisissez les formats" })).toBeVisible();
    await expectResponsiveState(page, `${options.label} formats`);

    await page.locator(".format-card").first().click();
    await page.getByRole("button", { name: "Lancer la conversion" }).click();
    await expect(page.locator(".progress-screen.is-active")).toBeVisible();
    await expectResponsiveState(page, `${options.label} conversion progress`);
    await expect(page.getByRole("heading", { name: "Conversion terminée" })).toBeVisible();
    await expectResponsiveState(page, `${options.label} conversion result`);
  });


}

async function openPreview(page: Page, url = "/?mockWelcomeSeen=1") {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto(url);
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { name: "Multi-Converter", exact: true })).toBeVisible();
}

function skipUnlessProject(testInfo: TestInfo, projectName: string) {
  test.skip(testInfo.project.name !== projectName, `Covered by ${projectName}.`);
}

function captureConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function expectNoHorizontalOverflow(page: Page, label = "current page") {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  expect(dimensions.scrollWidth, `${label}: document overflow`).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  expect(dimensions.bodyScrollWidth, `${label}: body overflow`).toBeLessThanOrEqual(dimensions.bodyClientWidth + 1);
}

async function expectResponsiveState(page: Page, label: string) {
  await expectNoHorizontalOverflow(page, label);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  const dialogs = page.locator('[aria-modal="true"]:visible');
  for (let index = 0; index < await dialogs.count(); index += 1) {
    const dialog = dialogs.nth(index);
    const bounds = await dialog.boundingBox();
    expect(bounds, `${label}: dialog ${index + 1} has bounds`).not.toBeNull();
    expect(bounds!.x, `${label}: dialog ${index + 1} starts inside viewport`).toBeGreaterThanOrEqual(-1);
    expect(bounds!.x + bounds!.width, `${label}: dialog ${index + 1} ends inside viewport`).toBeLessThanOrEqual(viewportWidth + 1);
    const dimensions = await dialog.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(dimensions.scrollWidth, `${label}: dialog ${index + 1} overflow`).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  }
}

async function expectMinimumTouchTarget(
  locator: import("@playwright/test").Locator,
  minimum = 44,
) {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width).toBeGreaterThanOrEqual(minimum);
  expect(bounds!.height).toBeGreaterThanOrEqual(minimum);
}

async function expectCenterToBeHitTarget(locator: import("@playwright/test").Locator) {
  const receivesPointerAtCenter = await locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    return Boolean(hit && (hit === element || element.contains(hit)));
  });
  expect(receivesPointerAtCenter).toBe(true);
}

async function expectViewportOverlay(locator: import("@playwright/test").Locator, page: Page) {
  const viewport = page.viewportSize();
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeLessThanOrEqual(1);
  expect(bounds!.y).toBeLessThanOrEqual(1);
  expect(bounds!.width).toBeGreaterThanOrEqual((viewport?.width ?? 0) - 2);
  expect(bounds!.width).toBeLessThanOrEqual((viewport?.width ?? 0) + 2);
  expect(bounds!.height).toBeGreaterThanOrEqual((viewport?.height ?? 0) - 2);
  expect(bounds!.height).toBeLessThanOrEqual((viewport?.height ?? 0) + 2);
}
