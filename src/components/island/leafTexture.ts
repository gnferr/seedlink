import * as THREE from "three";

const N = 16;
let texture: THREE.CanvasTexture | null = null;

/** One 16×16 cut-out pixel leaf, white so each card's instance colour tints it; the alpha only feeds alphaTest. */
export function leafTexture(): THREE.CanvasTexture {
  if (texture) return texture;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // u runs along the diagonal from the stem (bottom left) to the tip (top right), v across it.
      const px = (x + 0.5) / N, py = 1 - (y + 0.5) / N;
      const u = (px + py) / 2, v = (px - py) / Math.SQRT2;
      const blade = u > 0.12 && u < 0.97 && Math.abs(v) < 0.3 * Math.sin(Math.PI * ((u - 0.12) / 0.85)) ** 0.8;
      const stem = u <= 0.12 && u > 0.02 && Math.abs(v) < 0.04;
      if (blade || stem) ctx.fillRect(x, y, 1, 1);
    }
  }
  texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
