import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { QUIET_ZONE } from "../src/lib/qr";
import { scanFit } from "../src/lib/scanFit";

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

// An independent scan check of the saved file: finder rings and the quiet zone, sampled here (not by sampleScan).
// Independent scan check of a saved PNG: finder rings and the quiet zone, sampled here (not by sampleScan).
async function checkPng(page: Page, path: string, size: number) {
  const url = `data:image/png;base64,${readFileSync(path).toString("base64")}`;
  // The PNG is the drawing buffer; the page framed the code with CSS-px insets measured as below.
  const geo = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    (window as unknown as { png: CanvasRenderingContext2D }).png = ctx;
    const main = document.querySelector("main")!.getBoundingClientRect();
    const bottom = Math.ceil(main.bottom - document.querySelector(".bar")!.getBoundingClientRect().top);
    return { w: img.width, h: img.height, cssH: document.querySelector("canvas")!.clientHeight, bottom };
  }, url);
  const k = geo.h / geo.cssH;
  const { zoom: pitch, dy } = scanFit(geo.w, geo.h, size + 2 * QUIET_ZONE, { top: 0, bottom: geo.bottom * k });
  const mid = (size - 1) / 2;
  const at = (x: number, z: number) => [Math.floor(geo.w / 2 + (x - mid) * pitch), Math.floor(geo.h / 2 + dy + (z - mid) * pitch)];

  const dark: number[][] = [], light: number[][] = [], quiet: number[][] = [];
  for (const [fx, fz] of [[0, 0], [size - 7, 0], [0, size - 7]])
    for (let i = 0; i < 7; i++)
      for (let j = 0; j < 7; j++) {
        const ring = Math.max(Math.abs(i - 3), Math.abs(j - 3)); // 3: dark border, 2: light ring, <= 1: dark centre
        (ring === 2 ? light : dark).push(at(fx + i, fz + j));
      }
  for (let z = -QUIET_ZONE; z < size + QUIET_ZONE; z++)
    for (let x = -QUIET_ZONE; x < size + QUIET_ZONE; x++)
      if (x < 0 || z < 0 || x >= size || z >= size) quiet.push(at(x, z));

  const luma = (pts: number[][]) =>
    page.evaluate((pts) => {
      const ctx = (window as unknown as { png: CanvasRenderingContext2D }).png;
      return pts.map(([x, y]) => {
        const d = ctx.getImageData(x, y, 1, 1).data;
        return 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2];
      });
    }, pts);
  const [d, l, q] = [await luma(dark), await luma(light), await luma(quiet)];
  const maxDark = Math.max(...d);
  const minLight = Math.min(...l, ...q);
  expect(minLight - maxDark, `finder dark max ${maxDark}, light/quiet min ${minLight}`).toBeGreaterThan(60);
  // Uniform: no quiet-zone module strays far from the others (a tile or shadow would).
  expect(Math.max(...q) - Math.min(...q), "quiet zone spread").toBeLessThan(40);
}

async function foldAndSave(page: Page) {
  await fold(page);
  const size = Math.sqrt(Number(VERDICT.exec(await hint(page))![1]));
  expect(Number.isInteger(size)).toBe(true);
  const [dl] = await Promise.all([page.waitForEvent("download"), save(page).click()]);
  return { path: (await dl.path())!, size };
}

test("the saved PNG has three finder patterns and a light quiet zone", async ({ page }) => {
  await ready(page);
  const { path, size } = await foldAndSave(page);
  await checkPng(page, path, size);
});

