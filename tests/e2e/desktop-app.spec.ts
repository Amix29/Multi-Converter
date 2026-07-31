import { expect, test, type Page, type TestInfo } from "@playwright/test";

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
  await expectNoHorizontalOverflow(page);
  expect(consoleErrors).toEqual([]);
});

test("autosaves an edited document before returning it to recent documents", async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, "desktop-chromium");
  const consoleErrors = captureConsoleErrors(page);
  await openPreview(page);

  const editorTab = page.getByRole("tab", { name: "Éditeur" });
  await editorTab.focus();
  await page.keyboard.press("Enter");
  await expect(editorTab).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Nouveau document" }).click();

  await page.getByRole("textbox", { name: "Nom du document" }).fill("Référence Phase 2");
  const editor = page.locator(".ProseMirror");
  await expect(editor).toBeVisible();
  await editor.fill("Texte local avec accents : été, cœur, français.");
  await expect(editor).toContainText("Texte local avec accents");
  await expect(page.getByText("Modifications non enregistrées", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Revenir aux documents" }).click();
  const recentDocument = page.getByText("Référence Phase 2", { exact: true });
  await expect(recentDocument).toBeVisible();
  await recentDocument.click();
  await expect(page.getByRole("textbox", { name: "Nom du document" })).toHaveValue("Référence Phase 2");
  await expect(page.locator(".ProseMirror")).toContainText("Texte local avec accents");

  await expectNoHorizontalOverflow(page);
  expect(consoleErrors).toEqual([]);
});

test("keeps the document open when refreshing recent documents fails", async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, "desktop-chromium");
  await openPreview(page, "/?mockWelcomeSeen=1&mockRecentRefreshFailure=once");
  await page.getByRole("tab", { name: "Éditeur" }).click();
  await page.getByRole("button", { name: "Nouveau document" }).click();

  const editor = page.locator(".ProseMirror");
  await editor.fill("Ce contenu doit rester ouvert si la liste des récents échoue.");
  await expect(page.getByText("Enregistré", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Revenir aux documents" }).click();

  await expect(editor).toBeVisible();
  await expect(page.getByText("Rafraîchissement des documents récents simulé en échec.")).toBeVisible();
});

