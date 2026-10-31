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

/** The smallest print width that still scans reliably: half a millimetre per module, quiet zone included, never under 2 cm. */
export function minPrintCm(m: QrMatrix): number {
  return Math.max(2, Math.ceil((m.size + 2 * QUIET_ZONE) * 0.5) / 10);
}

/** The print file: ink modules as one path on the white square, quiet zone included, sized to its minimum print width. */
export function qrSvg(m: QrMatrix): string {
  const n = m.size + 2 * QUIET_ZONE, cm = minPrintCm(m);
  let d = "";
  for (let z = 0; z < m.size; z++) {
    // Runs of ink along a row become one rectangle each, so the file stays small.
    for (let c = 0; c < m.size; ) {
      if (m.cells[z * m.size + c] !== 1) { c++; continue; }
      let e = c;
      while (e < m.size && m.cells[z * m.size + e] === 1) e++;
      d += `M${c + QUIET_ZONE} ${z + QUIET_ZONE}h${e - c}v1h-${e - c}z`;
      c = e;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${cm}cm" height="${cm}cm" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">`
    + `<rect width="${n}" height="${n}" fill="${QR_IMAGE.background}"/><path d="${d}" fill="${QR_IMAGE.ink}"/></svg>`;
}
