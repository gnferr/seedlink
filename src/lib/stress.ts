import jsQR from "jsqr";

/**
 * Buffer pixels per module in the stressed copy: roughly what a phone camera gets from a code across a desk. At 3 the
 * folded render of a 101-module code already fails (its modules land on uneven whole pixels) while the flat export
 * still reads, so 3 would refuse codes phones read fine.
 */
export const STRESS_PITCH = 4;

/**
 * A grey copy shrunk to about STRESS_PITCH pixels per module by area averaging, then softened by a 3x3 box blur, so
 * thin gaps and glows that a sharp render hides can merge the way they do in a blurry photo. RGBA.
 */
export function stressCopy(rgba: Uint8ClampedArray, width: number, height: number, pitch: number) {
  const k = Math.min(1, STRESS_PITCH / pitch);
  const w = Math.max(1, Math.floor(width * k)), h = Math.max(1, Math.floor(height * k));
  const sum = new Float32Array(w * h), n = new Uint32Array(w * h);
  for (let y = 0; y < height; y++) {
    const row = Math.min(h - 1, Math.floor(y * k)) * w;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4, j = row + Math.min(w - 1, Math.floor(x * k));
      sum[j] += 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
      n[j]++;
    }
  }
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy < 0 || xx < 0 || yy >= h || xx >= w) continue;
          s += sum[yy * w + xx] / n[yy * w + xx];
          c++;
        }
      const o = (y * w + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = s / c;
      data[o + 3] = 255;
    }
  return { data, width: w, height: h };
}

/** What a real decoder reads from the stressed copy, or null. Inverted codes are not tried: phone scanners don't by default. */
export function stressDecode(rgba: Uint8ClampedArray, width: number, height: number, pitch: number): string | null {
  const s = stressCopy(rgba, width, height, pitch);
  return jsQR(s.data, s.width, s.height, { inversionAttempts: "dontInvert" })?.data ?? null;
}
