import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }, info) => {
  test.skip(
    info.project.name !== "desktop-chromium",
    "Shared migration coverage runs once on desktop.",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("Bits select supports keyboard, typeahead, dismissal and stream-copy state", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?mockWelcomeSeen=1&mockMediaFiles=1");
  await page.getByRole("button", { name: "Parcourir" }).click();
  await page.getByRole("button", { name: "Préparer la conversion" }).click();
  await page.locator(".format-card").first().click();
  const mode = page.getByRole("combobox").first();
  await mode.focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(mode).toContainText("Copier");
  await expect(mode).toBeFocused();
  await expect(page.getByRole("combobox")).toHaveCount(1);
  await mode.click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect(mode).toContainText("Réencoder");
  await mode.click();
  await page.keyboard.type("Cop");
  await page.keyboard.press("Enter");
  await expect(mode).toContainText("Copier");
  await mode.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(mode).toBeFocused();
  expect(errors).toEqual([]);
});

test("all six language preferences persist and both themes follow their owner", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/?mockWelcomeSeen=1");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Paramètres" }).click();
  const settings = page.locator(".settings-panel");
  for (const language of ["en", "es", "de", "pt", "it", "fr"]) {
    await settings.locator(`[data-language-option="${language}"]`).click();
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    await expect(
      settings.locator(`[data-language-option="${language}"]`),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      await page.evaluate(() =>
        localStorage.getItem("multi-converter-language"),
      ),
    ).toBe(language);
  }
  await settings.locator(".theme-choices button").nth(1).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
});

test("twenty overlay cycles release focus traps, DOM and owned global listeners", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const listeners = new Map<
      EventTarget,
      Map<string, Set<EventListenerOrEventListenerObject>>
    >();
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (
      type,
      listener,
      options,
    ) {
      if (
        (this === window || this === document) &&
        listener &&
        !(typeof options === "object" && options.once)
      ) {
        const byType = listeners.get(this) ?? new Map();
        const capture =
          typeof options === "boolean" ? options : Boolean(options?.capture);
        const key = `${type}:${capture}`;
        const set = byType.get(key) ?? new Set();
        set.add(listener);
        byType.set(key, set);
        listeners.set(this, byType);
      }
      return add.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (
      type,
      listener,
      options,
    ) {
      const capture =
        typeof options === "boolean" ? options : Boolean(options?.capture);
      if (listener)
        listeners.get(this)?.get(`${type}:${capture}`)?.delete(listener);
      return remove.call(this, type, listener, options);
    };
    Object.defineProperty(window, "migrationListenerCount", {
      value: () =>
        [...listeners.values()].reduce(
          (sum, map) =>
            sum + [...map.values()].reduce((total, set) => total + set.size, 0),
          0,
        ),
    });
  });
  const count = () =>
    page.evaluate(() =>
      (
        window as unknown as { migrationListenerCount(): number }
      ).migrationListenerCount(),
    );
  await page.goto("/?mockWelcomeSeen=1&mockOcrImage=1&mockSlowOcr=1");
  await page.getByRole("button", { name: "Parcourir" }).click();
  const trigger = page.getByRole("button", { name: "Paramètres" });
  for (let cycle = 0; cycle < 2; cycle++) {
    await trigger.click();
    await expect(page.locator(".settings-panel")).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await expect(page.locator("[data-mc-modal]")).toHaveCount(0);
  const before = await count();
  for (let cycle = 0; cycle < 20; cycle++) {
    await trigger.click();
    await expect(page.locator(".settings-panel")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  }
  await expect(page.locator("[data-mc-modal]")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveClass(/has-open-modal/);
  expect(await count()).toBe(before);
  const extract = page.getByRole("button", { name: "Extraire le texte" });
  for (let cycle = 0; cycle < 20; cycle++) {
    await extract.click();
    await expect(
      page.getByRole("dialog", { name: "Texte de l’image" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(extract).toBeFocused();
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveClass(/has-open-modal/);
  expect(await count()).toBe(before);
});

test("dark and light product captures preserve actions at reference widths", async ({
  page,
}) => {
  for (const theme of ["light", "dark"]) {
    await page.goto("/?mockWelcomeSeen=1");
    await page.evaluate(
      (value) => localStorage.setItem("multi-converter.theme", value),
      theme,
    );
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/?mockWelcomeSeen=1&mockMediaFiles=1");
      await page.getByRole("button", { name: "Parcourir" }).click();
      await page
        .getByRole("button", { name: "Préparer la conversion" })
        .click();
      await page.locator(".format-card").first().click();
      await page
        .getByRole("button", { name: /^Appliquer aux .*compatibles$/ })
        .click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
      await expect(
        page.getByRole("button", { name: "Lancer la conversion" }),
      ).toBeVisible();
      await page.screenshot({
        path: `docs/audits/2026-11-01/svelte-migration/svelte-${theme}-${width}.png`,
        fullPage: true,
      });
    }
  }
});
