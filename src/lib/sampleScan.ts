import { QUIET_ZONE, type QrMatrix } from "./qr.ts";
import { NO_INSETS, scanFit, type ScanInsets } from "./scanFit.ts";
import { classifySeparation, type Separation } from "./verify.ts";

/** Module pitch in pixels of a w×h buffer under the SCAN camera (the same fit as the camera, insets included). */
export function scanPitch(width: number, height: number, size: number, insets: ScanInsets = NO_INSETS): number {
  return scanFit(width, height, size + QUIET_ZONE * 2, insets).zoom;
}

/**
 * Samples one pixel per module centre from an RGBA buffer. Grid column x runs right and row z runs
 * down from the pad centre, which sits `dy` pixels below the buffer centre (SCAN view: up = -z, right = +x).
 */
export function sampleBuffer(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  matrix: QrMatrix,
  pitch: number,
  dy = 0,
): Separation {
  const { cells, size } = matrix;
  const dark: number[] = [];
  const light: number[] = [];
  const mid = (size - 1) / 2;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const px = Math.floor(width / 2 + (x - mid) * pitch);
      const py = Math.floor(height / 2 + dy + (z - mid) * pitch);
      // Off-buffer is a failure, not a skipped sample: NaN makes classifySeparation fail safe.
      const i = px < 0 || py < 0 || px >= width || py >= height ? -1 : (py * width + px) * 4;
      const luma = i < 0 ? NaN : 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
      (cells[z * size + x] === 1 ? dark : light).push(luma);
    }
  }
  return classifySeparation(dark, light);
}

/**
 * Reads the rendered SCAN view (needs preserveDrawingBuffer) and checks dark/light modules separate.
 * `insets` are CSS pixels, as the camera framed them; they are scaled to drawing-buffer pixels here.
 */
export function sampleScan(canvas: HTMLCanvasElement, matrix: QrMatrix, insets: ScanInsets = NO_INSETS): Separation {
  const { width, height } = canvas; // drawing-buffer pixels, not CSS pixels
  const k = canvas.clientHeight > 0 ? height / canvas.clientHeight : 1;
  const scaled = { top: insets.top * k, bottom: insets.bottom * k };
  const copy = document.createElement("canvas");
  copy.width = width;
  copy.height = height;
  const ctx = copy.getContext("2d", { willReadFrequently: true });
  if (!ctx) return classifySeparation([], []);
  ctx.drawImage(canvas, 0, 0);
  const { data } = ctx.getImageData(0, 0, width, height);
  const fit = scanFit(width, height, matrix.size + QUIET_ZONE * 2, scaled);
  return sampleBuffer(data, width, height, matrix, fit.zoom, fit.dy);
}
