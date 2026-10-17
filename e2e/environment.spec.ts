import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { seasonColour } from "../src/lib/seasons";

type View = "EXPLORE" | "REVEAL" | "SCAN";
const SEASON_NAMES = { SUMMER: "Summer", AUTUMN: "Autumn", WINTER: "Winter", SPRING: "Spring" } as const;
const SEASONS = Object.keys(SEASON_NAMES) as (keyof typeof SEASON_NAMES)[];
const EXPORTS = ["PNG (scan)", ".glb model", "PNG (reveal)"];

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });
}

const captureCanvas = (page: Page): Promise<string> =>
  page.locator("canvas").evaluate((c: HTMLCanvasElement) => c.toDataURL("image/png"));

const settled = (page: Page, view: View) =>
  expect(page.locator(`[role="img"][data-view="${view}"][data-settled="true"]`)).toBeAttached({ timeout: 10_000 });

const view = (page: Page, v: View) =>
  page.getByRole("button", { name: { EXPLORE: "Explore", REVEAL: "Reveal", SCAN: "Scan" }[v], exact: true }).click();
const season = (page: Page, s: keyof typeof SEASON_NAMES) => page.getByRole("radio", { name: SEASON_NAMES[s] }).click();
const breeze = (page: Page) => page.getByRole("switch", { name: "Breeze" });
const status = (page: Page) => page.getByRole("status").filter({ hasText: /Scans|Won't scan|Checking|Not checked|No code/ });

async function scanOk(page: Page) {
  await expect(status(page)).toContainText(/^Scans/, { timeout: 10_000 });
  const m = /(\d+)\/(\d+) modules, ([\d.]+):1/.exec((await status(page).textContent()) ?? "");
  expect(m, "status text format").not.toBeNull();
  return { matched: +m![1], total: +m![2], contrast: +m![3] };
}

async function goScan(page: Page) {
  await view(page, "SCAN");
  await settled(page, "SCAN");
  return scanOk(page);
}

// Reads the canvas through a 2D copy, in the page, so only small results cross the wire.
const readCanvas = <R, A>(page: Page, fn: (d: { w: number; h: number; data: Uint8ClampedArray }, a: A) => R, arg: A) =>
  page.locator("canvas").evaluate(
    (c: HTMLCanvasElement, [src, a]) => {
      const k = document.createElement("canvas");
      k.width = c.width;
      k.height = c.height;
      const g = k.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(c, 0, 0);
      const d = { w: c.width, h: c.height, data: g.getImageData(0, 0, c.width, c.height).data };
      return (0, eval)(`(${src})`)(d, a);
    },
    [fn.toString(), arg] as const,
  );

/** Canvas-relative CSS coordinates of a lit canopy pixel (green-dominant), nearest the centroid of all of them. */
async function findPixel(page: Page) {
  const box = (await page.locator("canvas").boundingBox())!;
  const r = await page.locator("canvas").evaluate((c: HTMLCanvasElement) => {
    const k = document.createElement("canvas");
    k.width = c.width;
    k.height = c.height;
    const g = k.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(c, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const hits: number[] = [];
    for (let i = 0; i < d.length; i += 4) if (d[i + 1] > d[i] + 20 && d[i + 1] > d[i + 2] + 20 && d[i + 1] > 90) hits.push(i / 4);
    if (!hits.length) return null;
    let cx = 0, cy = 0;
    for (const p of hits) { cx += p % c.width; cy += Math.floor(p / c.width); }
    cx /= hits.length; cy /= hits.length;
    let best = hits[0], bd = Infinity;
    for (const p of hits) {
      const dd = (p % c.width - cx) ** 2 + (Math.floor(p / c.width) - cy) ** 2;
      if (dd < bd) { bd = dd; best = p; }
    }
    return { x: (best % c.width) * (c.clientWidth / c.width), y: Math.floor(best / c.width) * (c.clientHeight / c.height) };
  });
  expect(r, "a canopy pixel in the frame").not.toBeNull();
  return { x: box.x + r!.x, y: box.y + r!.y };
}

/** Fraction of pixels in the central square (the plane) in a flat mid-tone region: neither dark nor light, and not a one-pixel antialiased edge between the two. */
const midToneFraction = (page: Page) =>
  readCanvas(page, ({ w, h, data }) => {
    const side = Math.floor(Math.min(w, h) * 0.7);
    const x0 = Math.floor((w - side) / 2), y0 = Math.floor((h - side) / 2);
    const mid = (x: number, y: number) => {
      const i = (y * w + x) * 4;
      const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      return l > 80 && l < 180;
    };
    let n = 0;
    for (let y = y0 + 1; y < y0 + side - 1; y++)
      for (let x = x0 + 1; x < x0 + side - 1; x++)
        if (mid(x, y) && mid(x - 1, y) && mid(x + 1, y) && mid(x, y - 1) && mid(x, y + 1)) n++;
    return n / (side * side);
  }, null);

// A sky pixel near the top-left corner: the background colour, which is what the season grades.
const corner = (page: Page) => readCanvas(page, ({ data }) => Array.from(data.slice(16, 20)).join(","), null);
async function cornerStable(page: Page) {
  let prev = await corner(page);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(250);
    const cur = await corner(page);
    if (cur === prev) return cur;
    prev = cur;
  }
  throw new Error("sky never stopped changing");
}

/** Orbit damping glides for a few seconds after a drag; wait until two frames 400 ms apart match. */
async function rest(page: Page) {
  let prev = await captureCanvas(page);
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(400);
    const cur = await captureCanvas(page);
    if (cur === prev) return;
    prev = cur;
  }
  throw new Error("the orbit never came to rest");
}

async function orbitAway(page: Page) {
  const box = (await page.locator("canvas").boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy + 60, { steps: 10 });
  await page.mouse.up();
}

test("E1 — the Scan frame is byte-identical across all four seasons, breeze on and off", async ({ page }) => {
  await ready(page);
  const frames = new Map<string, string>();
  for (const s of SEASONS)
    for (const on of [true, false]) {
      await view(page, "EXPLORE");
      await season(page, s);
      if ((await breeze(page).getAttribute("aria-checked")) !== String(on)) await breeze(page).click();
      await goScan(page);
      frames.set(`${s}/${on ? "breeze" : "still"}`, await captureCanvas(page));
    }
  const [first, ...rest] = [...frames.entries()];
  for (const [k, f] of rest) expect(f === first[1], `${k} differs from ${first[0]}`).toBe(true);
});

test("E2 — Reveal and Scan are still frames, even right after a shake", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Shake" }).click();
  await view(page, "REVEAL");
  await settled(page, "REVEAL");
  const a = await captureCanvas(page);
  await page.waitForTimeout(500);
  expect(await captureCanvas(page)).toBe(a);

  await view(page, "EXPLORE");
  await page.getByRole("button", { name: "Shake" }).click();
  await view(page, "SCAN");
  await settled(page, "SCAN");
  const b = await captureCanvas(page);
  await page.waitForTimeout(500);
  expect(await captureCanvas(page)).toBe(b);
});

