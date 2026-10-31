import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { generateMatrix, QUIET_ZONE, type QrMatrix } from "../src/lib/qr";
import { QR_IMAGE } from "../src/lib/qrImage";
import { scanFit, tooSmallToScan } from "../src/lib/scanFit";
import { saveBlockedReason } from "../src/lib/status";

const VERDICT = /^Scans( and opens \S+)?\. Never expires\./;
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
  expect(dl.suggestedFilename()).toBe("seedlink-qr.png");
});

// The saved file is drawn from the matrix: (size + 8) * 16 px square, ink on white, one 16 px square per module.
async function checkPng(page: Page, path: string, m: QrMatrix) {
  const M = QR_IMAGE.moduleSize, side = (m.size + 2 * QUIET_ZONE) * M;
  const url = `data:image/png;base64,${readFileSync(path).toString("base64")}`;
  const pts = [[0, 0], [side - 1, 0], [0, side - 1], [side - 1, side - 1]];
  for (let z = 0; z < m.size; z++) for (let x = 0; x < m.size; x++) pts.push([(x + QUIET_ZONE) * M + M / 2, (z + QUIET_ZONE) * M + M / 2]);
  const png = await page.evaluate(async ({ src, pts }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, img.width, img.height);
    const hex = ([x, y]: number[]) => "#" + [0, 1, 2].map((i) => data[(y * img.width + x) * 4 + i].toString(16).padStart(2, "0")).join("");
    return { w: img.width, h: img.height, px: pts.map(hex) };
  }, { src: url, pts });
  expect([png.w, png.h]).toEqual([side, side]);
  expect(png.px.slice(0, 4), "corners").toEqual(Array(4).fill(QR_IMAGE.background));
  const got = png.px.slice(4);
  // Finder rings on the module grid: dark border, light ring, dark 3x3 centre.
  for (const [fx, fz] of [[0, 0], [m.size - 7, 0], [0, m.size - 7]])
    for (let i = 0; i < 7; i++)
      for (let j = 0; j < 7; j++) {
        const ring = Math.max(Math.abs(i - 3), Math.abs(j - 3));
        expect(got[(fz + j) * m.size + fx + i], `finder module (${fx + i}, ${fz + j})`).toBe(ring === 2 ? QR_IMAGE.background : QR_IMAGE.ink);
      }
  const want = Array.from(m.cells, (c) => (c === 1 ? QR_IMAGE.ink : QR_IMAGE.background));
  expect(got.findIndex((c, i) => c !== want[i]), "first module centre that differs from the matrix").toBe(-1);
}

async function foldAndSave(page: Page) {
  await fold(page);
  const m = generateMatrix(await field(page).inputValue());
  // Every module centre was sampled and matched (the count lives on the scene, not in the hint).
  expect(await page.locator("[data-scan]").getAttribute("data-scan")).toBe(`${m.size * m.size}/${m.size * m.size}`);
  const [dl] = await Promise.all([page.waitForEvent("download"), save(page).click()]);
  return { path: (await dl.path())!, m };
}

