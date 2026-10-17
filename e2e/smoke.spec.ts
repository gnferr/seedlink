import { expect, test } from "@playwright/test";

test("renders the 3D QR canvas with real pixels", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Voxel QR/);

  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 15_000 });

  // WebGL can mount a canvas and still draw nothing; a blank buffer encodes to a tiny PNG.
  const encodedLength = await canvas.evaluate(
    (el: HTMLCanvasElement) => el.toDataURL("image/png").length,
  );
  expect(encodedLength).toBeGreaterThan(1000);
});

test("view buttons are reachable and their pressed state follows the view", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("img", { name: /3D QR code for/ })).toBeVisible();
  const explore = page.getByRole("button", { name: "Explore", exact: true });
  const scan = page.getByRole("button", { name: "Scan", exact: true });
  await expect(explore).toHaveAttribute("aria-pressed", "true");
  await expect(scan).toHaveAttribute("aria-pressed", "false");

  await scan.click();
  await expect(scan).toHaveAttribute("aria-pressed", "true");
  await expect(explore).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("img", { name: /top-down scan view/ })).toBeVisible();
});

test("scan view verifies the default link scans", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /modules/ })).toContainText(/^Scans/, {
    timeout: 10_000,
  });
});

test("leaving Scan and returning mid-tween never grades a moving frame", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });
  const scan = page.getByRole("button", { name: "Scan", exact: true });
  const status = page.getByRole("status").filter({ hasText: /modules|Checking/ });

  await scan.click();
  await expect(status).toContainText(/^Scans/, { timeout: 10_000 });

  // Round trip inside the 1.2 s tween: the camera key returns to the settled one while moving.
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await page.waitForTimeout(400);
  await scan.click();
  for (let t = 0; t < 30; t++) {
    await expect(status).not.toContainText("Won't scan");
    await page.waitForTimeout(100);
  }
  await expect(status).toContainText(/^Scans/);
});

test("too-long input keeps the last working code on screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("textbox", { name: "Link or text" }).fill("x".repeat(3000));

  // By role, so the test proves the banner is exposed (filtered past Next's route announcer).
  await expect(page.getByRole("alert").filter({ hasText: "Too long to fit" })).toBeVisible();
  // The canvas must survive the error rather than being replaced by it.
  await expect(page.locator("canvas")).toBeVisible();
});

test("an empty field shows an empty state instead of a code", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("textbox", { name: "Link or text" }).fill("");
  await expect(page.getByText("Type or paste a link to build your object.")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
});

test("exports download from a verified Scan, and are blocked when the code won't scan", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });
  const png = page.getByRole("button", { name: "PNG (scan)" });
  const glb = page.getByRole("button", { name: ".glb model" });

  // Not in Scan yet: refused, with the fix in text.
  await expect(png).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByText(/Export blocked\. Open Scan/)).toBeVisible();

  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /modules/ })).toContainText(/^Scans/, { timeout: 10_000 });
  await expect(png).toHaveAttribute("aria-disabled", "false");

  const [pngDl] = await Promise.all([page.waitForEvent("download"), png.click()]);
  expect(pngDl.suggestedFilename()).toBe("voxel-qr.png");
  const [glbDl] = await Promise.all([page.waitForEvent("download"), glb.click()]);
  expect(glbDl.suggestedFilename()).toBe("voxel-qr.glb");

  // Base colour equal to the scan colour removes all separation (Scan draws colorScan on Base).
  await page.getByRole("textbox", { name: "Base", exact: true }).fill("#1d2618");
  await expect(page.getByRole("status").filter({ hasText: /modules/ })).toContainText(/^Won't scan/, { timeout: 10_000 });
  await expect(png).toHaveAttribute("aria-disabled", "true");
  await expect(glb).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByText(/Export blocked\. This code won't scan\. Change the Base colour/)).toBeVisible();
});