for (const s of SEASONS)
  test(`E3 — the Scan frame has only dark and light populations in ${s}`, async ({ page }) => {
    await ready(page);
    await season(page, s);
    const r = await goScan(page);
    expect(r.matched).toBe(r.total);
    expect(r.contrast).toBeGreaterThan(10);
    expect(await midToneFraction(page)).toBeLessThan(0.02);
  });

test("thrash — rapid view, season and shake changes never grade a moving frame", async ({ page }) => {
  await ready(page);
  const bad = async () => expect(status(page)).not.toContainText("Won't scan");
  const steps = [
    () => view(page, "SCAN"),
    () => view(page, "EXPLORE"),
    () => page.getByRole("button", { name: "Shake" }).click(),
    () => view(page, "SCAN"),
    () => season(page, "WINTER"),
    () => view(page, "SCAN"),
  ];
  for (const step of steps) {
    await step();
    await bad();
    await page.waitForTimeout(150);
  }
  for (let t = 0; t < 30; t++) {
    await bad();
    await page.waitForTimeout(100);
  }
  await settled(page, "SCAN");
  await expect(status(page)).toContainText(/^Scans/, { timeout: 10_000 });
});

test("the season dial inside Scan changes nothing", async ({ page }) => {
  await ready(page);
  await goScan(page);
  const a = await captureCanvas(page);
  for (const s of SEASONS) {
    await season(page, s);
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(400);
  expect(await captureCanvas(page) === a, "frame changed").toBe(true);
  await expect(status(page)).toContainText(/^Scans/);
});

test("E5 — reduced motion: no particles or sway, instant season", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await orbitAway(page);
  await rest(page);
  const a = await captureCanvas(page);
  await page.waitForTimeout(500);
  expect(await captureCanvas(page) === a, "Explore moves under reduced motion").toBe(true);

  await season(page, "WINTER");
  await page.waitForTimeout(50);
  const w1 = await captureCanvas(page);
  await page.waitForTimeout(100);
  expect(await captureCanvas(page) === w1, "season sweep still in flight").toBe(true);
  expect(w1 !== a, "season did not apply").toBe(true);

  await expect(breeze(page)).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("button", { name: "Shake" })).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByText(/Breeze is off while motion is reduced\./)).toBeVisible();
  await expect(page.getByText(/Shake is off while motion is reduced\./)).toBeVisible();
});