test("the saved PNG is the plain code: finders on the grid and every module matching the matrix", async ({ page }) => {
  await ready(page);
  const { path, m } = await foldAndSave(page);
  await checkPng(page, path, m);
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

// ---- the link's tree and the day cycle ----
const scene = (page: Page) => page.getByRole("img", { name: /floating island/ });
const slider = (page: Page) => page.getByRole("slider", { name: "Time of day" });
const attr = (page: Page, a: string) => scene(page).getAttribute(a);
const setTime = (page: Page, v: number) => slider(page).fill(String(v));
async function grow(page: Page) {
  await page.getByRole("button", { name: "Grow the tree" }).click();
  await expect(scene(page)).toHaveAttribute("data-phase", "tree", { timeout: 20_000 });
}

test("the same link grows the same tree every time; another link grows another", async ({ page }) => {
  await ready(page);
  const tree = `${await attr(page, "data-species")}/${await attr(page, "data-tree-seed")}`;
  await fold(page);
  await grow(page);
  expect(`${await attr(page, "data-species")}/${await attr(page, "data-tree-seed")}`).toBe(tree);
  await page.reload();
  const [species, seed] = tree.split("/");
  await expect(scene(page)).toHaveAttribute("data-tree-seed", seed, { timeout: 30_000 });
  await expect(scene(page)).toHaveAttribute("data-species", species);
  await typeLink(page, "https://example.com/12");
  await expect(scene(page)).not.toHaveAttribute("data-tree-seed", seed);
});

test("season, leaf colour and time never regrow the tree", async ({ page }) => {
  await ready(page);
  const seed = await attr(page, "data-tree-seed");
  await openPanel(page);
  await page.getByRole("radio", { name: "Autumn" }).click();
  await page.locator('button[aria-label^="Leaf colour"][aria-pressed="false"]').first().click();
  await setTime(page, 800);
  // watch a short window so a regrow a frame or two late is still caught
  for (let i = 0; i < 5; i++) { expect(await attr(page, "data-tree-seed")).toBe(seed); await page.waitForTimeout(100); }
  await fold(page);
  if (!(await page.locator("#season-panel").count())) await openPanel(page); // the fold click closes the panel
  await page.getByRole("radio", { name: "Winter" }).click();
  await page.locator('button[aria-label^="Leaf colour"][aria-pressed="false"]').first().click();
  await setTime(page, 100);
  await expect(chip(page)).toHaveText(VERDICT, { timeout: 20_000 });
  expect(await attr(page, "data-tree-seed")).toBe(seed);
});

// Pinned to daytime: from 23:00 to 06:00 the slider starts at its Night end, where ArrowRight and 1000 change nothing.
const DAYTIME = new Date(2026, 9, 26, 14, 30);

test("the Time of day slider exists and ArrowRight changes its text", async ({ page }) => {
  await page.clock.setFixedTime(DAYTIME);
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
  await page.clock.setFixedTime(DAYTIME);
  await ready(page);
  await fold(page);
  await openPanel(page);
  await watchSave(page);
  await setTime(page, 1000);
  expect(await sawDisabled(page), "Save was disabled on drag").toBe(true);
  await expect(chip(page)).toHaveText(VERDICT, { timeout: 20_000 });
  await enabled(page);
});

test("the Night PNG is still the plain code on white", async ({ page }) => {
  await ready(page);
  await openPanel(page);
  await setTime(page, 1000);
  const { path, m } = await foldAndSave(page);
  await checkPng(page, path, m);
});

test("Winter at the Night end folds to a full verdict", async ({ page }) => {
  await ready(page);
  await openPanel(page);
  await page.getByRole("radio", { name: "Winter" }).click();
  await setTime(page, 1000);
  await fold(page);
});

// ---- fixed island scale, long links and seamless modules ----
/** A text whose code is exactly `size` modules (or the first at least that big, with `atLeast`). */
function linkOfSize(size: number, atLeast = false) {
  for (let n = 1; n < 3000; n++) {
    const text = "a".repeat(n); // a short URL prefix alone overflows a 21-module code at level H
    const s = generateMatrix(text).size;
    if (s === size || (atLeast && s > size)) return { text, size: s };
  }
  throw new Error(`no link of ${size} modules`);
}
/** Opens the page on a link's own address (?u=), the way a shared link arrives. */
async function openLink(page: Page, text: string) {
  await page.goto(`/?u=${encodeURIComponent(text)}`);
  await expect(chip(page)).toContainText("Tap the tree", { timeout: 30_000 });
  await expect(scene(page)).toHaveAttribute("data-species", /.+/); // the scene reports its tree a frame after mounting
}
async function typeLink(page: Page, text: string) {
  await field(page).fill(text);
  await expect(scene(page)).toHaveAttribute("aria-label", new RegExp(`"${text}"`), { timeout: 10_000 });
  await expect(chip(page)).toContainText("Tap the tree", { timeout: 30_000 });
}
/** The code's framing as the page measures it: the hint bar covers the bottom of <main>, CSS px. */
const chromeFrame = (page: Page) =>
  page.evaluate(() => {
    const main = document.querySelector("main")!;
    const bottom = Math.ceil(main.getBoundingClientRect().bottom - document.querySelector(".bar")!.getBoundingClientRect().top);
    return { w: main.clientWidth, h: main.clientHeight, bottom };
  });

test("the island is the same size on screen for a 21- and a 57-module link", async ({ browser }) => {
  // Each link grows its own tree and the fit follows the tree's height, so this allows the same 5% as the
  // per-species test below; each link opens from its own address (?u=) in a fresh context.
  const px: number[] = [];
  for (const size of [21, 57]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const { text } = linkOfSize(size);
    await page.goto(`/?u=${text}`);
    await expect(scene(page)).toHaveAttribute("aria-label", new RegExp(`"${text}"`), { timeout: 15_000 });
    await expect(chip(page)).toContainText("Tap the tree", { timeout: 30_000 });
    await expect(scene(page)).toHaveAttribute("data-phase", "tree", { timeout: 20_000 });
    await expect(scene(page)).toHaveAttribute("data-island-px", /\d/);
    px.push(Number(await attr(page, "data-island-px")));
    await ctx.close();
  }
  expect(px[0]).toBeGreaterThan(0);
  expect(Math.max(...px) / Math.min(...px), `island px ${px}`).toBeLessThanOrEqual(1.05);
});

test("a 101+ module link folds at 1440x900; at 390x844 the copy is what saveBlockedReason gives", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready(page);
  const { text, size } = linkOfSize(101, true);
  expect(size).toBeGreaterThanOrEqual(101);
  await typeLink(page, text);
  await fold(page);
  await enabled(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await chromeFrame(page)).w).toBe(390);
  const f = await chromeFrame(page);
  const tooSmall = tooSmallToScan(f.w, f.h, size + 2 * QUIET_ZONE, { top: 0, bottom: f.bottom });
  const pass = { matched: 1, total: 1, worstCaseContrast: 21, separated: true };
  const reason = saveBlockedReason({ hasCode: true, tooLong: false, tooSmall, phase: "folded", separation: pass, gradedNow: true, link: text });
  if (reason) {
    await expect(chip(page)).toHaveText(reason, { timeout: 20_000 });
    await expect(page.locator("#save-reason")).toHaveText(reason);
  } else {
    await expect(chip(page)).toHaveText(VERDICT, { timeout: 20_000 });
    await enabled(page);
  }
});

