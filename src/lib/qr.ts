import QRCode from "qrcode";

/** 4-module quiet zone, required by the QR spec for scanners to lock on. */
export const QUIET_ZONE = 4;

export type QrMatrix = {
  /** Row-major 0/1 grid, size x size. 1 = dark module. */
  cells: Uint8Array;
  size: number;
};

export function generateMatrix(input: string): QrMatrix {
  if (!input) throw new Error("QR input must not be empty");
  // "H" so the extruded geometry can lose some contrast and still scan.
  const qr = QRCode.create(input, { errorCorrectionLevel: "H" });
  return { cells: qr.modules.data as Uint8Array, size: qr.modules.size };
}