test("keeps editor menus and dialogs above animated content and restores focus", async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, "desktop-chromium");
  const consoleErrors = captureConsoleErrors(page);
  await openPreview(page, "/?mockWelcomeSeen=1&mockRecentDocuments=1");
  await page.getByRole("tab", { name: "Éditeur" }).click();

  const trigger = page.getByRole("button", { name: "Actions pour Brouillon de test" });
  await trigger.click();
  const popover = page.getByRole("menu");
  await expect(popover).toBeVisible();
  await expectCenterToBeHitTarget(popover);
  await page.getByRole("menuitem", { name: "Renommer" }).click();

  const dialog = page.getByRole("dialog", { name: "Renommer le document" });
  await expect(dialog).toBeVisible();
  await expectViewportOverlay(page.locator(".editor-modal-backdrop"), page);
  await expectCenterToBeHitTarget(dialog);
  await expect(page.getByRole("textbox", { name: "Nom du document" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await expectNoHorizontalOverflow(page);
  expect(consoleErrors).toEqual([]);
});

test("sanitizes hostile imported and pasted HTML before it reaches Tiptap", async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, "desktop-chromium");
  const consoleErrors = captureConsoleErrors(page);
  await openPreview(page, "/?mockWelcomeSeen=1&mockMaliciousHtml=1");
  await page.getByRole("tab", { name: "Éditeur" }).click();
  await page.getByRole("button", { name: "Ouvrir un document" }).click();

  const editor = page.locator(".ProseMirror");
  await expect(editor).toContainText("Contenu sûr conservé");
  await expect(editor).toContainText("Image distante ou inaccessible supprimée");
  await expect(editor.locator(".unsupported-document-object")).toHaveCount(1);
  await expect(editor.locator('a[href="https://example.com/reference"]')).toHaveAttribute("rel", /noopener/);
  await expectSafeEditorHtml(editor);

  await editor.focus();
  await editor.evaluate((element) => {
    const clipboard = new DataTransfer();
    clipboard.setData(
      "text/html",
      '<p onpointerenter="window.__MC_ACTIVE_HTML__ = true">Collage sûr</p><script>window.__MC_ACTIVE_HTML__ = true</script><img src="https://example.com/remote.png"><img src="data:image/png;base64,iVBORw0KGgo="><a href="javascript:alert(1)">Lien collé</a>',
    );
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: clipboard }));
  });
  await expect(editor).toContainText("Collage sûr");
  await expect(editor.locator('img[src^="data:"]')).toHaveCount(0);
  await expectSafeEditorHtml(editor);
  expect(await page.evaluate(() => (window as Window & { __MC_ACTIVE_HTML__?: boolean }).__MC_ACTIVE_HTML__)).toBeUndefined();

  await page.locator(".editor-toolbar").getByRole("button", { name: "En-tête" }).click();
  const headerDialog = page.getByRole("dialog", { name: "Modifier l’en-tête" });
  const headerEditor = headerDialog.locator(".ProseMirror");
  await headerEditor.focus();
  await headerEditor.evaluate((element) => {
    const clipboard = new DataTransfer();
    clipboard.setData(
      "text/html",
      '<p onload="window.__MC_ACTIVE_HTML__ = true">En-tête sûr</p><iframe src="https://example.com"></iframe><img src="data:image/png;base64,iVBORw0KGgo=">',
    );
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: clipboard }));
  });
  await expect(headerEditor).toContainText("En-tête sûr");
  await expect(headerEditor.locator('img[src^="data:"]')).toHaveCount(0);
  await expectSafeEditorHtml(headerEditor);
  await page.keyboard.press("Escape");
  await expect(headerDialog).toBeHidden();

  expect(consoleErrors).toEqual([]);
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
  await openPreview(page, "/?mockSingleFile=1&mockRecentDocuments=1");

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

  await test.step(`${options.label} - editor landing, document and dialogs`, async () => {
    await page.getByRole("tab", { name: "Éditeur" }).click();
    const recentTrigger = page.getByRole("button", {
      name: "Actions pour Brouillon de test",
    });
    await expect(recentTrigger).toBeVisible();
    await expectResponsiveState(page, `${options.label} editor landing`);

    await recentTrigger.click();
    await page.getByRole("menuitem", { name: "Renommer" }).click();
    const renameDialog = page.getByRole("dialog", {
      name: "Renommer le document",
    });
    await expect(renameDialog).toBeVisible();
    await expectResponsiveState(page, `${options.label} recent document dialog`);
    await page.keyboard.press("Escape");
    await expect(renameDialog).toBeHidden();

    await page.getByRole("button", { name: "Nouveau document" }).click();
    await expect(page.getByRole("textbox", { name: "Nom du document" })).toBeVisible();
    await expectResponsiveState(page, `${options.label} editor document`);

    await page.locator(".editor-toolbar").getByRole("button", { name: "En-tête" }).click();
    const headerDialog = page.getByRole("dialog", { name: "Modifier l’en-tête" });
    await expect(headerDialog).toBeVisible();
    await expectResponsiveState(page, `${options.label} editor header dialog`);
    await page.keyboard.press("Escape");
    await expect(headerDialog).toBeHidden();
  });
}

async function openPreview(page: Page, url = "/?mockWelcomeSeen=1") {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto(url);
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("tab", { name: "Convertisseur" })).toHaveAttribute("aria-selected", "true");
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

async function expectSafeEditorHtml(editor: import("@playwright/test").Locator) {
  const state = await editor.evaluate((element) => {
    const html = element.innerHTML;
    return {
      hasActiveElement: Boolean(element.querySelector("script, iframe, object, embed, form, input, button, style, link, meta, svg, math")),
      hasEventHandler: Array.from(element.querySelectorAll("*")).some((node) =>
        Array.from(node.attributes).some((attribute) => attribute.name.toLowerCase().startsWith("on")),
      ),
      hasDangerousProtocol: /javascript:|vbscript:|data:text\/html/i.test(html),
      hasRemoteImage: Boolean(element.querySelector('img[src^="http://"], img[src^="https://"], img[src^="//"]')),
      hasActiveStyle: /(?:url\s*\(|expression\s*\(|@import|-moz-binding|behavior\s*:)/i.test(html),
      hasUnboundedTableSpan: Array.from(element.querySelectorAll("td, th")).some((cell) =>
        ["colspan", "rowspan"].some((attribute) => Number(cell.getAttribute(attribute) ?? 1) > 100),
      ),
    };
  });
  expect(state).toEqual({
    hasActiveElement: false,
    hasEventHandler: false,
    hasDangerousProtocol: false,
    hasRemoteImage: false,
    hasActiveStyle: false,
    hasUnboundedTableSpan: false,
  });
}