test("no seam between horizontally adjacent dark modules in the folded frame", async ({ page }) => {
  await ready(page);
  await fold(page);
  const m = generateMatrix(await field(page).inputValue());
  // The top-left finder's centre row: (2,3) and (3,3) are dark with dark all round, so a pixel or two of framing
  // error can't put a sample on a light module; only a gap between the two blocks would show between them.
  const [x0, z] = [2, 3];
  expect([m.cells[z * m.size + x0], m.cells[z * m.size + x0 + 1]]).toEqual([1, 1]);
  const f = await chromeFrame(page);
  const buf = await page.evaluate(() => {
    const c = document.querySelector("canvas")!;
    return { w: c.width, h: c.height, k: c.height / c.clientHeight };
  });
  // Module centre px = buffer centre + (x - mid) * pitch, + dy: the sampleScan geometry, insets in buffer px.
  const { zoom: pitch, dy } = scanFit(buf.w, buf.h, m.size + 2 * QUIET_ZONE, { top: 0, bottom: f.bottom * buf.k });
  const mid = (m.size - 1) / 2;
  const pts = [x0, x0 + 0.5, x0 + 1].map((x) => [Math.floor(buf.w / 2 + (x - mid) * pitch), Math.floor(buf.h / 2 + dy + (z - mid) * pitch)]);
  const lumas = await page.evaluate((pts) => {
    const canvas = document.querySelector("canvas")!;
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    const ctx = copy.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(canvas, 0, 0);
    return pts.map(([x, y]) => {
      const d = ctx.getImageData(x, y, 1, 1).data;
      return 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2];
    });
  }, pts);
  const [a, seam, b] = lumas;
  expect(Math.abs(seam - a), `lumas ${lumas}`).toBeLessThanOrEqual(10);
  expect(Math.abs(seam - b), `lumas ${lumas}`).toBeLessThanOrEqual(10);
});

test("at 390x844 the whole crown fits the viewport width for several species", async ({ browser }) => {
  const seen = new Set<string>();
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await openLink(page, `https://example.com/${seed}`); // each link picks its own species
    await expect(scene(page)).toHaveAttribute("data-phase", "tree", { timeout: 20_000 });
    const species = (await attr(page, "data-species"))!;
    seen.add(species);
    await expect(scene(page)).toHaveAttribute("data-crown-px", /\d/);
    const crown = Number(await attr(page, "data-crown-px"));
    expect(crown, `${species} (seed ${seed}) crown px`).toBeLessThanOrEqual(390);
    await ctx.close();
  }
  console.log("species covered:", [...seen].join(","));
  expect(seen.size).toBeGreaterThanOrEqual(3);
  expect([...seen]).toEqual(expect.arrayContaining(["oak", "willow"]));
});

