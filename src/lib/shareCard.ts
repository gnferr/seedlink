import { QUIET_ZONE, type QrMatrix } from "./qr.ts";
import { qrPixels } from "./qrImage.ts";

/** A 4:5 post: the garden fills the card, the name top left, the plain code bottom right. */
export const CARD = { width: 1080, height: 1350, qrBox: 420, margin: 48 };

/** Where the code sits on the card: whole pixels per module, quiet zone included, bottom-right corner. */
export function cardQrLayout(size: number) {
  const pitch = Math.max(2, Math.floor(CARD.qrBox / (size + 2 * QUIET_ZONE)));
  const side = (size + 2 * QUIET_ZONE) * pitch;
  return { pitch, side, x: CARD.width - CARD.margin - side, y: CARD.height - CARD.margin - side };
}

const MOON = "#f3ecd2", FIREFLY = "#ffd27a", PLATE = "rgb(28 26 58 / .85)", FRAME = "rgb(243 236 210 / .35)";

/** A glass plate like the app's: a light frame around a dark inner panel. */
function plate(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  c.fillStyle = FRAME;
  c.fillRect(x, y, w, h);
  c.fillStyle = PLATE;
  c.fillRect(x + 8, y + 8, w - 16, h - 16);
}

/**
 * Draws the card. `garden` is the scene as it was when the tree folded (null: a plain night panel). The code is
 * drawn from the matrix pixel for pixel, so the caller can check the very pixels that leave.
 */
export function drawShareCard(
  garden: CanvasImageSource & { width: number; height: number } | null,
  matrix: QrMatrix,
  words: { name: string; grown: string; scan: [string, string] },
  font: string,
): HTMLCanvasElement {
  const { width: W, height: H, margin: M } = CARD;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d", { willReadFrequently: true })!;
  c.imageSmoothingEnabled = false; // the scene is pixel art; keep it crisp when scaled up
  c.fillStyle = "#1c1a3a";
  c.fillRect(0, 0, W, H);
  if (garden && garden.width > 0) {
    // Cover the card with the island lifted clear of the code; a wide screen also moves a little closer, since its
    // island sits in a band of sky that a phone's tall screen doesn't have.
    const s = Math.max(W / garden.width, H / garden.height) * (garden.width > garden.height ? 1.25 : 1);
    c.drawImage(garden, (W - garden.width * s) / 2, (H - garden.height * s) / 2 - 120, garden.width * s, garden.height * s);
  }

  c.textBaseline = "alphabetic";
  c.font = `64px ${font}`;
  const nameW = c.measureText(words.name).width;
  c.font = `32px ${font}`;
  const grownW = c.measureText(words.grown).width;
  plate(c, M - 8, M - 8, Math.min(W - 2 * M, Math.max(nameW, grownW) + 72), 170);
  c.fillStyle = FIREFLY;
  c.font = `64px ${font}`;
  c.fillText(words.name, M + 28, M + 72, W - 2 * M - 56);
  c.fillStyle = MOON;
  c.font = `32px ${font}`;
  c.fillText(words.grown, M + 28, M + 124, W - 2 * M - 56);

  const q = cardQrLayout(matrix.size);
  c.fillStyle = FRAME;
  c.fillRect(q.x - 12, q.y - 12, q.side + 24, q.side + 24);
  const img = qrPixels(matrix, q.pitch);
  c.putImageData(new ImageData(img.data, img.width, img.height), q.x, q.y);

  const textW = q.x - 2 * M + 8;
  plate(c, M - 8, H - M - 210, textW, 210);
  c.fillStyle = MOON;
  c.font = `40px ${font}`;
  c.fillText(words.scan[0], M + 28, H - M - 130, textW - 56);
  c.fillText(words.scan[1], M + 28, H - M - 80, textW - 56);
  c.fillStyle = "rgb(243 236 210 / .7)";
  c.font = `28px ${font}`;
  c.fillText("seedlink · never expires", M + 28, H - M - 32, textW - 56);
  return canvas;
}