test("E6 — a poke shakes in Explore and does nothing in Reveal or Scan", async ({ page }) => {
  await ready(page);
  await settled(page, "EXPLORE");
  const at = await findPixel(page);
  const before = await captureCanvas(page);
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(150);
  expect(await captureCanvas(page) !== before, "poke did not move the frame").toBe(true);

  await view(page, "REVEAL");
  await settled(page, "REVEAL");
  const rAt = await findPixel(page);
  const r = await captureCanvas(page);
  await page.mouse.click(rAt.x, rAt.y);
  await page.waitForTimeout(300);
  expect(await captureCanvas(page) === r, "poke moved Reveal").toBe(true);

  await goScan(page);
  const box = (await page.locator("canvas").boundingBox())!;
  const s = await captureCanvas(page);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
  expect(await captureCanvas(page) === s, "poke moved Scan").toBe(true);
});

test("the app opens aligned and wakes when you orbit away", async ({ page }) => {
  await ready(page);
  await page.waitForTimeout(1500);
  const a = await captureCanvas(page);
  await page.waitForTimeout(500);
  expect(await captureCanvas(page) === a, "aligned Explore moves").toBe(true);

  await orbitAway(page);
  await page.waitForTimeout(1000);
  const b = await captureCanvas(page);
  await page.waitForTimeout(500);
  expect(await captureCanvas(page) !== b, "orbited Explore is not alive").toBe(true);
});

test("E9 — no shader errors across a season cycle and all three views", async ({ page }) => {
  const bad: string[] = [];
  page.on("console", (m) => {
    // THREE.* counts only as an error; its deprecation warnings (THREE.Clock) are not shader failures.
    if (/WebGLProgram|Program Info Log/.test(m.text()) || (m.type() === "error" && /THREE\./.test(m.text()))) bad.push(m.text());
  });
  page.on("pageerror", (e) => bad.push(String(e)));
  await ready(page);
  for (const s of [...SEASONS, "SUMMER" as const]) {
    await season(page, s);
    await page.waitForTimeout(400);
  }
  await view(page, "REVEAL");
  await settled(page, "REVEAL");
  await goScan(page);
  await view(page, "EXPLORE");
  await settled(page, "EXPLORE");
  await page.waitForTimeout(500);
  expect(bad).toEqual([]);
});