test("the island keeps its size on screen whichever species grows", async ({ browser }) => {
  const px = new Map<string, number>();
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await openLink(page, `https://example.com/${seed}`); // each link picks its own species
    await expect(scene(page)).toHaveAttribute("data-island-px", /\d/);
    px.set(`${await attr(page, "data-species")} (seed ${seed})`, Number(await attr(page, "data-island-px")));
    await ctx.close();
  }
  const values = [...px.values()];
  expect(new Set([...px.keys()].map((k) => k.split(" ")[0])).size, `species ${[...px.keys()]}`).toBeGreaterThanOrEqual(3);
  expect(Math.max(...values) / Math.min(...values), `island px ${JSON.stringify(Object.fromEntries(px))}`).toBeLessThanOrEqual(1.05);
});

// Share: phones get the system share sheet, elsewhere the image goes to the clipboard. Stubs record what was sent.
type Sent = { name: string; type: string; size: number; text?: string };
const shareButton = (page: Page) => page.getByRole("button", { name: /^(Share|Copy) image$/ });
const sent = (page: Page) => page.evaluate(() => (window as unknown as { sent: Sent[] }).sent);

test("Share hands the system share sheet the same PNG Save downloads", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { sent: Sent[] };
    w.sent = [];
    Object.assign(navigator, {
      canShare: () => true,
      share: async (d: { files: File[]; text: string }) => void w.sent.push(...d.files.map((f) => ({ name: f.name, type: f.type, size: f.size, text: d.text }))),
    });
  });
  await ready(page);
  await expect(shareButton(page)).toHaveAccessibleName("Share image");
  await expect(shareButton(page)).toHaveAttribute("aria-disabled", "true");
  await shareButton(page).click({ force: true }); // aria-disabled: Playwright waits for enabled otherwise
  expect(await sent(page)).toEqual([]);
  await fold(page);
  await shareButton(page).click();
  await expect.poll(() => sent(page)).toHaveLength(1);
  const [dl] = await Promise.all([page.waitForEvent("download"), save(page).click()]);
  const [file] = await sent(page);
  expect(file).toEqual({ name: "seedlink-qr.png", type: "image/png", size: readFileSync((await dl.path())!).length, text: "https://example.com" });
});

test("without a share sheet, Share copies the image and says so", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { sent: Sent[] };
    w.sent = [];
    Object.assign(navigator, { canShare: undefined });
    Object.defineProperty(navigator, "clipboard", {
      value: { write: async (items: ClipboardItem[]) => void w.sent.push(...items.map((i) => ({ name: "", type: i.types.join(), size: 0 }))) },
    });
  });
  await ready(page);
  await expect(shareButton(page)).toHaveAccessibleName("Copy image");
  await fold(page);
  await shareButton(page).click();
  await expect.poll(() => sent(page)).toEqual([{ name: "", type: "image/png", size: 0 }]);
  await expect(chip(page)).toHaveText("Copied the QR image.");
  await expect(chip(page)).toHaveText(VERDICT, { timeout: 5_000 });
});

test("with neither share nor clipboard, there is no Share button", async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(navigator, { canShare: undefined });
    Object.defineProperty(navigator, "clipboard", { value: undefined });
  });
  await ready(page);
  await expect(shareButton(page)).toHaveCount(0);
});

// The address carries the link, so a Seedlink page can itself be shared.
test("opening ?u= grows that link's island straight away", async ({ page }) => {
  await page.goto("/?u=hello-seedlink");
  await expect(field(page)).toHaveValue("hello-seedlink");
  await expect(page.getByRole("img", { name: /"hello-seedlink"/ })).toBeVisible({ timeout: 15_000 });
  await expect(chip(page)).toContainText("Tap the tree to fold it into your code");
});

test("typing a link writes it to the address without adding history", async ({ page }) => {
  await ready(page);
  expect(new URL(page.url()).search).toBe("");
  const before = await page.evaluate(() => history.length);
  await field(page).fill("https://seed.link/a b");
  await expect.poll(() => new URL(page.url()).searchParams.get("u")).toBe("https://seed.link/a b");
  expect(await page.evaluate(() => history.length)).toBe(before);
  await field(page).fill("");
  await expect.poll(() => new URL(page.url()).search).toBe("");
});

test("a ?u= too long for one code shows the too-long state", async ({ page }) => {
  await page.goto(`/?u=${"a".repeat(3000)}`);
  await expect(field(page)).toHaveValue("a".repeat(3000));
  await expect(page.locator("#save-reason")).toHaveText(TOO_LONG, { timeout: 15_000 });
  await expect(chip(page)).toContainText(TOO_LONG);
});
