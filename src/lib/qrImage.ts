import { INK } from "./palette.ts";
import { QUIET_ZONE, type QrMatrix } from "./qr.ts";

export const QR_IMAGE = { ink: INK, background: "#ffffff", moduleSize: 16 };

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** The Save image drawn straight from the matrix: ink on white, with the quiet zone. RGBA. */
export function qrPixels(m: QrMatrix, moduleSize = QR_IMAGE.moduleSize) {
  const width = (m.size + 2 * QUIET_ZONE) * moduleSize, height = width;
  const data = new Uint8ClampedArray(width * height * 4);
  const ink = rgb(QR_IMAGE.ink), bg = rgb(QR_IMAGE.background);
  for (let y = 0; y < height; y++) {
    const z = Math.floor(y / moduleSize) - QUIET_ZONE;
    for (let x = 0; x < width; x++) {
      const c = Math.floor(x / moduleSize) - QUIET_ZONE;
      const on = z >= 0 && c >= 0 && z < m.size && c < m.size && m.cells[z * m.size + c] === 1;
      data.set(on ? ink : bg, (y * width + x) * 4);
      data[(y * width + x) * 4 + 3] = 255;
    }
  }
  return { data, width, height };
}
