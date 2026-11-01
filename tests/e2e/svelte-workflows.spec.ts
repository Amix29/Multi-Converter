import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }, info) => {
  test.skip(
    info.project.name !== "desktop-chromium",
    "Shared workflow coverage runs once.",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("recovery consent, report, folder export and re-export preserve the completed batch", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?mockWelcomeSeen=1&mockSingleFile=1");
  await page.getByRole("button", { name: "Paramètres" }).click();
  const consent = page.getByRole("checkbox", {
    name: "Retrouver le dernier lot lancé (24 h)",
    exact: true,
  });
  await expect(consent).not.toBeChecked();
  await consent.check();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Parcourir" }).click();
  await page.getByRole("button", { name: "Préparer la conversion" }).click();
  await page.locator(".format-card").first().click();
  await page.getByRole("button", { name: "Lancer la conversion" }).click();
  await expect(
    page.getByRole("heading", { name: "Conversion terminée", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Exporter le bilan du lot" }).click();
  await expect(
    page.getByText("Bilan du lot exporté.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Exporter vers Téléchargements" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Fichiers enregistrés" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Choisir un dossier", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Ouvrir le dossier" }),
  ).toBeEnabled();
  await expect(page.locator(".job-row")).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: "Recharger les originaux" }).click();
  await expect(
    page.getByRole("heading", { name: "Choisissez les formats" }),
  ).toBeVisible();
  await expect(page.locator(".rail-format.is-selected")).toHaveText("PDF");
  await expect(page.locator(".job-state.is-done, .job-summary")).toHaveCount(0);
  await expect(page.locator(".progress-screen.is-active")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("implicit paste imports only in Files and Formats and ignores editable fields and output", async ({
  page,
}) => {
  await page.goto("/?mockWelcomeSeen=1&mockSlowConversion=1");
  const paste = async (selector: string, text: string) =>
    page.locator(selector).evaluate((target, value) => {
      const data = new DataTransfer();
      data.setData("text/plain", value);
      target.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    }, text);
  await paste("body", "Texte local de démonstration.");
  await expect(page.locator(".file-ticket")).toHaveCount(1);
  await page.getByRole("button", { name: "Préparer la conversion" }).click();
  await paste(".search-box input", "This text belongs in the search field.");
  await expect(page.locator(".rail-button")).toHaveCount(1);
  await paste("body", "Autre texte local.");
  await expect(page.locator(".rail-button")).toHaveCount(2);
  await page.locator(".format-card").first().click();
  await page
    .getByRole("button", { name: /^Appliquer aux .*compatibles$/ })
    .click();
  await page.getByRole("button", { name: "Lancer la conversion" }).click();
  await paste("body", "Ignored during output.");
  await expect(page.getByTestId("virtual-job-list")).toHaveAttribute(
    "data-total-count",
    "2",
  );
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Conversion annulée" }),
  ).toBeVisible();
});
