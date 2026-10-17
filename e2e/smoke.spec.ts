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

test("too-long input keeps the last working code on screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("textbox", { name: "Link or text" }).fill("x".repeat(3000));

  // Scoped to the <p>: Next's route announcer is also role="alert".
  await expect(page.locator('p[role="alert"]')).toContainText("Too long to fit");
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