test("the season panel takes focus and gives it back", async ({ page }) => {
  await ready(page);
  const button = page.getByRole("button", { name: /^Season and colours/ });
  await expect(button).toHaveAttribute("aria-controls", "season-panel");
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("radio", { name: "Summer" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#season-panel")).toHaveCount(0);
  await expect(button).toBeFocused();
  // Escape with focus outside the panel leaves it there.
  await openPanel(page);
  await field(page).focus();
  await page.keyboard.press("Escape");
  await expect(page.locator("#season-panel")).toHaveCount(0);
  await expect(field(page)).toBeFocused();
  // An outside pointer-down while focus is in the panel returns focus to the season button.
  await openPanel(page);
  await expect(page.getByRole("radio", { name: "Summer" })).toBeFocused();
  await page.mouse.click(10, 10);
  await expect(page.locator("#season-panel")).toHaveCount(0);
  await expect(button).toBeFocused();
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
  // Type in-page and read Save one frame later: it must already be disabled, well inside the 300 ms debounce.
  const typed = await page.evaluate(async () => {
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Link or text"]')!;
    const t0 = performance.now();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, input.value + "x");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => requestAnimationFrame(r));
    return { saveDisabled: document.querySelector(".save")!.getAttribute("aria-disabled"), ms: performance.now() - t0 };
  });
  expect(typed.saveDisabled).toBe("true");
  expect(typed.ms).toBeLessThan(250);
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

// ---- random species and the day cycle ----
const scene = (page: Page) => page.getByRole("img", { name: /floating island/ });
const slider = (page: Page) => page.getByRole("slider", { name: "Time of day" });
const attr = (page: Page, a: string) => scene(page).getAttribute(a);
const setTime = (page: Page, v: number) => slider(page).fill(String(v));
async function grow(page: Page) {
  await page.getByRole("button", { name: "Grow the tree" }).click();
  await expect(scene(page)).toHaveAttribute("data-phase", "tree", { timeout: 20_000 });
}

test("each grow plants a different tree and species vary", async ({ page }) => {
  await ready(page);
  const species = new Set([await attr(page, "data-species")]);
  for (let i = 0; i < 3; i++) {
    const before = await attr(page, "data-tree-seed");
    await fold(page);
    await grow(page);
    expect(await attr(page, "data-tree-seed")).not.toBe(before);
    species.add(await attr(page, "data-species"));
  }
  expect(species.size).toBeGreaterThanOrEqual(2);
});

test("season, leaf colour and time never regrow the tree", async ({ page }) => {
  await ready(page);
  const seed = await attr(page, "data-tree-seed");
  await openPanel(page);
  await page.getByRole("radio", { name: "Autumn" }).click();
  await page.locator('button[aria-label^="Leaf colour"][aria-pressed="false"]').first().click();
  await setTime(page, 800);
  expect(await attr(page, "data-tree-seed")).toBe(seed);
  await fold(page);
  if (!(await page.locator("#season-panel").count())) await openPanel(page); // the fold click closes the panel
  await page.getByRole("radio", { name: "Winter" }).click();
  await page.locator('button[aria-label^="Leaf colour"][aria-pressed="false"]').first().click();
  await setTime(page, 100);
  await expect(chip(page)).toHaveText(VERDICT, { timeout: 20_000 });
  expect(await attr(page, "data-tree-seed")).toBe(seed);
});

test("the Time of day slider exists and ArrowRight changes its text", async ({ page }) => {
  await ready(page);
  await openPanel(page);
  await expect(slider(page)).toBeVisible();
  const before = await slider(page).getAttribute("aria-valuetext");
  await slider(page).focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider(page)).not.toHaveAttribute("aria-valuetext", before!);
});

// Fixed clock freezes Date only; rAF and timers keep running, so the scene still animates.
for (const [h, m, text] of [[14, 30, "Day, 14:30"], [3, 0, "Night, 23:00"]] as const) {
  test(`clock start: ${h}:${String(m).padStart(2, "0")} local reads ${text}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 26, h, m));
    await ready(page);
    await openPanel(page);
    await expect(slider(page)).toHaveAttribute("aria-valuetext", new RegExp(`^${text}`));
  });
}

for (const v of [0, 1000]) {
  test(`folds to a full verdict with the slider at ${v}`, async ({ page }) => {
    await ready(page);
    await openPanel(page);
    await setTime(page, v);
    await fold(page);
    await enabled(page);
  });
}

test("dragging time while folded disables Save until the new verdict", async ({ page }) => {
  await ready(page);
  await fold(page);
  await openPanel(page);
  await watchSave(page);
  await setTime(page, 1000);
  expect(await sawDisabled(page), "Save was disabled on drag").toBe(true);
  await expect(chip(page)).toHaveText(VERDICT, { timeout: 20_000 });
  await enabled(page);
});

test("the Night PNG has a neutral backdrop and still keeps finders and quiet zone", async ({ page }) => {
  await ready(page);
  await openPanel(page);
  await setTime(page, 1000);
  const { path, size } = await foldAndSave(page);
  const url = `data:image/png;base64,${readFileSync(path).toString("base64")}`;
  const corners = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    return [[0, 0], [img.width - 1, 0], [0, img.height - 1], [img.width - 1, img.height - 1]].map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)]);
  }, url);
  for (const px of corners) px.forEach((v, i) => expect(Math.abs(v - [0xec, 0xe8, 0xf2][i])).toBeLessThanOrEqual(6));
  await checkPng(page, path, size);
});

test("Winter at the Night end folds to a full verdict", async ({ page }) => {
  await ready(page);
  await openPanel(page);
  await page.getByRole("radio", { name: "Winter" }).click();
  await setTime(page, 1000);
  await fold(page);
});
