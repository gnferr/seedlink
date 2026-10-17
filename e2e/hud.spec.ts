import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });
}

// Two frames: any state change a key press caused has rendered, so a "nothing changed" check is not vacuous.
const flush = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

const view = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

test("E7 hotkeys: 1/2/3 switch views, but not while typing or with Ctrl", async ({ page }) => {
  await ready(page);
  const [explore, reveal, scan] = ["Explore", "Reveal", "Scan"].map((n) => view(page, n));

  await page.keyboard.press("3");
  await expect(scan).toHaveAttribute("aria-pressed", "true");
  await expect(explore).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("2");
  await expect(reveal).toHaveAttribute("aria-pressed", "true");
  await expect(scan).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("1");
  await expect(explore).toHaveAttribute("aria-pressed", "true");

  // Typing in the field is typing, not a hotkey; the later plain 3 proves the app was alive and only it took effect.
  const field = page.getByRole("textbox", { name: "Link or text" });
  await field.fill("");
  await field.press("2");
  await flush(page);
  await expect(explore).toHaveAttribute("aria-pressed", "true");
  await field.blur();
  await page.keyboard.press("3");
  await expect(scan).toHaveAttribute("aria-pressed", "true");
  await expect(reveal).toHaveAttribute("aria-pressed", "false");
  await expect(field).toHaveValue("2");
  await page.keyboard.press("1");
  await expect(explore).toHaveAttribute("aria-pressed", "true");

  // A modifier means the browser's shortcut, not ours; the plain 3 afterwards proves the app was alive in between.
  await page.keyboard.press("Control+3");
  await page.keyboard.press("Control+2");
  await flush(page);
  await expect(explore).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("3");
  await expect(scan).toHaveAttribute("aria-pressed", "true");
  await expect(reveal).toHaveAttribute("aria-pressed", "false");
});

test("the season dial works by keyboard", async ({ page }) => {
  await ready(page);
  const dial = page.getByRole("radiogroup", { name: "Season" });
  const summer = dial.getByRole("radio", { name: "Summer" });
  await summer.focus();
  await page.keyboard.press("ArrowRight");
  await expect(dial.getByRole("radio", { name: "Autumn" })).toBeChecked();
  await expect(dial.getByRole("radio", { name: "Autumn" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(dial.getByRole("radio", { name: "Spring" })).toBeChecked();
  await expect(page.locator("[aria-live=polite].sr-only")).toContainText("Season: Spring.");
});

test("Shake is gated with its reason in text", async ({ page }) => {
  await ready(page);
  const shake = page.getByRole("button", { name: "Shake" });
  await expect(shake).toHaveAttribute("aria-disabled", "false");
  await expect(page.getByText("Shake works in Explore.")).toHaveCount(0);

  await view(page, "Scan").click();
  await expect(shake).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByText("Shake works in Explore.")).toBeVisible();
  await expect(shake).toHaveAccessibleDescription(/Shake works in Explore\./);

  await view(page, "Explore").click();
  await expect(shake).toHaveAttribute("aria-disabled", "false");
  await expect(page.getByText("Shake works in Explore.")).toHaveCount(0);
});

test("the Breeze switch is a real switch", async ({ page }) => {
  await ready(page);
  const sw = page.getByRole("switch", { name: /Breeze/ });
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect(sw).toContainText("ON");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(sw).toContainText("OFF");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect(sw).toContainText("ON");
});

for (const size of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`the status plaque stays visible with the HUD collapsed (${size.width}px)`, async ({ page }) => {
    await page.setViewportSize(size);
    await ready(page);
    if (size.width < 768) await page.getByRole("button", { name: "Expand controls" }).click();
    await page.getByRole("button", { name: "Collapse controls" }).click();
    await expect(page.getByRole("button", { name: "Expand controls" })).toBeVisible();

    await expect(page.getByRole("status").filter({ hasText: /scan|check|code/i })).toBeInViewport({ ratio: 1 });
    for (const n of ["Explore", "Reveal", "Scan"]) await expect(view(page, n)).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("radiogroup", { name: "Season" })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("textbox", { name: "Link or text" })).toBeHidden();
  });
}

test("E8 — pixel face discipline", async ({ page }) => {
  await ready(page);
  // Cover the Scan-status state too.
  await view(page, "Scan").click();
  await expect(page.getByRole("status").filter({ hasText: /modules/ })).toContainText(/^Scans/, { timeout: 10_000 });

  const r = await page.evaluate(() => {
    const pixel: string[] = [];
    const bad: string[] = [];
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (!/pixelify/i.test(cs.fontFamily)) continue;
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim());
      if (!hasText && !(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) continue;
      const d = `<${el.tagName.toLowerCase()}> "${(el.textContent || "").trim().slice(0, 30)}" ${cs.fontSize}`;
      pixel.push(d);
      if (parseFloat(cs.fontSize) < 14) bad.push(`${d} too small`);
      if (el.matches("input, select, textarea, [role=alert]") || el.closest("[role=status]")) bad.push(`${d} wrong face for role`);
    }
    return { pixel, bad };
  });
  expect(r.pixel.length, "pixel face must be in use").toBeGreaterThan(0);
  expect(r.bad).toEqual([]);
});

async function noScroll(page: Page) {
  const o = await page.evaluate(() => ({
    v: document.documentElement.scrollHeight - window.innerHeight,
    h: document.documentElement.scrollWidth - window.innerWidth,
  }));
  expect(o.v).toBeLessThanOrEqual(0);
  expect(o.h).toBeLessThanOrEqual(0);
}

const hud = (page: Page) => page.locator('section[aria-label="Controls"]');
const box = async (page: Page) => (await hud(page).boundingBox())!;

test("the HUD fits on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready(page);
  await expect.poll(async () => (await box(page)).width).toBeLessThanOrEqual(0.3 * 1440);
  await noScroll(page);
  await page.getByRole("button", { name: "Collapse controls" }).click();
  await expect(page.getByRole("button", { name: "Expand controls" })).toBeVisible();
  await noScroll(page);
});

test("the HUD fits on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const status = page.getByRole("status").filter({ hasText: /scan|check|code/i });

  // Collapsed dock (the phone default), including the Scan and Won't-scan states.
  await expect.poll(async () => (await box(page)).height).toBeLessThanOrEqual(96);
  await noScroll(page);
  await view(page, "Scan").click();
  await expect(status).toContainText(/^Scans/, { timeout: 10_000 });
  expect((await box(page)).height).toBeLessThanOrEqual(96);
  await noScroll(page);
  await page.getByRole("button", { name: "Expand controls" }).click();
  await page.getByRole("textbox", { name: "Base", exact: true }).fill("#1d2618");
  await expect(status).toContainText(/^Won't scan/, { timeout: 10_000 });
  await page.getByRole("button", { name: "Collapse controls" }).click();
  await expect(page.getByRole("button", { name: "Expand controls" })).toBeVisible();
  expect((await box(page)).height).toBeLessThanOrEqual(96);
  await noScroll(page);

  // Season labels are abbreviated visually but keep their full names.
  for (const [short, name] of [["Su", "Summer"], ["Au", "Autumn"], ["Wi", "Winter"], ["Sp", "Spring"]]) {
    const radio = page.getByRole("radio", { name });
    await expect(radio).toBeVisible();
    await expect(radio.locator('span[aria-hidden="true"]')).toHaveText(short);
  }

  await page.getByRole("button", { name: "Expand controls" }).click();
  await expect(page.getByRole("textbox", { name: "Link or text" })).toBeVisible();
  expect((await box(page)).height).toBeLessThanOrEqual(0.44 * 844);
  await noScroll(page);
});
