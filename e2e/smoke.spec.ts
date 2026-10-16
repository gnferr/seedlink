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

test("control panel is reachable and labelled", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("img", { name: /QR code encoding/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Scan view" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await page.getByRole("button", { name: "Scan view" }).click();
  await expect(page.getByRole("button", { name: "Scan view" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("downloads a PNG of the scan view", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download PNG" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("voxel-qr.png");
});

test("too-long input keeps the last working code on screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("textbox").fill("x".repeat(3000));

  // Scoped to the <p>: Next's route announcer is also role="alert".
  await expect(page.locator('p[role="alert"]')).toContainText("Too long to fit");
  // The canvas must survive the error rather than being replaced by it.
  await expect(page.locator("canvas")).toBeVisible();
});