test("E10 — the Reveal PNG is identical with breeze on and off", async ({ page }) => {
  await ready(page);
  const bytes: Buffer[] = [];
  for (const on of [true, false]) {
    await view(page, "EXPLORE");
    if ((await breeze(page).getAttribute("aria-checked")) !== String(on)) await breeze(page).click();
    await goScan(page);
    await view(page, "REVEAL");
    await settled(page, "REVEAL");
    const btn = page.getByRole("button", { name: "PNG (reveal)" });
    await expect(btn).toHaveAttribute("aria-disabled", "false", { timeout: 5_000 });
    const [dl] = await Promise.all([page.waitForEvent("download"), btn.click()]);
    bytes.push(readFileSync((await dl.path())!));
  }
  expect(bytes[0].length).toBeGreaterThan(1000);
  expect(bytes[0].equals(bytes[1]), "Reveal PNG bytes differ").toBe(true);
});

test("E11 — the .glb carries the active season's palette", async ({ page }) => {
  await ready(page);
  const summerCanopy = await page.getByRole("textbox", { name: "Canopy", exact: true }).inputValue();
  await season(page, "AUTUMN");
  await goScan(page);
  const glb = page.getByRole("button", { name: ".glb model" });
  await expect(glb).toHaveAttribute("aria-disabled", "false");
  const [dl] = await Promise.all([page.waitForEvent("download"), glb.click()]);
  const buf = readFileSync((await dl.path())!);
  expect(buf.toString("ascii", 0, 4)).toBe("glTF");
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString("utf8", 20, 20 + jsonLen));
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const want = (hex: string) => [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  const has = (hex: string) =>
    json.materials.some((m: { pbrMetallicRoughness: { baseColorFactor: number[] } }) =>
      want(hex).every((v, i) => Math.abs(m.pbrMetallicRoughness.baseColorFactor[i] - v) < 0.01),
    );
  const autumn = seasonColour(summerCanopy, "canopy", "AUTUMN");
  expect(autumn).not.toBe(summerCanopy);
  expect(has(autumn), `autumn canopy ${autumn} in glb`).toBe(true);
  expect(has(summerCanopy), "summer canopy leaked into glb").toBe(false);
});

test("E12 — a weak palette blocks every export under every season", async ({ page }) => {
  await ready(page);
  await page.getByRole("textbox", { name: "Base", exact: true }).fill("#3b4536");
  for (const s of SEASONS) {
    await season(page, s);
    for (const name of EXPORTS) await expect(page.getByRole("button", { name })).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText(/Export blocked\./)).toBeVisible();
  }
  await view(page, "SCAN");
  await expect(status(page)).toContainText(/^Won't scan/, { timeout: 10_000 });
  for (const s of SEASONS) {
    await season(page, s);
    for (const name of EXPORTS) await expect(page.getByRole("button", { name })).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText(/Export blocked\. This code won't scan/)).toBeVisible();
  }
});

test("a 1000-character link still scans in every season with particles on", async ({ page }) => {
  test.setTimeout(120_000); // a 161-module code is heavy to solve and render, four times over
  await ready(page);
  await page.getByRole("textbox", { name: "Link or text" }).fill("https://example.com/" + "a".repeat(980));
  await expect(page.getByText("1000 characters")).toBeVisible();
  for (const s of SEASONS) {
    await view(page, "EXPLORE");
    await season(page, s);
    const r = await goScan(page);
    expect(r.matched, s).toBe(r.total);
  }
});

test("losing the WebGL context blocks export until the scan re-verifies", async ({ page }) => {
  await ready(page);
  await goScan(page);
  const png = page.getByRole("button", { name: "PNG (scan)" });
  await expect(png).toHaveAttribute("aria-disabled", "false");
  const has = await page.locator("canvas").evaluate((c: HTMLCanvasElement) => {
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    const ext = gl?.getExtension("WEBGL_lose_context");
    if (!ext) return false;
    (window as unknown as { __lose: WEBGL_lose_context }).__lose = ext;
    ext.loseContext();
    return true;
  });
  test.skip(!has, "WEBGL_lose_context is unavailable in this browser");
  await expect(png).toHaveAttribute("aria-disabled", "true");
  await page.evaluate(() => (window as unknown as { __lose: WEBGL_lose_context }).__lose.restoreContext());
  await expect(status(page)).toContainText(/^Scans/, { timeout: 15_000 });
  await expect(png).toHaveAttribute("aria-disabled", "false", { timeout: 15_000 });
});

test("remount shows the current season", async ({ page }) => {
  await ready(page);
  await view(page, "REVEAL");
  await settled(page, "REVEAL");
  const summer = await cornerStable(page);
  await season(page, "WINTER");
  await expect.poll(() => corner(page), { timeout: 5_000 }).not.toBe(summer);
  const winter = await cornerStable(page);

  const input = page.getByRole("textbox", { name: "Link or text" });
  await input.fill("");
  await expect(page.locator("canvas")).toHaveCount(0);
  await input.fill("https://example.com/remount");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });
  await view(page, "REVEAL");
  await settled(page, "REVEAL");
  const again = await cornerStable(page);
  expect(again, "remounted sky is Summer").not.toBe(summer);
  expect(again).toBe(winter);
});

