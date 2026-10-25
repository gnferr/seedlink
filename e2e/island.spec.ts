import { expect, test, type Page } from "@playwright/test";

const VERDICT = /^Scans · (\d+)\/\1 modules/;
const NOT_FOLDED = "Fold the tree into your code first, then save.";
const NO_CODE = "Type or paste a link to grow your island.";
const TOO_LONG = "The text is too long for one QR code. Shorten it to save.";

// Software WebGL is slow when workers run in parallel.
test.beforeEach(() => test.slow());

const chip = (page: Page) => page.locator("button.hint");
const save = (page: Page) => page.getByRole("button", { name: "Save" });
const field = (page: Page) => page.getByRole("textbox", { name: "Link or text" });
const hint = async (page: Page) => (await chip(page).textContent())?.trim() ?? "";
const openPanel = (page: Page) => page.getByRole("button", { name: /^Season and colours/ }).click();

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });
  await expect(chip(page)).toContainText("Tap the tree to fold it into your code");
}
async function fold(page: Page) {
  await page.getByRole("button", { name: "Fold into code" }).click();
  await expect(chip(page)).toHaveText(VERDICT, { timeout: 20_000 });
}
// Save can be disabled for only ~300ms; record it in-page so a slow test run can't miss the window.
const watchSave = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { sawDisabled: boolean };
    const b = document.querySelector(".save")!;
    w.sawDisabled = b.getAttribute("aria-disabled") === "true";
    new MutationObserver(() => (w.sawDisabled ||= b.getAttribute("aria-disabled") === "true")).observe(b, { attributes: true });
  });
const sawDisabled = (page: Page) => page.evaluate(() => (window as unknown as { sawDisabled: boolean }).sawDisabled);
const disabled = (page: Page) => expect(save(page)).toHaveAttribute("aria-disabled", "true");
const enabled = (page: Page) => expect(save(page)).not.toHaveAttribute("aria-disabled", "true");

test("landing: tree hint and Save refused with a reason", async ({ page }) => {
  await ready(page);
  await disabled(page);
  await expect(save(page)).toHaveAttribute("title", NOT_FOLDED);
  await expect(page.locator("#save-reason")).toHaveText(NOT_FOLDED);
});

test("keyboard fold reaches the verdict and Save downloads the PNG", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < 6 && !(await chip(page).evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(chip(page)).toHaveText(VERDICT, { timeout: 20_000 });
  await enabled(page);
  const [dl] = await Promise.all([page.waitForEvent("download"), save(page).click()]);
  expect(dl.suggestedFilename()).toBe("sky-island-qr.png");
});

for (const s of ["Spring", "Summer", "Autumn", "Winter"]) {
  test(`${s}: folds to a full verdict`, async ({ page }) => {
    await ready(page);
    await openPanel(page);
    await page.getByRole("radio", { name: s }).click();
    await fold(page);
    await enabled(page);
  });
}

test("changing season or leaf colour while folded re-checks before Save", async ({ page }) => {
  await ready(page);
  await fold(page);
  await openPanel(page);
  await watchSave(page);
  await page.getByRole("radio", { name: "Winter" }).click();
  await expect(chip(page)).toHaveText(VERDICT, { timeout: 20_000 });
  await enabled(page);
  expect(await sawDisabled(page), "Save was disabled while re-checking the season").toBe(true);
  await watchSave(page);
  await page.locator('button[aria-label^="Leaf colour"][aria-pressed="false"]').first().click();
  await expect(chip(page)).toHaveText(VERDICT, { timeout: 20_000 });
  await enabled(page);
  expect(await sawDisabled(page), "Save was disabled while re-checking the leaf colour").toBe(true);
});

test("typing a new link while folded never shows the old verdict", async ({ page }) => {
  await ready(page);
  await fold(page);
  await page.evaluate(() => {
    const w = window as unknown as { seen: string[] };
    w.seen = [];
    new MutationObserver(() => w.seen.push(document.querySelector("button.hint")?.textContent ?? "")).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await field(page).pressSequentially("x");
  await disabled(page); // immediately, before the debounced link catches up
  await expect(chip(page)).toContainText("Tap the tree", { timeout: 30_000 });
  expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen.filter((t) => /^Scans/.test(t)))).toEqual([]);
  expect(await hint(page)).not.toMatch(/^Scans/);
  await disabled(page);
});

test("resizing while folded disables Save until a new verdict", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready(page);
  await fold(page);
  await watchSave(page);
  await page.setViewportSize({ width: 900, height: 700 });
  await expect(chip(page)).toHaveText(VERDICT, { timeout: 20_000 });
  await enabled(page);
  expect(await sawDisabled(page), "Save was disabled until the new verdict").toBe(true);
});

