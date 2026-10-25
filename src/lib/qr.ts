import QRCode from "qrcode";

/** 4-module quiet zone, required by the QR spec for scanners to lock on. */
export const QUIET_ZONE = 4;

export type QrMatrix = {
  /** Row-major 0/1 grid, size x size. 1 = dark module. */
  cells: Uint8Array;
  size: number;
};

/** True inside one of the three 7x7 finder patterns (top-left, top-right, bottom-left). */
export function isFinder(x: number, z: number, size: number): boolean {
  const near = (v: number) => v < 7;
  const far = (v: number) => v >= size - 7;
  return (near(x) && near(z)) || (far(x) && near(z)) || (near(x) && far(z));
}

/** A dark module with its grid position and its slab-centred world position (x, z). */
export type DarkModule = { col: number; row: number; x: number; z: number };

/** Every dark module, row-major, centred on the slab so (0, 0) is the middle. */
export function darkModules(m: QrMatrix): DarkModule[] {
  const half = (m.size - 1) / 2;
  const out: DarkModule[] = [];
  for (let row = 0; row < m.size; row++) {
    for (let col = 0; col < m.size; col++) {
      if (m.cells[row * m.size + col] === 1) {
        out.push({ col, row, x: col - half, z: row - half });
      }
    }
  }
  return out;
}

export function generateMatrix(input: string): QrMatrix {
  if (!input) throw new Error("QR input must not be empty");
  // "H" so the extruded geometry can lose some contrast and still scan.
  const qr = QRCode.create(input, { errorCorrectionLevel: "H" });
  return { cells: qr.modules.data as Uint8Array, size: qr.modules.size };
}