test("Shake works with Breeze off", async ({ page }) => {
  await ready(page);
  await breeze(page).click();
  await expect(breeze(page)).toHaveAttribute("aria-checked", "false");
  const shake = page.getByRole("button", { name: "Shake" });
  await expect(shake).not.toHaveAttribute("aria-disabled", "true");
  await page.waitForTimeout(500);
  const a = await captureCanvas(page);
  await shake.click();
  await page.waitForTimeout(150);
  expect(await captureCanvas(page) !== a, "Shake did nothing with Breeze off").toBe(true);
});

test("hotkeys 1/2/3 switch views and are ignored while typing in the link field", async ({ page }) => {
  await ready(page);
  const img = page.locator('[role="img"][data-view]');
  await page.keyboard.press("2");
  await expect(img).toHaveAttribute("data-view", "REVEAL");
  await page.keyboard.press("3");
  await expect(img).toHaveAttribute("data-view", "SCAN");
  await page.keyboard.press("1");
  await expect(img).toHaveAttribute("data-view", "EXPLORE");

  await page.getByRole("textbox", { name: "Link or text" }).click();
  await page.keyboard.press("3");
  await page.waitForTimeout(400);
  await expect(img).toHaveAttribute("data-view", "EXPLORE");
});

test("first Reveal frame is still", async ({ page }) => {
  await ready(page);
  await orbitAway(page);
  await page.waitForTimeout(500);
  // Armed before the click: grabs the canvas in the same task in which data-settled flips true.
  const first = page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const el = document.querySelector('[role="img"]')!;
        const grab = () => {
          if (el.getAttribute("data-view") === "REVEAL" && el.getAttribute("data-settled") === "true") {
            obs.disconnect();
            resolve(document.querySelector("canvas")!.toDataURL("image/png"));
          }
        };
        const obs = new MutationObserver(grab);
        obs.observe(el, { attributes: true });
        (window as unknown as { __armed: boolean }).__armed = true;
      }),
  );
  await page.waitForFunction(() => (window as unknown as { __armed?: boolean }).__armed);
  await view(page, "REVEAL");
  const atSettle = await first;
  await page.waitForTimeout(500);
  const later = await captureCanvas(page);
  await page.waitForTimeout(500);
  expect(later === atSettle, "frame at settle differs from the frame 500 ms later").toBe(true);
  expect((await captureCanvas(page)) === later, "Reveal keeps moving").toBe(true);
});