test("clicking the chip while Folding does nothing and the fold completes", async ({ page }) => {
  await ready(page);
  // Click again from inside the page, as soon as it reads Folding…, so the click can't land after the fold ends.
  const midFold = await page.evaluate(async () => {
    const b = document.querySelector<HTMLButtonElement>("button.hint")!;
    b.click();
    for (let i = 0; i < 100 && b.textContent !== "Folding…"; i++) await new Promise((r) => requestAnimationFrame(r));
    const text = b.textContent;
    if (text === "Folding…") b.click();
    return text;
  });
  expect(midFold).toBe("Folding…");
  await expect(chip(page)).toHaveText(VERDICT, { timeout: 20_000 });
});

test("reduced motion: fold reaches a verdict within 2s", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await page.getByRole("button", { name: "Fold into code" }).click();
  await expect(chip(page)).toHaveText(VERDICT, { timeout: 2000 });
});

test("empty link keeps the world and Save says why", async ({ page }) => {
  await ready(page);
  await field(page).fill("");
  await expect(chip(page)).toContainText(NO_CODE);
  await expect(page.locator("#save-reason")).toHaveText(NO_CODE);
  await expect(page.getByRole("img", { name: /example\.com/ })).toBeVisible();
});

test("a 3000-character link, typed after emptying the field, refuses Save with the too-long reason", async ({ page }) => {
  await ready(page);
  await field(page).fill("");
  await expect(chip(page)).toContainText(NO_CODE);
  await field(page).fill("a".repeat(3000));
  await expect(page.locator("#save-reason")).toHaveText(TOO_LONG);
  await expect(chip(page)).toContainText(TOO_LONG);
});

test("the page never scrolls at phone size", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const o = await page.evaluate(() => ({
    v: document.documentElement.scrollHeight - window.innerHeight,
    h: document.documentElement.scrollWidth - window.innerWidth,
  }));
  expect(o).toEqual({ v: 0, h: 0 });
});

for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`layout fits and does not overlap at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await ready(page);
    await openPanel(page);
    const boxes = [];
    for (const l of [page.locator(".pill"), chip(page), page.locator("#season-panel")]) {
      const b = (await l.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(size.width);
      expect(b.y + b.height).toBeLessThanOrEqual(size.height);
      boxes.push(b);
    }
    for (let i = 0; i < 3; i++)
      for (let j = i + 1; j < 3; j++) {
        const a = boxes[i], b = boxes[j];
        const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlap, `boxes ${i} and ${j} overlap`).toBe(false);
      }
  });
}

test("text contrast >= 4.5 with the controls closed", async ({ page }) => {
  await ready(page);
  const w = await worstTextContrast(page);
  expect(w.ratio, w.desc).toBeGreaterThanOrEqual(4.5);
});

test("text contrast >= 4.5 with the season panel open", async ({ page }) => {
  await ready(page);
  await openPanel(page);
  const w = await worstTextContrast(page);
  expect(w.ratio, w.desc).toBeGreaterThanOrEqual(4.5);
});

test("folded verdict text keeps contrast", async ({ page }) => {
  await ready(page);
  await fold(page);
  const w = await worstTextContrast(page);
  expect(w.ratio, w.desc).toBeGreaterThanOrEqual(4.5);
});

// WCAG contrast of every visible text node in the controls against the effective painted background.
async function worstTextContrast(page: Page) {
  return page.evaluate(() => {
    const px = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    px.canvas.width = px.canvas.height = 1;
    const rgba = (css: string) => {
      px.clearRect(0, 0, 1, 1);
      px.fillStyle = "#000";
      px.fillStyle = css;
      px.fillRect(0, 0, 1, 1);
      const d = px.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    };
    const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const L = (c: number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const backdrop = (el: Element) => {
      const layers: number[][] = [];
      for (let e: Element | null = el; e; e = e.parentElement) {
        const c = rgba(getComputedStyle(e).backgroundColor);
        if (c[3] > 0) layers.push(c);
        if (c[3] >= 0.99) break;
      }
      let out = [255, 255, 255];
      for (const c of layers.reverse()) out = out.map((v, i) => c[i] * c[3] + v * (1 - c[3]));
      return out;
    };
    const ratio = (a: number[], b: number[]) => {
      const [hi, lo] = [L(a), L(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const els = new Set<Element>();
    const root = document.querySelector(".ui")!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.textContent?.trim() && n.parentElement && !n.parentElement.closest(".sr-only, [aria-disabled=true]")) els.add(n.parentElement);
    }
    root.querySelectorAll("input").forEach((e) => els.add(e));
    let worst = { ratio: Infinity, desc: "" };
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === "hidden") continue;
      const bg = backdrop(el);
      const fg = rgba(cs.color);
      const fgOpaque = fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
      const v = ratio(fgOpaque, bg);
      if (v < worst.ratio) worst = { ratio: v, desc: `<${el.tagName.toLowerCase()}> "${(el.textContent || (el as HTMLInputElement).value || "").trim().slice(0, 40)}" fg=${cs.color} bg=rgb(${bg.map(Math.round)})` };
    }
    return worst;
  });
}
