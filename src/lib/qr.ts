import QRCode from "qrcode";

/** 4-module quiet zone, required by the QR spec for scanners to lock on. */
export const QUIET_ZONE = 4;

export type QrMatrix = {
  /** Row-major 0/1 grid, size x size. 1 = dark module. */
  cells: Uint8Array;
  size: number;
};

export function generateMatrix(input: string): QrMatrix {
  // "H" so the extruded geometry can lose some contrast and still scan.
  const qr = QRCode.create(input || " ", { errorCorrectionLevel: "H" });
  return { cells: qr.modules.data as Uint8Array, size: qr.modules.size };
}

/**
 * Deterministic 0..1 value per module, so heights stay stable across
 * re-renders instead of jittering on every frame.
 */
export function moduleNoise(x: number, z: number): number {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

export function moduleHeight(
  x: number,
  z: number,
  min: number,
  max: number,
): number {
  return min + moduleNoise(x, z) * (max - min);
}
