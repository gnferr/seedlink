import { expect, test, type Page } from "@playwright/test";

async function scanStatus(page: Page) {
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  const status = page.getByRole("status").filter({ hasText: /modules/ });
  await expect(status).toContainText(/^Scans/, { timeout: 10_000 });
  const m = /(\d+)\/(\d+) modules, ([\d.]+):1/.exec((await status.textContent()) ?? "");
  expect(m, "status text format").not.toBeNull();
  return { matched: +m![1], total: +m![2], contrast: +m![3] };
}

function expectClean(s: { matched: number; total: number; contrast: number }) {
  expect(s.total).toBeGreaterThan(0);
  expect(s.matched).toBe(s.total);
  expect(s.contrast).toBeGreaterThan(10);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });
});

test("every theme preset scans with every module matched", async ({ page }) => {
  const theme = page.getByLabel("Theme", { exact: true });
  const ids = await theme.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  expect(ids.length).toBeGreaterThan(1);
  for (const id of ids) {
    await page.getByRole("button", { name: "Explore", exact: true }).click();
    await theme.selectOption(id);
    expectClean(await scanStatus(page));
  }
});

for (const deg of [15, 60]) {
  test(`elevation ${deg} does not change the scan`, async ({ page }) => {
    await page.getByLabel("Reveal elevation", { exact: true }).fill(String(deg));
    await expect(page.getByLabel("Reveal elevation", { exact: true })).toHaveValue(String(deg));
    expectClean(await scanStatus(page));
  });
}

test("settled Scan pixels show the three finder patterns (independent of the app's verifier)", async ({ page }) => {
  await scanStatus(page);
  const ok = await page.locator("canvas").evaluate((c: HTMLCanvasElement) => {
    const src = document.createElement("canvas");
    src.width = c.width;
    src.height = c.height;
    const ctx = src.getContext("2d")!;
    ctx.drawImage(c, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    const lum = (x: number, y: number) => {
      const i = (y * width + x) * 4;
      return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    };
    // Bounding box of "dark" pixels = the code (the page background is light in the default theme).
    let x0 = width, y0 = height, x1 = 0, y1 = 0;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (lum(x, y) < 90) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    const size = Math.min(x1 - x0, y1 - y0) + 1;
    const mod = size / 29; // 29 modules: the default link; finder origins are 0 and 29-7=22
    const dark = (mx: number, my: number, ox: number, oy: number) =>
      lum(Math.round(x0 + (ox + mx + 0.5) * mod), Math.round(y0 + (oy + my + 0.5) * mod)) < 128;
    const finder = (ox: number, oy: number) => {
      for (let y = 0; y < 7; y++)
        for (let x = 0; x < 7; x++) {
          const ring = x === 0 || x === 6 || y === 0 || y === 6;
          const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
          if (dark(x, y, ox, oy) !== (ring || core)) return false;
        }
      return true;
    };
    return { size, tl: finder(0, 0), tr: finder(22, 0), bl: finder(0, 22) };
  });
  expect(ok.size).toBeGreaterThan(100);
  expect(ok).toMatchObject({ tl: true, tr: true, bl: true });
});
