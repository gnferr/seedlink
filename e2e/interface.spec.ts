import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });
}

// Computed colours/outlines are interpolated while a CSS transition runs; wait until none are in flight.
async function settled(page: Page) {
  await page.waitForFunction(async () => {
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)));
    return document.getAnimations().length === 0;
  }, undefined, { timeout: 5_000 });
}

test("the page never scrolls at phone size", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const o = await page.evaluate(() => ({
    v: document.documentElement.scrollHeight - window.innerHeight,
    h: document.documentElement.scrollWidth - window.innerWidth,
  }));
  expect(o).toEqual({ v: 0, h: 0 });
});

test("every control is reachable by keyboard with a visible focus ring", async ({ page }) => {
  await ready(page);
  const controls = "input, select, button, textarea, a[href], [tabindex]:not([tabindex='-1'])";
  const total = await page.locator(controls).evaluateAll((els) => els.filter((e) => (e as HTMLElement).tabIndex >= 0).length);
  expect(total).toBeGreaterThan(8);

  const seen = new Set<string>();
  const bad: string[] = [];
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < total + 3; i++) {
    await page.keyboard.press("Tab");
    await settled(page);
    const r = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const name = `${el.tagName.toLowerCase()}#${el.id || el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 20)}`;
      return { name, ring: cs.outlineStyle !== "none" && cs.outlineWidth !== "0px", inPage: el.matches("input, select, button, textarea, a[href]") };
    });
    if (!r || !r.inPage) continue;
    seen.add(r.name);
    if (!r.ring) bad.push(r.name);
  }
  expect(bad, "controls focused without an outline").toEqual([]);
  // A radiogroup is one Tab stop, so count visible controls that are in the tab order. Next's dev-only indicator (#next-logo) is not the app.
  const expected = await page
    .locator("input, select, button:not(#next-logo)")
    .evaluateAll((els) => els.filter((e) => (e as HTMLElement).tabIndex >= 0 && (e as HTMLElement).getClientRects().length > 0).length);
  expect([...seen].length, [...seen].join(" | ")).toBe(expected);
  expect([...seen].some((n) => n.includes("Summer")), "season dial reached").toBe(true);
});

// Test-local helper (ruling C2): WCAG contrast of every visible text node in the control panel
// against the effective painted background (ancestors composited until opaque).
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
    const root = document.querySelector('section[aria-label="Controls"]')!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.textContent?.trim() && n.parentElement) els.add(n.parentElement);
    }
    root.querySelectorAll("input:not([type=range]):not([type=color]), select").forEach((e) => els.add(e));
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

for (const scheme of ["light", "dark"] as const) {
  test(`text clears 4.5:1 in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await ready(page);
    // Cover the disabled-export and Scan-status states too.
    await page.getByRole("button", { name: "Scan", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: /modules/ })).toContainText(/^Scans/, { timeout: 10_000 });
    await settled(page);
    const w = await worstTextContrast(page);
    console.log(`worst ${scheme}: ${w.ratio.toFixed(2)}:1 ${w.desc}`);
    expect(w.ratio, w.desc).toBeGreaterThanOrEqual(4.5);
  });
}

test("reduced motion: Scan resolves without the tween", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /modules/ })).toContainText(/^Scans/, { timeout: 1000 });
});
